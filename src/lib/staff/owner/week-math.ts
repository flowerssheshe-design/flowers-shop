// Pure money/sales math for the owner screens ("השבוע עכשיו", "כסף ושכר",
// week close). No server imports, so it is unit-tested directly.

import { addDays, businessWeekOf, israelDate, type BusinessWeek, type WeekSettings } from "@/lib/staff/week";
import {
  computeEarnings,
  employeeForWeek,
  isOwnerEmployee,
  unallocated,
  weeklyResponsibilityPay,
  type PayEmployee,
  type PayShift,
  type WeekBudget,
} from "@/lib/staff/payroll";
import { entriesForWeek, sundayOf, type PayContext, type PayEntry } from "@/lib/staff/pay-context";
import { expensesForWeek, type ExpenseBucket, type WeeklyExpenseBreakdown } from "@/lib/expenses";
import { isStallSaleOrder } from "@/lib/utils";

// ---------- Row shapes (only the columns we read) ----------

export type OrderItemRow = { productId?: string; title?: string; qty?: number; price?: number };

export type OrderRow = {
  id: string;
  created_at: string;
  status: string;
  order_type?: string | null;
  total_amount: number | string | null;
  delivery_fee?: number | string | null;
  items?: unknown;
  payment_method?: string | null;
  stall_id?: string | null;
  notes?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  delivered_by?: string | null;
  delivered_at?: string | null;
};

export type ProductRow = {
  id: string;
  title: string;
  cost_price?: number | string | null;
  price_standard?: number | string | null;
  default_order_qty?: number | null;
  /** "extra" = pre-orders + default_order_qty; "total" = default_order_qty in all. */
  order_mode?: string | null;
  is_active?: boolean | null;
  sort_order?: number | null;
};

export type EmployeeRow = PayEmployee & { full_name: string; is_active?: boolean | null };

export type ShiftRow = PayShift & {
  id?: string;
  work_date: string;
  shift_type?: string;
  stall_id?: string | null;
};

export type StallRow = {
  id: string;
  name: string;
  location?: string | null;
  is_active?: boolean | null;
  is_open?: boolean | null;
  sort_order?: number | null;
};

export type StallStockRow = { stall_id: string; product_id: string; stock: number; initial_stock: number };

export type SupplierLineRow = {
  product_id: string;
  preorder_qty: number;
  extra_qty: number;
  final_qty: number;
  order_mode?: string | null;
};

export type PayrollSnapshotRow = {
  week_start: string;
  employee_id: string;
  hours: number | string;
  shifts_count: number;
  deliveries_count: number;
  amount: number | string;
};

export type Channel = "preorder" | "live" | "manual" | "stall";

// ---------- Small helpers ----------

export function num(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Stall sales are order_type 'stall', or legacy rows recognised by their text. */
export function orderChannel(order: OrderRow): Channel {
  if (order.order_type === "stall" || isStallSaleOrder(order)) return "stall";
  if (order.order_type === "live") return "live";
  if (order.order_type === "manual") return "manual";
  return "preorder";
}

/** Cancelled orders never count toward revenue or quantities. */
export function isCounted(order: OrderRow): boolean {
  return order.status !== "cancelled";
}

export function orderItems(order: OrderRow): { productId: string; title: string; qty: number; price: number }[] {
  const items = Array.isArray(order.items) ? (order.items as OrderItemRow[]) : [];
  return items
    .map((it) => ({
      productId: String(it?.productId ?? ""),
      title: String(it?.title ?? "זר"),
      qty: num(it?.qty),
      price: num(it?.price),
    }))
    .filter((it) => it.productId && it.qty > 0);
}

/**
 * Orders belong to a week from the previous week's close to this week's
 * close (so a Saturday-night order after closing counts in the next week).
 */
export function weekWindow(week: BusinessWeek, settings: WeekSettings): { from: Date; to: Date } {
  const prev = businessWeekOf(addDays(week.weekStart, -7), settings);
  return { from: prev.closesAt, to: week.closesAt };
}

export function inWindow(iso: string | null | undefined, win: { from: Date; to: Date }): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return t >= win.from.getTime() && t < win.to.getTime();
}

// ---------- Payroll ----------

export type PayrollLine = {
  employee_id: string;
  full_name: string;
  role: string;
  shifts: number;
  hours: number;
  deliveries: number;
  amount: number;
  /** The part of `amount` paid for the responsibility (shift manager / marketing). */
  fromResponsibility: number;
  /** The part of `amount` from one-off payments (payroll_entries). Never snapshotted. */
  fromEntries?: number;
};

/** Deliveries per courier inside the window (orders.delivered_by / delivered_at). */
export function deliveriesByEmployee(orders: OrderRow[], win: { from: Date; to: Date }): Map<string, number> {
  const map = new Map<string, number>();
  for (const o of orders) {
    if (!o.delivered_by || !isCounted(o) || !inWindow(o.delivered_at, win)) continue;
    map.set(o.delivered_by, (map.get(o.delivered_by) ?? 0) + 1);
  }
  return map;
}

/**
 * The business week (Sunday) a payroll calculation is for: the explicit
 * week, else the budget's week (loadBudgets sets it), else the Sunday of the
 * first shift, else the Sunday of `untilDate`.
 */
export function payrollWeekOf(
  shifts: { work_date: string }[],
  untilDate?: string,
  budget?: WeekBudget,
  weekStart?: string,
): string | undefined {
  if (weekStart) return weekStart;
  if (budget?.weekStart) return budget.weekStart;
  const first = shifts.reduce<string | undefined>((min, s) => (!min || s.work_date < min ? s.work_date : min), undefined);
  if (first) return sundayOf(first);
  return untilDate ? sundayOf(untilDate) : undefined;
}

/**
 * Pay per employee from the schedule. Only employees with shifts,
 * deliveries, a budget allocation, a responsibility pay or a one-off payment
 * appear; the responsibility pay and one-off payments count in full for the
 * week (also in "so far"). `untilDate` (inclusive, "YYYY-MM-DD") limits
 * shifts to those that already started, for "so far" numbers.
 *
 * With `ctx` (loadPayContext), the week is paid with the pay settings that
 * applied in it (employee_pay_history) and one-off payments are added: to the
 * employee's line, or as their own line (role "pay_entry") when not tied to an
 * employee. Without `ctx` the employee columns are used, as before.
 * The week is `weekStart`, else it comes from the budget / shifts / untilDate
 * (see payrollWeekOf).
 */
export function computePayroll(
  employees: EmployeeRow[],
  shifts: ShiftRow[],
  deliveries: Map<string, number>,
  untilDate?: string,
  budget?: WeekBudget,
  ctx?: PayContext,
  weekStart?: string,
): PayrollLine[] {
  const relevant = untilDate ? shifts.filter((s) => s.work_date <= untilDate) : shifts;
  const week = ctx ? payrollWeekOf(shifts, untilDate, budget, weekStart) : undefined;
  const weekEntries = ctx && week ? entriesForWeek(ctx, week) : [];
  const lines: PayrollLine[] = [];
  for (const raw of employees) {
    const e = week ? employeeForWeek(raw, ctx, week) : raw;
    const delivered = deliveries.get(e.id) ?? 0;
    const allocation = budget?.allocations.get(e.id) ?? 0;
    const entries = isOwnerEmployee(e) ? 0 : sumEntries(weekEntries.filter((x) => x.employee_id === e.id));
    const has =
      relevant.some((s) => s.employee_id === e.id) ||
      delivered > 0 ||
      allocation > 0 ||
      weeklyResponsibilityPay(e) > 0 ||
      entries > 0;
    if (!has) continue;
    const earned = computeEarnings(e, relevant, delivered, allocation, 1);
    const line: PayrollLine = {
      employee_id: e.id,
      full_name: e.full_name,
      role: e.role,
      shifts: earned.shifts,
      hours: earned.hours,
      deliveries: earned.deliveries,
      amount: round2(earned.amount + entries),
      fromResponsibility: earned.fromResponsibility,
    };
    if (ctx) line.fromEntries = entries;
    lines.push(line);
  }
  lines.sort((a, b) => b.amount - a.amount || a.full_name.localeCompare(b.full_name, "he"));
  const remainder = budgetRemainderLine(budget);
  const known = new Set(employees.map((e) => e.id));
  return [...lines, ...(remainder ? [remainder] : []), ...unassignedEntryLines(weekEntries, known)];
}

function sumEntries(list: PayEntry[]): number {
  return round2(list.reduce((s, x) => s + num(x.amount), 0));
}

export const BUDGET_REMAINDER_ROLE = "budget_remainder";

/** Role of a one-off payment that is not tied to an employee (old salary expenses). */
export const PAY_ENTRY_ROLE = "pay_entry";

/** Lines that are not one employee's pay; they are never written to payroll_weeks. */
export function isNonEmployeeLine(line: Pick<PayrollLine, "role">): boolean {
  return line.role === BUDGET_REMAINDER_ROLE || line.role === PAY_ENTRY_ROLE;
}

/** One line per payment that has no (known) employee, named by its description. Never snapshotted. */
export function unassignedEntryLines(entries: PayEntry[], knownEmployeeIds: Set<string>): PayrollLine[] {
  return entries
    .filter((x) => !x.employee_id || !knownEmployeeIds.has(x.employee_id))
    .map((x) => ({
      employee_id: "",
      full_name: x.description || "תשלום",
      role: PAY_ENTRY_ROLE,
      shifts: 0,
      hours: 0,
      deliveries: 0,
      amount: round2(num(x.amount)),
      fromResponsibility: 0,
      fromEntries: round2(num(x.amount)),
    }));
}

/** Payroll lines of a closed week from its payroll_weeks snapshots (amounts without one-off payments). */
export function snapshotPayrollLines(snapshots: PayrollSnapshotRow[], employees: EmployeeRow[]): PayrollLine[] {
  const byId = new Map(employees.map((e) => [e.id, e]));
  return snapshots
    .map((p) => {
      const e = byId.get(p.employee_id);
      return {
        employee_id: p.employee_id,
        full_name: e?.full_name ?? "עובד שנמחק",
        role: e?.role ?? "worker",
        shifts: num(p.shifts_count),
        hours: num(p.hours),
        deliveries: num(p.deliveries_count),
        amount: num(p.amount),
        // Snapshots store the total only.
        fromResponsibility: 0,
      };
    })
    .sort((a, b) => b.amount - a.amount);
}

/**
 * Adds the week's one-off payments to lines that do not include them yet
 * (closed weeks shown from payroll_weeks snapshots, which never hold them):
 * to the employee's line (a new line when missing), or as their own line.
 */
export function withPayEntries(
  lines: PayrollLine[],
  ctx: PayContext | undefined,
  weekStart: string,
  employees: EmployeeRow[],
): PayrollLine[] {
  const entries = entriesForWeek(ctx, weekStart);
  if (entries.length === 0) return lines;
  const byId = new Map(employees.map((e) => [e.id, e]));
  const out = lines.map((l) => ({ ...l }));
  const unassigned: PayEntry[] = [];
  for (const x of entries) {
    const e = x.employee_id ? byId.get(x.employee_id) : undefined;
    if (!e) {
      unassigned.push(x);
      continue;
    }
    if (isOwnerEmployee(e)) continue;
    let line = out.find((l) => l.employee_id === e.id && !isNonEmployeeLine(l));
    if (!line) {
      line = { employee_id: e.id, full_name: e.full_name, role: e.role, shifts: 0, hours: 0, deliveries: 0, amount: 0, fromResponsibility: 0 };
      out.push(line);
    }
    line.amount = round2(line.amount + num(x.amount));
    line.fromEntries = round2((line.fromEntries ?? 0) + num(x.amount));
  }
  const employeeLines = out.filter((l) => !isNonEmployeeLine(l)).sort((a, b) => b.amount - a.amount);
  const otherLines = out.filter((l) => isNonEmployeeLine(l));
  return [...employeeLines, ...otherLines, ...unassignedEntryLines(unassigned, new Set())];
}

/**
 * The owners give the whole budget, so the part the ops manager hasn't split
 * yet is still a cost of the week. Shown as its own line, never snapshotted
 * per employee.
 */
export function budgetRemainderLine(budget: WeekBudget | undefined): PayrollLine | null {
  const left = unallocated(budget);
  if (left <= 0) return null;
  return {
    employee_id: "",
    full_name: "תקציב שעוד לא חולק",
    role: BUDGET_REMAINDER_ROLE,
    shifts: 0,
    hours: 0,
    deliveries: 0,
    amount: left,
    fromResponsibility: 0,
  };
}

export function sumPayroll(lines: { amount: number | string }[]): number {
  return round2(lines.reduce((s, l) => s + num(l.amount), 0));
}

// ---------- Week finance ----------

export type ProductSales = { product_id: string; title: string; units: number; revenue: number };

export type WeekFinance = {
  ordersCount: number;
  websiteOrdersCount: number;
  stallSalesCount: number;
  revenue: {
    preorder: number;
    live: number;
    manual: number;
    website: number;
    stalls: number;
    total: number;
  };
  supplierCost: number;
  /** 'order' = the supplier order was sent (final qty × cost); 'sold' = cost of what was sold so far. */
  supplierCostBasis: "order" | "sold";
  expenses: WeeklyExpenseBreakdown;
  payroll: number;
  grossProfit: number;
  netProfit: number;
};

export type WeekFinanceInput = {
  weekStart: string;
  orders: OrderRow[];
  products: ProductRow[];
  expenses: ExpenseBucket[];
  payroll: number;
  supplierLines?: SupplierLineRow[];
  supplierOrdered?: boolean;
};

export function computeWeekFinance(input: WeekFinanceInput): WeekFinance {
  const costById = new Map(input.products.map((p) => [p.id, num(p.cost_price)]));
  const revenue = { preorder: 0, live: 0, manual: 0, website: 0, stalls: 0, total: 0 };
  let soldCost = 0;
  let websiteOrdersCount = 0;
  let stallSalesCount = 0;

  for (const o of input.orders) {
    if (!isCounted(o)) continue;
    const ch = orderChannel(o);
    const amount = num(o.total_amount);
    revenue[ch === "stall" ? "stalls" : ch] += amount;
    if (ch === "stall") stallSalesCount += 1;
    else websiteOrdersCount += 1;
    for (const it of orderItems(o)) soldCost += it.qty * (costById.get(it.productId) ?? 0);
  }
  revenue.website = revenue.preorder + revenue.live + revenue.manual;
  revenue.total = revenue.website + revenue.stalls;

  const ordered = Boolean(input.supplierOrdered) && (input.supplierLines?.length ?? 0) > 0;
  const supplierCost = ordered
    ? (input.supplierLines ?? []).reduce((s, l) => s + num(l.final_qty) * (costById.get(l.product_id) ?? 0), 0)
    : soldCost;

  const expenses = expensesForWeek(input.expenses, input.weekStart, addDays(input.weekStart, 7));
  const grossProfit = revenue.total - supplierCost;
  const netProfit = grossProfit - expenses.total - input.payroll;

  return {
    ordersCount: websiteOrdersCount + stallSalesCount,
    websiteOrdersCount,
    stallSalesCount,
    revenue: {
      preorder: round2(revenue.preorder),
      live: round2(revenue.live),
      manual: round2(revenue.manual),
      website: round2(revenue.website),
      stalls: round2(revenue.stalls),
      total: round2(revenue.total),
    },
    supplierCost: round2(supplierCost),
    supplierCostBasis: ordered ? "order" : "sold",
    expenses: {
      recurring: round2(expenses.recurring),
      oneTime: round2(expenses.oneTime),
      total: round2(expenses.total),
    },
    payroll: round2(input.payroll),
    grossProfit: round2(grossProfit),
    netProfit: round2(netProfit),
  };
}

/** Best sellers, split into website orders and stall sales. */
export function productSales(orders: OrderRow[], products: ProductRow[]): { website: ProductSales[]; stalls: ProductSales[] } {
  const titles = new Map(products.map((p) => [p.id, p.title]));
  const website = new Map<string, ProductSales>();
  const stalls = new Map<string, ProductSales>();
  for (const o of orders) {
    if (!isCounted(o)) continue;
    const target = orderChannel(o) === "stall" ? stalls : website;
    for (const it of orderItems(o)) {
      const row = target.get(it.productId) ?? {
        product_id: it.productId,
        title: titles.get(it.productId) ?? it.title,
        units: 0,
        revenue: 0,
      };
      row.units += it.qty;
      row.revenue = round2(row.revenue + it.qty * it.price);
      target.set(it.productId, row);
    }
  }
  const sort = (m: Map<string, ProductSales>) =>
    Array.from(m.values()).sort((a, b) => b.units - a.units || b.revenue - a.revenue);
  return { website: sort(website), stalls: sort(stalls) };
}

// ---------- Dashboard ----------

export type StallSummary = {
  id: string;
  name: string;
  location: string | null;
  is_open: boolean;
  sales: { count: number; revenue: number; bit: number; cash: number; other: number };
  stock: { remaining: number; initial: number; products: { product_id: string; title: string; stock: number; initial: number }[] };
  workersToday: { employee_id: string; full_name: string; start_time: string; end_time: string }[];
};

export type DashboardInput = {
  week: BusinessWeek;
  settings: WeekSettings;
  now: Date;
  orders: OrderRow[];
  products: ProductRow[];
  expenses: ExpenseBucket[];
  employees: EmployeeRow[];
  shifts: ShiftRow[];
  stalls: StallRow[];
  stallStock: StallStockRow[];
  supplierLines: SupplierLineRow[];
  supplierOrderedAt: string | null;
  budget?: WeekBudget;
  /** Pay history and one-off payments (loadPayContext). Without it, pay uses the employee columns. */
  payContext?: PayContext;
};

export type DashboardData = {
  week: {
    weekStart: string;
    weekEnd: string;
    phase: BusinessWeek["phase"];
    supplierOrderAt: string;
    closesAt: string;
    windowFrom: string;
    supplierOrderedAt: string | null;
    today: string;
  };
  finance: WeekFinance;
  payroll: { soFar: number; scheduled: number };
  openToday: { id: string; name: string }[];
  products: { website: ProductSales[]; stalls: ProductSales[] };
  stalls: StallSummary[];
  team: (PayrollLine & { amountSoFar: number })[];
};

function hhmm(t: string): string {
  return String(t ?? "").slice(0, 5);
}

export function buildDashboard(input: DashboardInput): DashboardData {
  const win = weekWindow(input.week, input.settings);
  const orders = input.orders.filter((o) => inWindow(o.created_at, win));
  const today = israelDate(input.now);
  const weekShifts = input.shifts.filter((s) => s.work_date >= input.week.weekStart && s.work_date <= input.week.weekEnd);
  const deliveries = deliveriesByEmployee(input.orders, win);

  const ws = input.week.weekStart;
  const scheduled = computePayroll(input.employees, weekShifts, deliveries, undefined, input.budget, input.payContext, ws);
  const soFarLines = computePayroll(input.employees, weekShifts, deliveries, today, input.budget, input.payContext, ws);
  // Lines without an employee (budget remainder, one-off payments) count in full in "so far".
  const soFarById = new Map(soFarLines.filter((l) => l.employee_id).map((l) => [l.employee_id, l.amount]));
  const payrollSoFar = sumPayroll(soFarLines);

  const finance = computeWeekFinance({
    weekStart: input.week.weekStart,
    orders,
    products: input.products,
    expenses: input.expenses,
    // The week's pay is already committed (schedule + budget), so the net
    // profit counts all of it, not only shifts that already happened.
    payroll: sumPayroll(scheduled),
    supplierLines: input.supplierLines,
    supplierOrdered: Boolean(input.supplierOrderedAt),
  });

  const titles = new Map(input.products.map((p) => [p.id, p.title]));
  const names = new Map(input.employees.map((e) => [e.id, e.full_name]));
  // The stalls work on Friday only: show who is scheduled for this week's Friday.
  const fridayShifts = weekShifts.filter((s) => s.work_date === addDays(input.week.weekStart, 5));

  const stalls: StallSummary[] = input.stalls
    .filter((s) => s.is_active !== false)
    .sort((a, b) => num(a.sort_order) - num(b.sort_order) || a.name.localeCompare(b.name, "he"))
    .map((s) => {
      const sales = { count: 0, revenue: 0, bit: 0, cash: 0, other: 0 };
      for (const o of orders) {
        if (!isCounted(o) || orderChannel(o) !== "stall" || o.stall_id !== s.id) continue;
        const amount = num(o.total_amount);
        sales.count += 1;
        sales.revenue += amount;
        if (o.payment_method === "bit") sales.bit += amount;
        else if (o.payment_method === "cash") sales.cash += amount;
        else sales.other += amount;
      }
      const stockRows = input.stallStock.filter((r) => r.stall_id === s.id);
      return {
        id: s.id,
        name: s.name,
        location: s.location ?? null,
        is_open: Boolean(s.is_open),
        sales: {
          count: sales.count,
          revenue: round2(sales.revenue),
          bit: round2(sales.bit),
          cash: round2(sales.cash),
          other: round2(sales.other),
        },
        stock: {
          remaining: stockRows.reduce((t, r) => t + num(r.stock), 0),
          initial: stockRows.reduce((t, r) => t + num(r.initial_stock), 0),
          products: stockRows
            .map((r) => ({
              product_id: r.product_id,
              title: titles.get(r.product_id) ?? "זר",
              stock: num(r.stock),
              initial: num(r.initial_stock),
            }))
            .filter((r) => r.stock > 0 || r.initial > 0)
            .sort((a, b) => b.stock - a.stock),
        },
        workersToday: fridayShifts
          .filter((sh) => sh.stall_id === s.id)
          .sort((a, b) => a.start_time.localeCompare(b.start_time))
          .map((sh) => ({
            employee_id: sh.employee_id,
            full_name: names.get(sh.employee_id) ?? "עובד",
            start_time: hhmm(sh.start_time),
            end_time: hhmm(sh.end_time),
          })),
      };
    });

  const openToday = stalls
    .filter((s) => s.is_open)
    .map((s) => ({ id: s.id, name: s.name }));

  return {
    week: {
      weekStart: input.week.weekStart,
      weekEnd: input.week.weekEnd,
      phase: input.week.phase,
      supplierOrderAt: input.week.supplierOrderAt.toISOString(),
      closesAt: input.week.closesAt.toISOString(),
      windowFrom: win.from.toISOString(),
      supplierOrderedAt: input.supplierOrderedAt,
      today,
    },
    finance,
    payroll: { soFar: payrollSoFar, scheduled: sumPayroll(scheduled) },
    openToday,
    products: productSales(orders, input.products),
    stalls,
    team: scheduled.map((l) => ({ ...l, amountSoFar: l.employee_id ? soFarById.get(l.employee_id) ?? 0 : l.amount })),
  };
}
