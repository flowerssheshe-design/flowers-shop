import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getServerSettings } from "@/lib/settings-server";
import { currentBusinessWeek, type BusinessWeek } from "@/lib/staff/week";
import { weekWindow } from "./week-math";
import { ensureBusinessWeek, loadBusinessWeeks, loadOrders, loadProducts, loadSupplierLines } from "./data";
import {
  buildSupplierWhatsApp,
  computeSupplierLines,
  finalQtyFor,
  liveStockFor,
  preorderQuantities,
  type OrderMode,
  type SupplierLine,
} from "./supplier";

type Admin = ReturnType<typeof createAdminClient>;

export type SupplierState = {
  week: BusinessWeek;
  supplierOrderedAt: string | null;
  lines: SupplierLine[];
  preorders: Map<string, number>;
  message: string;
};

/** Everything the supplier screen needs for the current week. Creates the week row if missing. */
export async function loadSupplierState(admin: Admin, now: Date = new Date()): Promise<SupplierState> {
  const settings = await getServerSettings();
  const week = currentBusinessWeek(settings, now);
  await ensureBusinessWeek(admin, week.weekStart, week.supplierOrderAt);
  const win = weekWindow(week, settings);
  const [products, orders, saved, bw] = await Promise.all([
    loadProducts(admin),
    loadOrders(admin, win.from, win.to),
    loadSupplierLines(admin, [week.weekStart]),
    loadBusinessWeeks(admin, [week.weekStart]),
  ]);
  const supplierOrderedAt = bw[0]?.supplier_ordered_at ?? null;
  const preorders = preorderQuantities(orders);
  const lines = computeSupplierLines(products, preorders, saved, Boolean(supplierOrderedAt));
  return {
    week,
    supplierOrderedAt,
    lines,
    preorders,
    message: buildSupplierWhatsApp(lines, week.weekStart, week.weekEnd),
  };
}

export type SupplierLineInput = { product_id: string; mode: OrderMode; extra_qty: number };

/** Saves the week's lines; "to order" is always worked out from the mode and number. */
export async function saveSupplierLines(
  admin: Admin,
  weekStart: string,
  lines: SupplierLineInput[],
  preorders: Map<string, number>,
): Promise<void> {
  if (lines.length === 0) return;
  const now = new Date().toISOString();
  const rows = lines.map((l) => {
    const pre = preorders.get(l.product_id) ?? 0;
    return {
      week_start: weekStart,
      product_id: l.product_id,
      preorder_qty: pre,
      order_mode: l.mode,
      extra_qty: l.extra_qty,
      final_qty: finalQtyFor(l.mode, l.extra_qty, pre),
      updated_at: now,
    };
  });
  let { error } = await admin.from("supplier_order_lines").upsert(rows, { onConflict: "week_start,product_id" });
  if (error && /order_mode/.test(error.message)) {
    // Before migration 042: only the "extra" way can be stored.
    ({ error } = await admin.from("supplier_order_lines").upsert(
      rows.map(({ order_mode: _m, ...r }) => r),
      { onConflict: "week_start,product_id" },
    ));
  }
  if (error) throw new Error(`supplier_order_lines: ${error.message}`);
}

/**
 * "ההזמנה נשלחה לספק": saves the lines (the ones given, and every other line
 * as it stands: saved, or the bouquet's default), marks the week as ordered
 * (once), and sets the website's live stock to final − pre-ordered.
 * The stock before is kept so "ביטול השליחה" can restore it.
 */
export async function markSupplierOrderSent(
  admin: Admin,
  lines?: SupplierLineInput[],
  now: Date = new Date(),
): Promise<{ ok: true; state: SupplierState } | { ok: false; reason: "already" }> {
  let state = await loadSupplierState(admin, now);
  if (state.supplierOrderedAt) return { ok: false, reason: "already" };
  if (lines) await saveSupplierLines(admin, state.week.weekStart, lines, state.preorders);
  // Persist every line (also untouched defaults) so the week keeps what was ordered.
  state = await loadSupplierState(admin, now);
  await saveSupplierLines(
    admin,
    state.week.weekStart,
    state.lines.map((l) => ({ product_id: l.product_id, mode: l.mode, extra_qty: l.extra_qty })),
    state.preorders,
  );

  const at = now.toISOString();
  const { data: before } = await admin.from("inventory").select("product_id, live_stock_count, initial_stock_count");
  const claim = await admin
    .from("business_weeks")
    .update({ supplier_ordered_at: at, stock_before_order: before ?? [] })
    .eq("week_start", state.week.weekStart)
    .is("supplier_ordered_at", null)
    .select("week_start");
  // Before migration 041 the copy column doesn't exist: mark without it.
  const { data: claimed, error: claimErr } = claim.error
    ? await admin
        .from("business_weeks")
        .update({ supplier_ordered_at: at })
        .eq("week_start", state.week.weekStart)
        .is("supplier_ordered_at", null)
        .select("week_start")
    : claim;
  if (claimErr) throw new Error(`business_weeks: ${claimErr.message}`);
  if (!claimed || claimed.length === 0) return { ok: false, reason: "already" };

  const stock = state.lines.map((l) => {
    const live = liveStockFor(l.final_qty, l.preorder_qty);
    return { product_id: l.product_id, live_stock_count: live, initial_stock_count: live, updated_at: at };
  });
  if (stock.length > 0) {
    const { error } = await admin.from("inventory").upsert(stock, { onConflict: "product_id" });
    if (error) {
      // Undo the mark so it can be tried again.
      await admin.from("business_weeks").update({ supplier_ordered_at: null }).eq("week_start", state.week.weekStart);
      throw new Error(`inventory: ${error.message}`);
    }
  }
  return { ok: true, state: await loadSupplierState(admin, now) };
}

/**
 * At the supplier-order time the store switches to live sale. If nobody marked
 * the order as sent by then, mark it now with the quantities on the supplier
 * page (saved, or each bouquet's default), so the website has live stock.
 * Cheap when there is nothing to do; never throws.
 */
export async function autoMarkSupplierOrderIfDue(admin: Admin, now: Date = new Date()): Promise<boolean> {
  try {
    const settings = await getServerSettings();
    const week = currentBusinessWeek(settings, now);
    if (now < week.supplierOrderAt) return false;
    const { data, error } = await admin
      .from("business_weeks")
      .select("supplier_ordered_at")
      .eq("week_start", week.weekStart)
      .maybeSingle();
    if (error || (data as { supplier_ordered_at?: string | null } | null)?.supplier_ordered_at) return false;
    const res = await markSupplierOrderSent(admin, undefined, now);
    if (res.ok) console.info(`[supplier] auto-marked the order for week ${week.weekStart}`);
    return res.ok;
  } catch (e) {
    console.error("[supplier] auto-mark failed:", e);
    return false;
  }
}

export function serializeSupplierState(s: SupplierState) {
  return {
    week: {
      weekStart: s.week.weekStart,
      weekEnd: s.week.weekEnd,
      phase: s.week.phase,
      supplierOrderAt: s.week.supplierOrderAt.toISOString(),
    },
    supplierOrderedAt: s.supplierOrderedAt,
    lines: s.lines,
    message: s.message,
  };
}
