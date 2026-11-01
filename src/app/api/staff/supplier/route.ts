import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaff } from "@/lib/staff/guard";

import {
  autoMarkSupplierOrderIfDue,
  loadSupplierState,
  markSupplierOrderSent,
  saveSupplierLines,
  serializeSupplierState,
} from "@/lib/staff/owner/supplier-server";
import { badRequest, notConfigured, readJson, serverError } from "@/lib/staff/owner/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LinesSchema = z
  .array(
    z.object({
      product_id: z.string().uuid(),
      /** "extra": pre-orders + amount. "total": a fixed total (at least the pre-orders). */
      mode: z.enum(["extra", "total"]).default("extra"),
      /** The extra, or the total, depending on the mode. */
      extra_qty: z.number().int().min(0).max(100000),
    }),
  )
  .max(500);

const PutSchema = z.object({ lines: LinesSchema });
const PostSchema = z.object({ action: z.literal("send"), lines: LinesSchema.optional() });

export async function GET() {
  const guard = await requireStaff("supplier");
  if (!guard.ok) return guard.response;
  const nc = notConfigured();
  if (nc) return nc;
  try {
    const admin = createAdminClient();
    await autoMarkSupplierOrderIfDue(admin);
    const state = await loadSupplierState(admin);
    return NextResponse.json(serializeSupplierState(state));
  } catch (e) {
    return serverError("supplier", e);
  }
}

/** Save the quantities (before the order is sent). */
export async function PUT(req: Request) {
  const guard = await requireStaff("supplier");
  if (!guard.ok) return guard.response;
  const nc = notConfigured();
  if (nc) return nc;
  const parsed = PutSchema.safeParse(await readJson(req));
  if (!parsed.success) return badRequest("הכמויות לא תקינות. מספרים שלמים מ-0 ומעלה בלבד.");
  try {
    const admin = createAdminClient();
    const state = await loadSupplierState(admin);
    if (state.supplierOrderedAt) {
      return NextResponse.json({ error: "ההזמנה לספק כבר נשלחה השבוע, ואי אפשר לשנות אותה כאן." }, { status: 409 });
    }
    await saveSupplierLines(admin, state.week.weekStart, parsed.data.lines, state.preorders);
    return NextResponse.json(serializeSupplierState(await loadSupplierState(admin)));
  } catch (e) {
    return serverError("supplier", e);
  }
}

/**
 * "ההזמנה נשלחה לספק": saves the lines, marks the week as ordered (once) and
 * sets the global live stock to final − pre-ordered for every product.
 */
export async function POST(req: Request) {
  const guard = await requireStaff("supplier");
  if (!guard.ok) return guard.response;
  const nc = notConfigured();
  if (nc) return nc;
  const parsed = PostSchema.safeParse(await readJson(req));
  if (!parsed.success) return badRequest("הבקשה לא תקינה.");
  try {
    const res = await markSupplierOrderSent(createAdminClient(), parsed.data.lines);
    if (!res.ok) return NextResponse.json({ error: "ההזמנה לספק כבר סומנה כנשלחה." }, { status: 409 });
    return NextResponse.json(serializeSupplierState(res.state));
  } catch (e) {
    return serverError("supplier", e);
  }
}

/**
 * "ביטול השליחה": the week goes back to "not sent yet" and the stock goes
 * back to exactly what it was before the send. Quantities can then be edited
 * and the order sent again.
 */
export async function DELETE() {
  const guard = await requireStaff("supplier");
  if (!guard.ok) return guard.response;
  const nc = notConfigured();
  if (nc) return nc;
  try {
    const admin = createAdminClient();
    const state = await loadSupplierState(admin);
    if (!state.supplierOrderedAt) {
      return NextResponse.json({ error: "ההזמנה לספק עוד לא סומנה כנשלחה." }, { status: 409 });
    }

    const { data: week } = await admin
      .from("business_weeks")
      .select("stock_before_order")
      .eq("week_start", state.week.weekStart)
      .maybeSingle();
    const snapshot = (week as { stock_before_order?: unknown } | null)?.stock_before_order;
    const now = new Date().toISOString();

    // Restore the copy taken when it was sent. Sends from before this feature
    // have no copy: the stock was empty then (the new week starts at 0).
    const before = new Map<string, { live: number; initial: number }>();
    if (Array.isArray(snapshot)) {
      for (const r of snapshot as { product_id: string; live_stock_count: number; initial_stock_count: number | null }[]) {
        before.set(String(r.product_id), { live: Number(r.live_stock_count) || 0, initial: Number(r.initial_stock_count) || 0 });
      }
    }
    const restore = state.lines.map((l) => {
      const b = before.get(l.product_id) ?? { live: 0, initial: 0 };
      return { product_id: l.product_id, live_stock_count: b.live, initial_stock_count: b.initial, updated_at: now };
    });
    if (restore.length > 0) {
      const { error } = await admin.from("inventory").upsert(restore, { onConflict: "product_id" });
      if (error) throw new Error(`inventory: ${error.message}`);
    }

    const reset = await admin
      .from("business_weeks")
      .update({ supplier_ordered_at: null, stock_before_order: null })
      .eq("week_start", state.week.weekStart);
    if (reset.error) {
      // Before migration 041 there is no copy column.
      const { error } = await admin.from("business_weeks").update({ supplier_ordered_at: null }).eq("week_start", state.week.weekStart);
      if (error) throw new Error(`business_weeks: ${error.message}`);
    }
    return NextResponse.json(serializeSupplierState(await loadSupplierState(admin)));
  } catch (e) {
    return serverError("supplier undo", e);
  }
}
