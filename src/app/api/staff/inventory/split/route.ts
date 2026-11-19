import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaff } from "@/lib/staff/guard";
import { canDecideDistribution } from "@/lib/staff/work/distribution";
import { ensureBusinessWeek } from "@/lib/staff/owner/data";
import { checkDistribution, lockedMoves, planRows } from "@/lib/staff/ops/stall-split";
import { applyStallMoves, loadStallSplit, lockStalls, splitPayload, unlockStalls } from "@/lib/staff/ops/stall-split-server";
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
  /** productId → stallId → how many free bouquets the stall gets (the orders taken from it come on top). */
  distribution: z.record(z.string().uuid(), z.record(z.string().uuid(), z.number().int().min(0).max(10_000))),
  /** After the lock: the numbers the manager saw, so only their changes are applied. */
  seen: z.record(z.string().uuid(), z.record(z.string().uuid(), z.number().int().min(0).max(10_000))).optional(),
});

/** Managers save the whole split at once: how many of each bouquet every stall gets. */
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
    const dist = body.data.distribution;
    if (state.lockedAt) return moveLockedStock(admin, state, dist, body.data.seen);
    const products = state.products.map((p) => ({ id: p.id, title: p.title, live: state.split.get(p.id)?.live ?? 0 }));
    const bad = checkDistribution(dist, products, state.stalls.map((s) => s.id));
    if (bad) return jsonError(bad, 409);

    // The orders taken from each stall right now (pickup or delivery from there).
    const pickups = new Map<string, Map<string, number>>();
    for (const [pid, s] of Array.from(state.split.entries())) {
      for (const [sid, n] of Object.entries(s.pickups)) {
        const inner = pickups.get(sid) ?? new Map<string, number>();
        inner.set(pid, n);
        pickups.set(sid, inner);
      }
    }
    const at = new Date().toISOString();
    const rows = planRows(dist, pickups).map((r) => ({ ...r, week_start: state.week.weekStart, updated_at: at }));
    await ensureBusinessWeek(admin, state.week.weekStart, state.week.supplierOrderAt);
    if (rows.length > 0) {
      const { error } = await admin.from("stall_plan").upsert(rows, { onConflict: "week_start,stall_id,product_id" });
      if (error) return serverError(error, "split PUT plan");
    }
    const { error } = await admin
      .from("business_weeks")
      .update({ stall_split_mode: "count" })
      .eq("week_start", state.week.weekStart);
    if (error) return serverError(error, "split PUT");
    return NextResponse.json(splitPayload(await loadStallSplit(admin)));
  } catch (e) {
    return serverError(e, "split PUT");
  }
}

type SplitState = Awaited<ReturnType<typeof loadStallSplit>>;

/**
 * After the lock the bouquets are already at the stalls: a change moves them
 * between stalls (or takes more from what no stall holds). Each change is
 * applied relative to what the manager saw, atomically per stall, so a sale
 * made meanwhile is never lost. If one step fails, the rest is undone.
 */
async function moveLockedStock(
  admin: ReturnType<typeof createAdminClient>,
  state: SplitState,
  want: Record<string, Record<string, number>>,
  seen: Record<string, Record<string, number>> | undefined,
) {
  if (!seen) return jsonError("רעננו את הדף ונסו שוב.", 409);
  const stallIds = new Set(state.stalls.map((s) => s.id));
  for (const row of Object.values(want)) {
    if (Object.keys(row).some((sid) => !stallIds.has(sid))) return jsonError("אחד הדוכנים כבר לא פעיל. רעננו את הדף ונסו שוב.", 409);
  }
  const products = state.products.map((p) => ({ id: p.id, title: p.title, undistributed: state.split.get(p.id)?.undistributed ?? 0 }));
  const plan = lockedMoves(seen, want, products);
  if (!plan.ok) return jsonError(plan.error, 409);

  const titleOf = new Map(state.products.map((p) => [p.id, p.title]));
  const res = await applyStallMoves(admin, plan.moves);
  if (!res.ok) {
    const m = res.failed;
    const stall = state.stalls.find((s) => s.id === m.stall_id)?.name ?? "הדוכן";
    return jsonError(`ב${stall} כבר אין מספיק "${titleOf.get(m.product_id) ?? "זר"}" (אולי נמכר בינתיים). רעננו ונסו שוב.`, 409);
  }
  return NextResponse.json(splitPayload(await loadStallSplit(admin)));
}

const LockSchema = z.object({ locked: z.boolean() });

/**
 * Lock now (the stock goes to the stalls and stops moving between them) or
 * open it again. Nothing locks by itself.
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
    return NextResponse.json(splitPayload(await loadStallSplit(admin)));
  } catch (e) {
    return serverError(e, "split lock");
  }
}
