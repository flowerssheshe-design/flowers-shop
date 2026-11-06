import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaff } from "@/lib/staff/guard";
import { canDecideDistribution } from "@/lib/staff/work/distribution";
import { loadStallSplit } from "@/lib/staff/ops/stall-split-server";
import { jsonError, notConfigured, parseBody, serverError } from "@/lib/staff/ops/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const Body = z.object({
  product_id: z.string().uuid(),
  stall_id: z.string().uuid(),
  /** How many of this bouquet the stall gets this week, pickup orders there included. */
  qty: z.number().int().min(0).max(10_000),
});

/**
 * "A number per stall" split: sets how many of a bouquet a stall gets. Nothing
 * moves out of the website stock; website pickup orders at this stall come
 * out of this number. Not possible once the split is locked.
 */
export async function PUT(req: Request) {
  const guard = await requireStaff("inventory", canDecideDistribution);
  if (!guard.ok) return guard.response;
  const nc = notConfigured();
  if (nc) return nc;
  const body = await parseBody(req, Body);
  if (!body.ok) return body.response;
  const { product_id, stall_id, qty } = body.data;

  try {
    const admin = createAdminClient();
    const state = await loadStallSplit(admin);
    if (state.lockedAt) return jsonError("החלוקה כבר ננעלה. הזרים כבר בדוכנים ולא עוברים ביניהם.", 409);
    if (!state.stalls.some((s) => s.id === stall_id)) return jsonError("הדוכן לא פעיל", 404);
    const p = state.split.get(product_id);
    if (!p) return jsonError("הזר לא נמצא", 404);

    // Free stock this stall can take: the general stock minus what the other stalls hold.
    const others = state.stalls
      .filter((s) => s.id !== stall_id)
      .reduce((sum, s) => sum + Math.max(0, (state.plan.get(s.id)?.get(product_id) ?? 0) - (p.pickups[s.id] ?? 0)), 0);
    const maxForStall = Math.max(0, p.live - others) + (p.pickups[stall_id] ?? 0);
    if (qty > maxForStall) {
      return jsonError(`אין מספיק במלאי. לדוכן הזה אפשר עד ${maxForStall} (כולל ${p.pickups[stall_id] ?? 0} הזמנות לאיסוף).`, 409);
    }

    const { error } = await admin
      .from("stall_plan")
      .upsert(
        { week_start: state.week.weekStart, stall_id, product_id, qty, updated_at: new Date().toISOString() },
        { onConflict: "week_start,stall_id,product_id" },
      );
    if (error) return serverError(error, "stall plan PUT");
    return NextResponse.json({ qty, max: maxForStall });
  } catch (e) {
    return serverError(e, "stall plan PUT");
  }
}
