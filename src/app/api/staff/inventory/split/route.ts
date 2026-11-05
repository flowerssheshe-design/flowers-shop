import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaff } from "@/lib/staff/guard";
import { canDecideDistribution } from "@/lib/staff/work/distribution";
import { ensureBusinessWeek } from "@/lib/staff/owner/data";
import { checkPercents } from "@/lib/staff/ops/stall-split";
import { loadStallSplit, lockStalls, splitPayload, unlockStalls } from "@/lib/staff/ops/stall-split-server";
import { jsonError, notConfigured, parseBody, serverError } from "@/lib/staff/ops/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const guard = await requireStaff("inventory");
  if (!guard.ok) return guard.response;
  const nc = notConfigured();
  if (nc) return nc;
  try {
    const state = await loadStallSplit(createAdminClient());
    return NextResponse.json({ ...splitPayload(state), canEdit: canDecideDistribution(guard.session.employee) });
  } catch (e) {
    return serverError(e, "split GET");
  }
}

const PutSchema = z.object({
  mode: z.enum(["count", "percent"]),
  percents: z.record(z.string().uuid(), z.number().min(0).max(100)).optional(),
});

/** Managers choose how the stock is split: a number per stall, or percents. */
export async function PUT(req: Request) {
  const guard = await requireStaff("inventory", canDecideDistribution);
  if (!guard.ok) return guard.response;
  const nc = notConfigured();
  if (nc) return nc;
  const body = await parseBody(req, PutSchema);
  if (!body.ok) return body.response;

  try {
    const admin = createAdminClient();
    const state = await loadStallSplit(admin);
    if (state.lockedAt) return jsonError("החלוקה כבר ננעלה לשבוע הזה. אפשר לפתוח אותה מחדש בכפתור למטה.", 409);
    const percents = body.data.percents ?? state.percents;
    const bad = checkPercents(percents);
    if (bad) return jsonError(bad, 400);
    await ensureBusinessWeek(admin, state.week.weekStart, state.week.supplierOrderAt);
    const { error } = await admin
      .from("business_weeks")
      .update({ stall_split_mode: body.data.mode, stall_split_percents: percents })
      .eq("week_start", state.week.weekStart);
    if (error) return serverError(error, "split PUT");
    return NextResponse.json(splitPayload(await loadStallSplit(admin)));
  } catch (e) {
    return serverError(e, "split PUT");
  }
}

const LockSchema = z.object({ locked: z.boolean() });

/**
 * Lock now (the stock goes to the stalls and stops moving between them) or
 * open it again. It also locks by itself on Thursday evening.
 */
export async function POST(req: Request) {
  const guard = await requireStaff("inventory", canDecideDistribution);
  if (!guard.ok) return guard.response;
  const nc = notConfigured();
  if (nc) return nc;
  const body = await parseBody(req, LockSchema);
  if (!body.ok) return body.response;

  try {
    const admin = createAdminClient();
    if (body.data.locked) await lockStalls(admin);
    else await unlockStalls(admin);
    return NextResponse.json(splitPayload(await loadStallSplit(admin, { autoLock: false })));
  } catch (e) {
    return serverError(e, "split lock");
  }
}
