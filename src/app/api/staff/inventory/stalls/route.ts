import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaff } from "@/lib/staff/guard";
import { getServerSettings } from "@/lib/settings-server";
import { addDays, currentBusinessWeek } from "@/lib/staff/week";
import { stallAdjust } from "@/lib/staff/work/server";
import { jsonError, notConfigured, parseBody, serverError } from "@/lib/staff/ops/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const Body = z.object({
  product_id: z.string().uuid(),
  stall_id: z.string().uuid(),
  /** How many of this bouquet the stall gets for Friday (the new total). */
  qty: z.number().int().min(0).max(10_000),
});

/**
 * The shift manager (or an owner) splits the stock between the stalls for
 * Friday, any day of the week. Setting a stall's quantity moves the difference
 * between the general stock (what the website can still sell) and the stall.
 */
export async function PUT(req: Request) {
  const guard = await requireStaff("inventory", (w) => w.role === "owner" || w.role === "ops_manager" || (w.roles ?? []).some((r) => r === "owner" || r === "ops_manager"));
  if (!guard.ok) return guard.response;
  const nc = notConfigured();
  if (nc) return nc;
  const body = await parseBody(req, Body);
  if (!body.ok) return body.response;
  const { product_id, stall_id, qty } = body.data;

  try {
    const admin = createAdminClient();
    const [stallRes, curRes, invRes] = await Promise.all([
      admin.from("stalls").select("id, is_active").eq("id", stall_id).maybeSingle(),
      admin.from("stall_inventory").select("stock, initial_stock").eq("stall_id", stall_id).eq("product_id", product_id).maybeSingle(),
      admin.from("inventory").select("live_stock_count").eq("product_id", product_id).maybeSingle(),
    ]);
    if (stallRes.error || curRes.error || invRes.error) {
      return serverError(stallRes.error ?? curRes.error ?? invRes.error, "stall stock load");
    }
    if (!stallRes.data?.is_active) return jsonError("הדוכן לא פעיל", 404);

    const current = Number(curRes.data?.stock) || 0;
    const delta = qty - current;
    if (delta === 0) return NextResponse.json({ stock: current, live: Number(invRes.data?.live_stock_count) || 0 });

    if (delta > 0) {
      // From the general stock to the stall.
      const live = Number(invRes.data?.live_stock_count) || 0;
      if (live < delta) {
        return jsonError(`אין מספיק במלאי הכללי: נשארו ${live}. אפשר להוסיף עד ${current + live} לדוכן.`, 409);
      }
      const { data: after, error: decErr } = await admin.rpc("decrement_inventory", { p_product_id: product_id, p_qty: delta });
      if (decErr || after === null || after === undefined) return jsonError("אין מספיק במלאי הכללי", 409);
      try {
        const stallAfter = await stallAdjust(admin, stall_id, product_id, delta);
        if (stallAfter === null) throw new Error("stall adjust failed");
      } catch (e) {
        await admin.rpc("increment_inventory", { p_product_id: product_id, p_qty: delta });
        return serverError(e, "stall stock add");
      }
    } else {
      // Back from the stall to the general stock (only what wasn't sold yet).
      const stallAfter = await stallAdjust(admin, stall_id, product_id, delta);
      if (stallAfter === null) return jsonError("אי אפשר להוריד יותר ממה שנשאר בדוכן", 409);
      const { error: incErr } = await admin.rpc("increment_inventory", { p_product_id: product_id, p_qty: -delta });
      if (incErr) {
        await stallAdjust(admin, stall_id, product_id, -delta);
        return serverError(incErr, "stall stock return");
      }
    }

    // Keep "how much the stall started with" in line with the plan.
    const initial = Math.max(0, (Number(curRes.data?.initial_stock) || 0) + delta);
    await admin.from("stall_inventory").update({ initial_stock: initial }).eq("stall_id", stall_id).eq("product_id", product_id);

    if (delta > 0) {
      const settings = await getServerSettings();
      const friday = addDays(currentBusinessWeek(settings).weekStart, 5);
      await admin.from("stall_distributions").insert({
        stall_id,
        product_id,
        qty: delta,
        employee_id: guard.session.employee.id,
        work_date: friday,
      });
    }

    const { data: inv } = await admin.from("inventory").select("live_stock_count").eq("product_id", product_id).maybeSingle();
    return NextResponse.json({ stock: qty, live: Number(inv?.live_stock_count) || 0 });
  } catch (e) {
    return serverError(e, "stall stock PUT");
  }
}
