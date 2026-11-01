import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ExpenseBucket } from "@/lib/expenses";
import type { WeekBudget } from "@/lib/staff/payroll";
import { buildPayContext, emptyPayContext, type PayContext } from "@/lib/staff/pay-context";
import type {
  EmployeeRow,
  OrderRow,
  PayrollSnapshotRow,
  ProductRow,
  ShiftRow,
  StallRow,
  StallStockRow,
  SupplierLineRow,
} from "./week-math";

type Admin = ReturnType<typeof createAdminClient>;

export const ORDER_COLUMNS =
  "id, created_at, status, order_type, total_amount, delivery_fee, items, payment_method, stall_id, notes, customer_name, customer_phone, delivered_by, delivered_at, delivery_type, is_member, user_id";

/** Postgres / PostgREST error for a table that doesn't exist yet. */
export function isMissingTableError(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  return err.code === "42P01" || err.code === "PGRST205" || /does not exist|schema cache/i.test(err.message ?? "");
}

function fail(what: string, error: { message?: string } | null): never {
  throw new Error(`${what}: ${error?.message ?? "unknown error"}`);
}

export async function loadOrders(admin: Admin, from: Date, to: Date): Promise<OrderRow[]> {
  const { data, error } = await admin
    .from("orders")
    .select(ORDER_COLUMNS)
    .gte("created_at", from.toISOString())
    .lt("created_at", to.toISOString())
    .order("created_at", { ascending: true })
    .limit(10000);
  if (error) fail("orders", error);
  return (data ?? []) as unknown as OrderRow[];
}

export async function loadProducts(admin: Admin): Promise<ProductRow[]> {
  // order_mode comes with migration 042; fall back without it.
  const withMode = await admin
    .from("products")
    .select("id, title, cost_price, price_standard, default_order_qty, order_mode, is_active, sort_order")
    .order("sort_order", { ascending: true });
  if (!withMode.error) return (withMode.data ?? []) as ProductRow[];
  const { data, error } = await admin
    .from("products")
    .select("id, title, cost_price, price_standard, default_order_qty, is_active, sort_order")
    .order("sort_order", { ascending: true });
  if (error) {
    // default_order_qty may be missing before migration 031.
    const retry = await admin
      .from("products")
      .select("id, title, cost_price, price_standard, is_active, sort_order")
      .order("sort_order", { ascending: true });
    if (retry.error) fail("products", retry.error);
    return (retry.data ?? []) as ProductRow[];
  }
  return (data ?? []) as ProductRow[];
}

export async function loadExpenses(admin: Admin): Promise<ExpenseBucket[]> {
  const { data, error } = await admin
    .from("expenses")
    .select("amount, expense_type, expense_date, creation_date, created_at, is_active");
  if (error) fail("expenses", error);
  return (data ?? []) as ExpenseBucket[];
}

/**
 * Every employee with what pay needs. Newer columns (roles / deleted_at from
 * migration 037, responsibility_pay from 038) are dropped when the live table
 * doesn't have them yet.
 */
export const EMPLOYEE_PAY_SELECTS = [
  "id, full_name, role, roles, pay_type, pay_rate, is_active, deleted_at, responsibility_pay",
  "id, full_name, role, roles, pay_type, pay_rate, is_active, deleted_at",
  "id, full_name, role, pay_type, pay_rate, is_active",
] as const;

export async function loadEmployees(admin: Admin): Promise<EmployeeRow[]> {
  let lastError: { message?: string } | null = null;
  for (const columns of EMPLOYEE_PAY_SELECTS) {
    const { data, error } = await admin.from("employees").select(columns);
    if (!error) return (data ?? []) as unknown as EmployeeRow[];
    lastError = error;
  }
  fail("employees", lastError);
}

export async function loadShifts(admin: Admin, fromDate: string, toDate: string): Promise<ShiftRow[]> {
  const { data, error } = await admin
    .from("shifts")
    .select("id, work_date, start_time, end_time, shift_type, stall_id, employee_id")
    .gte("work_date", fromDate)
    .lte("work_date", toDate);
  if (error) fail("shifts", error);
  return (data ?? []) as ShiftRow[];
}

export async function loadStalls(admin: Admin): Promise<StallRow[]> {
  const { data, error } = await admin.from("stalls").select("id, name, location, is_active, is_open, sort_order");
  if (error) fail("stalls", error);
  return (data ?? []) as StallRow[];
}

export async function loadStallStock(admin: Admin): Promise<StallStockRow[]> {
  const { data, error } = await admin.from("stall_inventory").select("stall_id, product_id, stock, initial_stock");
  if (error) fail("stall_inventory", error);
  return (data ?? []) as StallStockRow[];
}

export type BusinessWeekRow = {
  week_start: string;
  supplier_order_at: string;
  supplier_ordered_at: string | null;
  closed_at: string | null;
};

export async function loadBusinessWeeks(admin: Admin, weekStarts: string[]): Promise<BusinessWeekRow[]> {
  if (weekStarts.length === 0) return [];
  const { data, error } = await admin
    .from("business_weeks")
    .select("week_start, supplier_order_at, supplier_ordered_at, closed_at")
    .in("week_start", weekStarts);
  if (error) fail("business_weeks", error);
  return (data ?? []) as BusinessWeekRow[];
}

export async function loadSupplierLines(
  admin: Admin,
  weekStarts: string[],
): Promise<(SupplierLineRow & { week_start: string })[]> {
  if (weekStarts.length === 0) return [];
  const withMode = await admin
    .from("supplier_order_lines")
    .select("week_start, product_id, preorder_qty, extra_qty, final_qty, order_mode")
    .in("week_start", weekStarts);
  if (!withMode.error) return (withMode.data ?? []) as (SupplierLineRow & { week_start: string })[];
  // Before migration 042 there is no order_mode.
  const { data, error } = await admin
    .from("supplier_order_lines")
    .select("week_start, product_id, preorder_qty, extra_qty, final_qty")
    .in("week_start", weekStarts);
  if (error) fail("supplier_order_lines", error);
  return (data ?? []) as (SupplierLineRow & { week_start: string })[];
}

export async function loadPayrollWeeks(admin: Admin, weekStarts: string[]): Promise<PayrollSnapshotRow[]> {
  if (weekStarts.length === 0) return [];
  const { data, error } = await admin
    .from("payroll_weeks")
    .select("week_start, employee_id, hours, shifts_count, deliveries_count, amount")
    .in("week_start", weekStarts);
  if (error) fail("payroll_weeks", error);
  return (data ?? []) as PayrollSnapshotRow[];
}

/**
 * Weekly pay budgets and the ops manager's split, per week_start. Tolerates
 * the tables not existing yet (before migration 036): returns an empty map.
 */
export async function loadBudgets(admin: Admin, weekStarts: string[]): Promise<Map<string, WeekBudget>> {
  const out = new Map<string, WeekBudget>();
  if (weekStarts.length === 0) return out;
  const [budgets, allocations] = await Promise.all([
    admin.from("weekly_budgets").select("week_start, amount").in("week_start", weekStarts),
    admin.from("weekly_pay_allocations").select("week_start, employee_id, amount").in("week_start", weekStarts),
  ]);
  if (budgets.error || allocations.error) {
    console.error("loadBudgets:", budgets.error ?? allocations.error);
    return out;
  }
  for (const w of weekStarts) out.set(w, { weekStart: w, amount: null, allocations: new Map() });
  for (const b of (budgets.data ?? []) as { week_start: string; amount: number | string }[]) {
    out.get(b.week_start)!.amount = Number(b.amount) || 0;
  }
  for (const a of (allocations.data ?? []) as { week_start: string; employee_id: string; amount: number | string }[]) {
    out.get(a.week_start)?.allocations.set(a.employee_id, Number(a.amount) || 0);
  }
  return out;
}

/** Creates the business_weeks row for a week if it does not exist yet. */
export async function ensureBusinessWeek(admin: Admin, weekStart: string, supplierOrderAt: Date): Promise<void> {
  const { error } = await admin
    .from("business_weeks")
    .upsert(
      { week_start: weekStart, supplier_order_at: supplierOrderAt.toISOString() },
      { onConflict: "week_start", ignoreDuplicates: true },
    );
  if (error) fail("business_weeks", error);
}

/** Every weekly budget and its split, per week_start (empty before migration 036). */
export async function loadAllBudgets(admin: Admin): Promise<Map<string, WeekBudget>> {
  const { data, error } = await admin.from("weekly_budgets").select("week_start").limit(5000);
  if (error) {
    console.error("loadAllBudgets:", error);
    return new Map();
  }
  const weeks = ((data ?? []) as { week_start: string }[]).map((r) => String(r.week_start).slice(0, 10));
  return loadBudgets(admin, weeks);
}

/** Every payroll_weeks snapshot (all closed weeks), for the pay summary. */
export async function loadAllPayrollWeeks(admin: Admin): Promise<PayrollSnapshotRow[]> {
  const { data, error } = await admin
    .from("payroll_weeks")
    .select("week_start, employee_id, hours, shifts_count, deliveries_count, amount")
    .order("week_start", { ascending: true })
    .limit(20000);
  if (error) fail("payroll_weeks", error);
  return (data ?? []) as PayrollSnapshotRow[];
}

/**
 * Pay history (employee_pay_history) and one-off payments (payroll_entries),
 * for computePayroll(..., ctx). Tolerates the tables not existing yet (before
 * migration 039): returns an empty context, so pay uses the employee columns.
 * `employeeId` limits both to one employee, for "my area".
 * `strict` (week close): any other error throws instead of falling back, so a
 * snapshot is never written with the wrong rates.
 */
export async function loadPayContext(
  admin: Admin,
  opts: { employeeId?: string; strict?: boolean } = {},
): Promise<PayContext> {
  let historyQuery = admin
    .from("employee_pay_history")
    .select("employee_id, effective_week, pay_type, pay_rate, responsibility_pay")
    .order("effective_week", { ascending: true })
    .limit(20000);
  let entriesQuery = admin
    .from("payroll_entries")
    .select("id, week_start, employee_id, description, amount")
    .order("week_start", { ascending: true })
    .limit(20000);
  if (opts.employeeId) {
    historyQuery = historyQuery.eq("employee_id", opts.employeeId);
    entriesQuery = entriesQuery.eq("employee_id", opts.employeeId);
  }
  const [history, entries] = await Promise.all([historyQuery, entriesQuery]);
  const error = history.error ?? entries.error;
  if (error) {
    if (opts.strict && !isMissingTableError(error)) fail("pay history", error);
    console.error("loadPayContext:", error);
    return emptyPayContext();
  }
  return buildPayContext(
    (history.data ?? []) as Parameters<typeof buildPayContext>[0],
    (entries.data ?? []) as Parameters<typeof buildPayContext>[1],
  );
}
