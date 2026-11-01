// Automatic week close. Pure logic + a storage interface, so the idempotency
// rules are unit-tested without a database. The Supabase implementation of
// the store lives in week-close-store.ts.
//
// Closing a week (same steps as the old manual "weekly reset"):
//   1. write a weekly_archives row (once per week),
//   2. write payroll_weeks snapshots (upsert, safe to repeat),
//   3. mark the week's orders as archived,
//   4. zero the global live stock, unless the new week's stock is already set,
//   5. set business_weeks.closed_at.
// A week is claimed first (close_started_at), so two runs never close the
// same week at once; a stale claim (crashed run) is taken over after 15 min.

import { addDays, businessWeekOf, currentBusinessWeek, israelTimeToDate, type WeekSettings } from "@/lib/staff/week";
import type { ExpenseBucket } from "@/lib/expenses";
import type { WeekBudget } from "@/lib/staff/payroll";
import type { PayContext } from "@/lib/staff/pay-context";
import {
  computePayroll,
  computeWeekFinance,
  deliveriesByEmployee,
  inWindow,
  isNonEmployeeLine,
  isCounted,
  orderChannel,
  productSales,
  sumPayroll,
  weekWindow,
  type EmployeeRow,
  type OrderRow,
  type PayrollLine,
  type ProductRow,
  type ShiftRow,
  type SupplierLineRow,
} from "./week-math";

export const CLOSE_LOCK_STALE_MS = 15 * 60 * 1000;

export type OpenWeekRow = {
  week_start: string;
  archive_id: string | null;
  close_started_at: string | null;
  closed_at: string | null;
};

export type WeekCloseData = {
  orders: OrderRow[];
  products: ProductRow[];
  expenses: ExpenseBucket[];
  employees: EmployeeRow[];
  shifts: ShiftRow[];
  supplierLines: SupplierLineRow[];
  supplierOrdered: boolean;
  budget?: WeekBudget;
  /** Pay history and one-off payments (loadPayContext). */
  payContext?: PayContext;
};

export type PayrollSnapshot = {
  week_start: string;
  employee_id: string;
  hours: number;
  shifts_count: number;
  deliveries_count: number;
  amount: number;
};

export interface WeekCloseStore {
  /** Creates the business_weeks row if missing (never overwrites). */
  ensureWeekRow(weekStart: string, supplierOrderAt: Date): Promise<void>;
  /** business_weeks rows with closed_at null and week_start < `before`, oldest first. */
  openWeeksBefore(before: string): Promise<OpenWeekRow[]>;
  /** Atomically sets close_started_at if the week is open and not claimed (or the claim is older than staleBefore). */
  claim(weekStart: string, now: Date, staleBefore: Date): Promise<boolean>;
  release(weekStart: string): Promise<void>;
  finish(weekStart: string, archiveId: string | null, now: Date): Promise<void>;
  loadWeekData(weekStart: string, window: { from: Date; to: Date }): Promise<WeekCloseData>;
  findArchive(weekStartIso: string): Promise<string | null>;
  insertArchive(payload: Record<string, unknown>): Promise<string>;
  upsertPayroll(rows: PayrollSnapshot[]): Promise<void>;
  archiveOrders(ids: string[]): Promise<void>;
  isSupplierOrdered(weekStart: string): Promise<boolean>;
  resetLiveStock(): Promise<void>;
}

export type WeekCloseResult = {
  closed: string[];
  skipped: string[];
  errors: { week_start: string; error: string }[];
};

/** Pure guard: may this run claim the week? */
export function canClaim(row: Pick<OpenWeekRow, "closed_at" | "close_started_at">, now: Date, staleMs = CLOSE_LOCK_STALE_MS): boolean {
  if (row.closed_at) return false;
  if (!row.close_started_at) return true;
  return new Date(row.close_started_at).getTime() < now.getTime() - staleMs;
}

/**
 * payroll_weeks rows for a closed week: one per employee line, with the
 * amount earned from the schedule, budget and responsibility. One-off
 * payments (payroll_entries) are never snapshotted: they stay in their own
 * table and are added on top when a closed week is shown (withPayEntries),
 * so a payment added after the close still counts and nothing counts twice.
 * The budget remainder and unassigned payments are never snapshotted either.
 */
export function payrollSnapshots(weekStart: string, lines: PayrollLine[]): PayrollSnapshot[] {
  return lines
    .filter((l) => !isNonEmployeeLine(l) && l.employee_id)
    .map((l) => ({ line: l, amount: Math.round((l.amount - (l.fromEntries ?? 0)) * 100) / 100 }))
    .filter(({ line, amount }) => (line.role !== "owner" || amount > 0) && (amount > 0 || line.shifts > 0 || line.deliveries > 0 || !(line.fromEntries ?? 0)))
    .map(({ line: l, amount }) => ({
      week_start: weekStart,
      employee_id: l.employee_id,
      hours: l.hours,
      shifts_count: l.shifts,
      deliveries_count: l.deliveries,
      amount,
    }));
}

/** weekly_archives row for a closed week (columns as written by the old weekly reset). */
export function buildArchivePayload(args: {
  weekStart: string;
  window: { from: Date; to: Date };
  data: WeekCloseData;
  payroll: number;
  now: Date;
}): Record<string, unknown> {
  const { weekStart, window, data, payroll, now } = args;
  const orders = data.orders.filter((o) => inWindow(o.created_at, window) && isCounted(o));
  const finance = computeWeekFinance({
    weekStart,
    orders,
    products: data.products,
    expenses: data.expenses,
    payroll,
    supplierLines: data.supplierLines,
    supplierOrdered: data.supplierOrdered,
  });
  const costById = new Map(data.products.map((p) => [p.id, Number(p.cost_price) || 0]));
  const sales = productSales(orders, data.products);
  const withCost = (rows: typeof sales.website) =>
    rows.map((r) => {
      const cost = r.units * (costById.get(r.product_id) ?? 0);
      return { ...r, cost, profit: r.revenue - cost };
    });
  const website = withCost(sales.website);
  const stalls = withCost(sales.stalls);
  const websiteCost = website.reduce((s, r) => s + r.cost, 0);
  const stallCost = stalls.reduce((s, r) => s + r.cost, 0);

  const merged = new Map<string, { product_id: string; title: string; units: number; revenue: number; cost: number; profit: number }>();
  for (const r of [...website, ...stalls]) {
    const m = merged.get(r.product_id) ?? { product_id: r.product_id, title: r.title, units: 0, revenue: 0, cost: 0, profit: 0 };
    m.units += r.units;
    m.revenue += r.revenue;
    m.cost += r.cost;
    m.profit += r.profit;
    merged.set(r.product_id, m);
  }
  const topProducts = Array.from(merged.values()).sort((a, b) => b.units - a.units);
  const websiteOrders = orders.filter((o) => orderChannel(o) !== "stall");
  const phones = new Set(websiteOrders.map((o) => o.customer_phone).filter(Boolean));
  const [y, m, d] = weekStart.split("-");

  return {
    week_start: israelTimeToDate(weekStart, 0).toISOString(),
    week_end: window.to.toISOString(),
    archived_at: now.toISOString(),
    week_label: `שבוע ${d}.${m}.${y}`,
    total_revenue: finance.revenue.total,
    delivery_revenue: 0,
    products_revenue: finance.revenue.total,
    total_cost: finance.supplierCost,
    gross_profit: finance.grossProfit,
    orders_count: websiteOrders.length,
    pickup_count: websiteOrders.filter((o) => (o as { delivery_type?: string }).delivery_type === "pickup").length,
    delivery_count: websiteOrders.filter((o) => (o as { delivery_type?: string }).delivery_type === "delivery").length,
    member_orders_count: websiteOrders.filter((o) => (o as { is_member?: boolean }).is_member).length,
    new_customers_count: phones.size,
    returning_customers_count: 0,
    cancelled_orders_count: 0,
    cancelled_orders_value: 0,
    preorders_count: websiteOrders.length,
    preorders_revenue: finance.revenue.website,
    preorders_profit: finance.revenue.website - websiteCost,
    stall_sales_count: stalls.reduce((s, r) => s + r.units, 0),
    stall_revenue: finance.revenue.stalls,
    stall_profit: finance.revenue.stalls - stallCost,
    total_supplier_cost: finance.supplierCost,
    total_expenses: finance.expenses.total,
    total_net_profit: finance.netProfit,
    top_products: topProducts,
    product_sales: [...topProducts].sort((a, b) => b.profit - a.profit),
    snapshot_data: {
      source: "auto_week_close",
      business_week: weekStart,
      revenue: finance.revenue,
      supplier_cost: finance.supplierCost,
      supplier_cost_basis: finance.supplierCostBasis,
      expenses: finance.expenses,
      payroll,
      gross_profit: finance.grossProfit,
      net_profit: finance.netProfit,
      website_products: website,
      stall_products: stalls,
    },
  };
}

async function closeOneWeek(
  store: WeekCloseStore,
  row: OpenWeekRow,
  settings: WeekSettings,
  currentWeekStart: string,
  now: Date,
): Promise<void> {
  const weekStart = row.week_start;
  const week = businessWeekOf(weekStart, settings, now);
  const window = weekWindow(week, settings);
  const data = await store.loadWeekData(weekStart, window);

  const weekShifts = data.shifts.filter((s) => s.work_date >= week.weekStart && s.work_date <= week.weekEnd);
  const lines = computePayroll(
    data.employees,
    weekShifts,
    deliveriesByEmployee(data.orders, window),
    undefined,
    data.budget,
    data.payContext,
    weekStart,
  );
  const payroll = sumPayroll(lines);

  // 1. Archive (once).
  let archiveId = row.archive_id;
  if (!archiveId) {
    const payload = buildArchivePayload({ weekStart, window, data, payroll, now });
    archiveId = (await store.findArchive(String(payload.week_start))) ?? (await store.insertArchive(payload));
  }

  // 2. Payroll snapshots (upsert).
  const snapshots = payrollSnapshots(weekStart, lines);
  if (snapshots.length > 0) await store.upsertPayroll(snapshots);

  // 3. Archive the week's orders.
  const ids = data.orders
    .filter((o) => inWindow(o.created_at, window) && o.status !== "cancelled" && o.status !== "archived")
    .map((o) => o.id);
  if (ids.length > 0) await store.archiveOrders(ids);

  // 4. Zero the live stock only for the week right before the current one,
  //    and only if the current week's supplier order didn't set new stock yet.
  if (weekStart === addDays(currentWeekStart, -7) && !(await store.isSupplierOrdered(currentWeekStart))) {
    await store.resetLiveStock();
  }

  // 5. Done.
  await store.finish(weekStart, archiveId, now);
}

/**
 * Closes every past business week that is not closed yet. Safe to call on
 * every dashboard load and from the cron route: it does nothing when there
 * is nothing to close, and a week being closed by another run is skipped.
 */
export async function ensureWeekClosed(
  store: WeekCloseStore,
  settings: WeekSettings,
  now: Date = new Date(),
): Promise<WeekCloseResult> {
  const result: WeekCloseResult = { closed: [], skipped: [], errors: [] };
  const current = currentBusinessWeek(settings, now);
  const previous = businessWeekOf(addDays(current.weekStart, -7), settings, now);
  await store.ensureWeekRow(previous.weekStart, previous.supplierOrderAt);

  const open = await store.openWeeksBefore(current.weekStart);
  for (const row of open) {
    if (!canClaim(row, now)) {
      result.skipped.push(row.week_start);
      continue;
    }
    const claimed = await store.claim(row.week_start, now, new Date(now.getTime() - CLOSE_LOCK_STALE_MS));
    if (!claimed) {
      result.skipped.push(row.week_start);
      continue;
    }
    try {
      await closeOneWeek(store, row, settings, current.weekStart, now);
      result.closed.push(row.week_start);
    } catch (e) {
      result.errors.push({ week_start: row.week_start, error: e instanceof Error ? e.message : String(e) });
      try {
        await store.release(row.week_start);
      } catch {
        // the claim goes stale after CLOSE_LOCK_STALE_MS anyway
      }
    }
  }
  return result;
}
