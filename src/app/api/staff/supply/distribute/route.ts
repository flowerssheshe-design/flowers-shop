import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStaff } from "@/lib/staff/guard";
import {
  DISTRIBUTION_FORBIDDEN,
  canDecideDistribution,
  validateDistribution,
  type DistributionProduct,
} from "@/lib/staff/work/distribution";
import { runWithRollback, StepError, type Step } from "@/lib/staff/work/rollback";
import { jsonError, parseBody, stallAdjust, workContext, type Admin } from "@/lib/staff/work/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const Body = z.object({
  stall_id: z.string().uuid(),
  items: z
    .array(z.object({ product_id: z.string().uuid(), qty: z.number().int().min(0).max(10000) }))
    .min(1)
    .max(200),
});

async function addInitialStock(admin: Admin, stallId: string, productId: string, delta: number) {
  const { data, error } = await admin
    .from("stall_inventory")
    .select("initial_stock")
    .eq("stall_id", stallId)
    .eq("product_id", productId)
    .single();
  if (error || !data) throw error ?? new Error("stall_inventory row missing");
  const next = Math.max(0, (Number(data.initial_stock) || 0) + delta);
  const { error: updErr } = await admin
    .from("stall_inventory")
    .update({ initial_stock: next })
    .eq("stall_id", stallId)
    .eq("product_id", productId);
  if (updErr) throw updErr;
}

/**
 * Morning distribution (owners and ops managers only): moves flowers from the general stock to a stall.
 * Per product: general stock − qty (atomic, never below zero), stall stock +
 * qty, stall initial_stock + qty, and a log row. Any failure undoes all of it.
 */
export async function POST(req: Request) {
  const guard = await requireStaff("supply");
  if (!guard.ok) return guard.response;
  const me = guard.session.employee;
  // The manager decides the distribution; pickup workers only see it.
  if (!canDecideDistribution(me)) return jsonError(DISTRIBUTION_FORBIDDEN, 403);

  const body = await parseBody(req, Body);
  if (!body.ok) return body.response;
  const { stall_id, items: input } = body.data;

  try {
    const { admin, today } = await workContext();

    const { data: stall, error: stallErr } = await admin
      .from("stalls")
      .select("id, name, is_active")
      .eq("id", stall_id)
      .maybeSingle();
    if (stallErr) return jsonError("לא הצלחנו לטעון את הדוכן", 500);
    if (!stall || !stall.is_active) return jsonError("הדוכן לא נמצא או לא פעיל", 404);

    const ids = Array.from(new Set(input.map((i) => i.product_id)));
    const [prodRes, invRes] = await Promise.all([
      admin.from("products").select("id, title").in("id", ids),
      admin.from("inventory").select("product_id, live_stock_count").in("product_id", ids),
    ]);
    if (prodRes.error || invRes.error) return jsonError("לא הצלחנו לטעון את המלאי", 500);
    const stockBy = new Map((invRes.data ?? []).map((r) => [String(r.product_id), Number(r.live_stock_count) || 0]));
    const products = new Map<string, DistributionProduct>(
      (prodRes.data ?? []).map((p) => [
        String(p.id),
        { id: String(p.id), title: String(p.title), stock: stockBy.get(String(p.id)) ?? null },
      ]),
    );

    const checked = validateDistribution(input, products);
    if (!checked.ok) return jsonError(checked.error, 409);

    let logIds: string[] = [];
    const steps: Step[] = [];
    for (const item of checked.items) {
      steps.push({
        run: async () => {
          const { data, error } = await admin.rpc("decrement_inventory", {
            p_product_id: item.product_id,
            p_qty: item.qty,
          });
          if (error) throw error;
          if (data === null || data === undefined) {
            throw new StepError(`אין מספיק "${item.title}" במלאי הכללי. רעננו ונסו שוב.`, 409);
          }
        },
        undo: async () => {
          const { error } = await admin.rpc("increment_inventory", {
            p_product_id: item.product_id,
            p_qty: item.qty,
          });
          if (error) throw error;
        },
      });
      steps.push({
        run: async () => {
          const after = await stallAdjust(admin, stall_id, item.product_id, item.qty);
          if (after === null) throw new StepError("עדכון מלאי הדוכן נכשל. נסו שוב.", 500);
        },
        undo: async () => {
          const after = await stallAdjust(admin, stall_id, item.product_id, -item.qty);
          if (after === null) throw new Error(`could not take back stall stock of ${item.product_id}`);
        },
      });
      steps.push({
        run: () => addInitialStock(admin, stall_id, item.product_id, item.qty),
        undo: () => addInitialStock(admin, stall_id, item.product_id, -item.qty),
      });
    }
    steps.push({
      run: async () => {
        const { data, error } = await admin
          .from("stall_distributions")
          .insert(
            checked.items.map((i) => ({
              stall_id,
              product_id: i.product_id,
              qty: i.qty,
              employee_id: me.id,
              work_date: today,
            })),
          )
          .select("id");
        if (error) throw error;
        logIds = (data ?? []).map((r) => String(r.id));
      },
      undo: async () => {
        if (logIds.length) await admin.from("stall_distributions").delete().in("id", logIds);
      },
    });

    const result = await runWithRollback(steps);
    if (!result.ok) {
      if (result.undoFailures > 0) {
        console.error("distribution rollback incomplete:", { stall_id, items: checked.items, error: result.error });
      }
      if (result.error instanceof StepError) return jsonError(result.error.message, result.error.status);
      console.error("distribution failed:", result.error);
      return jsonError("שמירת החלוקה נכשלה ולא נשמר כלום. נסו שוב.", 500);
    }
    return NextResponse.json({ ok: true, items: checked.items }, { status: 201 });
  } catch (e) {
    console.error("staff/supply/distribute failed:", e);
    return jsonError("שגיאת שרת. נסו שוב.", 500);
  }
}
