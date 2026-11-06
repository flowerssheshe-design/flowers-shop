import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";
import { getServerSettings } from "@/lib/settings-server";
import { moneyStartWeek } from "@/lib/staff/money-start";
import { currentBusinessWeek, israelDate } from "@/lib/staff/week";
import { computePayroll } from "./week-math";
import { payLinesByWeek } from "./pay-summary";
import { buildPaymentsView, exclusionKey, type PaymentRow, type PaymentsView } from "./payments";
import { carryBudgetForward, loadAllBudgets, loadAllPayrollWeeks, loadEmployees, loadPayContext, loadShifts } from "./data";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * Who is owed what (same numbers as the "תשלומים" tab of the pay page), for
 * the tasks page. null before migration 046.
 */
export async function loadPaymentsView(admin: Admin, now: Date = new Date()): Promise<PaymentsView | null> {
  const settings = await getServerSettings();
  const week = currentBusinessWeek(settings, now);
  await carryBudgetForward(admin, week.weekStart);
  const [employees, ctx, shifts, snapshots, budgets, paymentsRes, exclusionsRes] = await Promise.all([
    loadEmployees(admin),
    loadPayContext(admin),
    loadShifts(admin, week.weekStart, week.weekEnd),
    loadAllPayrollWeeks(admin),
    loadAllBudgets(admin),
    admin.from("payroll_payments").select("id, week_start, employee_id, amount, note, paid_at").limit(5000),
    admin.from("payroll_exclusions").select("week_start, employee_id, part").limit(5000),
  ]);
  if (paymentsRes.error) return null;

  const currentLines = computePayroll(employees, shifts, new Map(), israelDate(now), budgets.get(week.weekStart), ctx, week.weekStart);
  const linesByWeek = payLinesByWeek({ currentWeekStart: week.weekStart, currentLines, snapshots, ctx, budgets, employees });
  const names = new Map(employees.map((e) => [e.id, e.full_name]));
  return buildPaymentsView({
    currentWeekStart: week.weekStart,
    linesByWeek,
    entries: ctx.entries.map((e) => ({
      id: e.id,
      week_start: e.week_start,
      employee_id: e.employee_id,
      description: e.description,
      amount: Number(e.amount) || 0,
    })),
    payments: ((paymentsRes.data ?? []) as Record<string, unknown>[]).map(
      (p): PaymentRow => ({
        id: String(p.id),
        week_start: String(p.week_start).slice(0, 10),
        employee_id: String(p.employee_id),
        amount: Number(p.amount) || 0,
        note: (p.note as string | null) ?? null,
        paid_at: String(p.paid_at),
      }),
    ),
    names,
    exclusions: new Set(
      ((exclusionsRes.error ? [] : exclusionsRes.data ?? []) as { week_start: string; employee_id: string; part: string }[]).map((x) =>
        exclusionKey(String(x.week_start).slice(0, 10), String(x.employee_id), String(x.part)),
      ),
    ),
    now,
    startWeek: moneyStartWeek(settings),
  });
}
