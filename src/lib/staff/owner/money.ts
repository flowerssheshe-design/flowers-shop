// Pure: the money overview ("כסף") and the expenses summary ("הוצאות").
// No server imports, so everything here is unit-tested directly.

import { addDays, businessWeekOf, israelDate, type BusinessWeek, type WeekSettings } from "@/lib/staff/week";
import { expensesForWeek, type ExpenseBucket, type WeeklyExpenseBreakdown } from "@/lib/expenses";
import type { WeekBudget } from "@/lib/staff/payroll";
import type { PayContext } from "@/lib/staff/pay-context";
import {
  budgetRemainderLine,
  computePayroll,
  snapshotPayrollLines,
  withPayEntries,
  computeWeekFinance,
  deliveriesByEmployee,
  inWindow,
  isCounted,
  num,
  productSales,
  round2,
  sumPayroll,
  weekWindow,
  type EmployeeRow,
  type OrderRow,
  type PayrollLine,
  type PayrollSnapshotRow,
  type ProductRow,
  type ProductSales,
  type ShiftRow,
  type SupplierLineRow,
  type WeekFinance,
} from "./week-math";

// ---------- Per-week report ----------

export type MoneyWeek = {
  weekStart: string;
  weekEnd: string;
  isCurrent: boolean;
  closed: boolean;
  supplierOrdered: boolean;
  finance: WeekFinance;
  payrollSource: "live" | "snapshot";
  /** Current week only: the cost of every scheduled shift this week. */
  payrollScheduled: number | null;
  payrollLines: PayrollLine[];
};

export type MoneyInput = {
  current: BusinessWeek;
  settings: WeekSettings;
  now: Date;
  /** How many weeks back from the current one (the current week included). */
  weeks: number;
  orders: OrderRow[];
  products: ProductRow[];
  expenses: ExpenseBucket[];
  employees: EmployeeRow[];
  shifts: ShiftRow[];
  payrollSnapshots: PayrollSnapshotRow[];
  businessWeeks: { week_start: string; supplier_ordered_at: string | null; closed_at: string | null }[];
  supplierLines: (SupplierLineRow & { week_start: string })[];
  /** week_start → budget and allocations. */
  budgets?: Map<string, WeekBudget>;
  /** Pay history and one-off pay entries; passed to every payroll calculation. */
  ctx?: PayContext;
};

/** Newest first: the current week, then the weeks before it. */
export function moneyWeekList(current: BusinessWeek, settings: WeekSettings, count: number, now: Date): BusinessWeek[] {
  const list: BusinessWeek[] = [];
  for (let i = 0; i < count; i++) list.push(businessWeekOf(addDays(current.weekStart, -7 * i), settings, now));
  return list;
}

/** Number of business weeks from the week of `firstDate` up to the current week (both included). */
export function weeksSince(firstDate: string | null | undefined, current: BusinessWeek, settings: WeekSettings, max = 260): number {
  if (!firstDate) return 1;
  const first = businessWeekOf(firstDate.slice(0, 10), settings).weekStart;
  const diff = Math.round((Date.parse(current.weekStart) - Date.parse(first)) / (7 * 86_400_000));
  return Math.min(max, Math.max(1, diff + 1));
}

export function buildMoneyReport(input: MoneyInput): MoneyWeek[] {
  const today = israelDate(input.now);
  const names = new Map(input.employees.map((e) => [e.id, e]));
  return moneyWeekList(input.current, input.settings, input.weeks, input.now).map((week) => {
    const win = weekWindow(week, input.settings);
    const isCurrent = week.weekStart === input.current.weekStart;
    const bw = input.businessWeeks.find((b) => b.week_start === week.weekStart);
    const closed = Boolean(bw?.closed_at);
    const snapshots = input.payrollSnapshots.filter((p) => p.week_start === week.weekStart);
    const weekShifts = input.shifts.filter((s) => s.work_date >= week.weekStart && s.work_date <= week.weekEnd);
    const deliveries = deliveriesByEmployee(input.orders, win);
    const budget = input.budgets?.get(week.weekStart);

    let payrollLines: PayrollLine[];
    let payrollSource: MoneyWeek["payrollSource"];
    let payrollScheduled: number | null = null;
    if (closed && snapshots.length > 0) {
      payrollSource = "snapshot";
      // Snapshots never hold one-off payments, so add the week's entries on top.
      payrollLines = withPayEntries(
        snapshotPayrollLines(snapshots, input.employees),
        input.ctx,
        week.weekStart,
        input.employees,
      );
      const remainder = budgetRemainderLine(budget);
      if (remainder) payrollLines.push(remainder);
    } else {
      payrollSource = "live";
      payrollLines = computePayroll(
        input.employees,
        weekShifts,
        deliveries,
        // The week's pay is committed, so the current week counts all of it.
        undefined,
        budget,
        input.ctx,
        week.weekStart,
      );
      if (isCurrent) {
        payrollScheduled = sumPayroll(
          computePayroll(input.employees, weekShifts, deliveries, undefined, budget, input.ctx, week.weekStart),
        );
      }
    }

    const finance = computeWeekFinance({
      weekStart: week.weekStart,
      orders: input.orders.filter((o) => inWindow(o.created_at, win)),
      products: input.products,
      expenses: input.expenses,
      payroll: sumPayroll(payrollLines),
      supplierLines: input.supplierLines.filter((l) => l.week_start === week.weekStart),
      supplierOrdered: Boolean(bw?.supplier_ordered_at),
    });

    return {
      weekStart: week.weekStart,
      weekEnd: week.weekEnd,
      isCurrent,
      closed,
      supplierOrdered: Boolean(bw?.supplier_ordered_at),
      finance,
      payrollSource,
      payrollScheduled: payrollScheduled === null ? null : round2(payrollScheduled),
      payrollLines,
    };
  });
}

// ---------- Where the money is (Bit / cash / PayBox) ----------

/** Orders that were actually paid. A pending_payment order is not money in hand. */
export const PAID_STATUSES: ReadonlySet<string> = new Set(["approved", "completed", "archived"]);

export type PaymentSplit = {
  bit: number;
  cash: number;
  paybox: number;
  /** Paid orders without a known payment method. */
  other: number;
  total: number;
  count: number;
  /** Orders still waiting for payment (status pending_payment). */
  pending: { count: number; amount: number };
};

export function paymentSplit(orders: OrderRow[]): PaymentSplit {
  const out: PaymentSplit = { bit: 0, cash: 0, paybox: 0, other: 0, total: 0, count: 0, pending: { count: 0, amount: 0 } };
  for (const o of orders) {
    if (!isCounted(o)) continue;
    const amount = num(o.total_amount);
    if (o.status === "pending_payment") {
      out.pending.count += 1;
      out.pending.amount += amount;
      continue;
    }
    if (!PAID_STATUSES.has(o.status)) continue;
    out.count += 1;
    out.total += amount;
    if (o.payment_method === "bit") out.bit += amount;
    else if (o.payment_method === "cash") out.cash += amount;
    else if (o.payment_method === "paybox") out.paybox += amount;
    else out.other += amount;
  }
  return {
    bit: round2(out.bit),
    cash: round2(out.cash),
    paybox: round2(out.paybox),
    other: round2(out.other),
    total: round2(out.total),
    count: out.count,
    pending: { count: out.pending.count, amount: round2(out.pending.amount) },
  };
}

// ---------- Totals over several weeks ----------

export type MoneyTotals = {
  weeks: number;
  ordersCount: number;
  websiteOrdersCount: number;
  stallSalesCount: number;
  revenue: { website: number; stalls: number; total: number };
  supplierCost: number;
  expenses: number;
  payroll: number;
  net: number;
  /** revenue.total / ordersCount (0 when there are no orders). */
  avgOrder: number;
  avgRevenuePerWeek: number;
  avgNetPerWeek: number;
};

export function sumWeeks(weeks: MoneyWeek[]): MoneyTotals {
  const t = { orders: 0, website: 0, stalls: 0, websiteRev: 0, stallsRev: 0, total: 0, supplier: 0, expenses: 0, payroll: 0, net: 0 };
  for (const w of weeks) {
    const f = w.finance;
    t.orders += f.ordersCount;
    t.website += f.websiteOrdersCount;
    t.stalls += f.stallSalesCount;
    t.websiteRev += f.revenue.website;
    t.stallsRev += f.revenue.stalls;
    t.total += f.revenue.total;
    t.supplier += f.supplierCost;
    t.expenses += f.expenses.total;
    t.payroll += f.payroll;
    t.net += f.netProfit;
  }
  const n = weeks.length;
  return {
    weeks: n,
    ordersCount: t.orders,
    websiteOrdersCount: t.website,
    stallSalesCount: t.stalls,
    revenue: { website: round2(t.websiteRev), stalls: round2(t.stallsRev), total: round2(t.total) },
    supplierCost: round2(t.supplier),
    expenses: round2(t.expenses),
    payroll: round2(t.payroll),
    net: round2(t.net),
    avgOrder: t.orders > 0 ? round2(t.total / t.orders) : 0,
    avgRevenuePerWeek: n > 0 ? round2(t.total / n) : 0,
    avgNetPerWeek: n > 0 ? round2(t.net / n) : 0,
  };
}

/** "YYYY-MM" of a "YYYY-MM-DD". A week belongs to the month of its Sunday. */
export function monthKey(isoDate: string): string {
  return isoDate.slice(0, 7);
}

// ---------- The whole "כסף" page ----------

export type MoneyOverview = {
  current: MoneyWeek | null;
  /** The most recent weeks, newest first (for the weekly summary table). */
  recent: MoneyWeek[];
  thisMonth: MoneyTotals & { month: string };
  allTime: MoneyTotals & { since: string | null };
  payments: { week: PaymentSplit; allTime: PaymentSplit };
  bestSellers: { website: ProductSales[]; stalls: ProductSales[] };
};

export type MoneyOverviewInput = MoneyInput & {
  /** How many weeks to return in `recent` (the totals always cover all `weeks`). */
  recent: number;
  /** The first order's created_at, shown as "since". */
  since?: string | null;
  /** How many best sellers per channel. */
  topProducts?: number;
};

export function buildMoneyOverview(input: MoneyOverviewInput): MoneyOverview {
  const weeks = buildMoneyReport(input);
  const current = weeks.find((w) => w.isCurrent) ?? null;
  const month = monthKey(israelDate(input.now));
  const curWin = weekWindow(input.current, input.settings);
  const oldest = businessWeekOf(addDays(input.current.weekStart, -7 * (Math.max(1, input.weeks) - 1)), input.settings, input.now);
  const allWin = { from: weekWindow(oldest, input.settings).from, to: curWin.to };
  const allOrders = input.orders.filter((o) => inWindow(o.created_at, allWin));
  const top = input.topProducts ?? 5;
  const sales = productSales(allOrders, input.products);

  return {
    current,
    // Weeks before the business started are just empty rows; leave them out.
    recent: weeks
      .slice(0, Math.max(1, input.recent))
      .filter((w) => w.isCurrent || !input.since || w.weekEnd >= input.since.slice(0, 10)),
    thisMonth: { ...sumWeeks(weeks.filter((w) => monthKey(w.weekStart) === month)), month },
    allTime: { ...sumWeeks(weeks), since: input.since ?? null },
    payments: {
      week: paymentSplit(allOrders.filter((o) => inWindow(o.created_at, curWin))),
      allTime: paymentSplit(allOrders),
    },
    bestSellers: { website: sales.website.slice(0, top), stalls: sales.stalls.slice(0, top) },
  };
}

// ---------- The "הוצאות" summary ----------

export type ExpenseRow = ExpenseBucket & { category?: string | null };

export type ExpenseSummary = {
  /** Everything so far: one-time + every recurring × the weeks it was active. */
  total: number;
  oneTime: number;
  recurring: number;
  /** Weeks counted in `total` (from the first expense's week to the current week). */
  weeks: number;
  since: string | null;
  thisWeek: WeeklyExpenseBreakdown;
  /** Weeks whose Sunday is in the current month. */
  thisMonth: number;
  /** What the active recurring expenses cost per week right now. */
  recurringPerWeek: number;
  /** Total so far per category, biggest first. */
  byCategory: { category: string; amount: number }[];
};

function sundayOf(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return addDays(isoDate, -new Date(Date.UTC(y, m - 1, d)).getUTCDay());
}

function firstExpenseDate(rows: ExpenseRow[]): string | null {
  let first: string | null = null;
  for (const r of rows) {
    if (num(r.amount) === 0) continue;
    if (r.expense_type === "recurring" && r.is_active === false) continue;
    const raw = r.expense_date ?? r.creation_date ?? r.created_at;
    if (!raw) continue;
    const day = String(raw).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    if (!first || day < first) first = day;
  }
  return first;
}

/**
 * Uses the same weekly rule as every money screen (`expensesForWeek`): a
 * one-time expense counts in its own week, a recurring one in every week from
 * its start date while it is active.
 */
export function expenseSummary(
  rows: ExpenseRow[],
  currentWeekStart: string,
  today: string,
  maxWeeks = 520,
  /** "סופרים כסף מתאריך": weeks before this date's week are not counted. */
  startDate: string | null = null,
): ExpenseSummary {
  const firstExpense = firstExpenseDate(rows);
  const first = firstExpense && startDate && startDate > firstExpense ? startDate : firstExpense;
  const thisWeek = expensesForWeek(rows, currentWeekStart, addDays(currentWeekStart, 7));
  const month = monthKey(today);

  const weekStarts: string[] = [];
  if (first) {
    let w = sundayOf(first);
    if (w > currentWeekStart) w = currentWeekStart;
    while (w <= currentWeekStart && weekStarts.length < maxWeeks) {
      weekStarts.push(w);
      w = addDays(w, 7);
    }
  }

  const groups = new Map<string, ExpenseRow[]>();
  for (const r of rows) {
    const key = r.category || "other";
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }

  let oneTime = 0;
  let recurring = 0;
  let thisMonth = 0;
  const byCategory = new Map<string, number>();
  for (const w of weekStarts) {
    const end = addDays(w, 7);
    const all = expensesForWeek(rows, w, end);
    oneTime += all.oneTime;
    recurring += all.recurring;
    if (monthKey(w) === month) thisMonth += all.total;
    for (const [cat, list] of groups) {
      const amount = expensesForWeek(list, w, end).total;
      if (amount) byCategory.set(cat, (byCategory.get(cat) ?? 0) + amount);
    }
  }

  return {
    total: round2(oneTime + recurring),
    oneTime: round2(oneTime),
    recurring: round2(recurring),
    weeks: weekStarts.length,
    since: first,
    thisWeek: { recurring: round2(thisWeek.recurring), oneTime: round2(thisWeek.oneTime), total: round2(thisWeek.total) },
    thisMonth: round2(thisMonth),
    recurringPerWeek: round2(thisWeek.recurring),
    byCategory: Array.from(byCategory, ([category, amount]) => ({ category, amount: round2(amount) }))
      .filter((c) => c.amount !== 0)
      .sort((a, b) => b.amount - a.amount),
  };
}
