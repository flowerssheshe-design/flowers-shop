import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaff } from "@/lib/staff/guard";
import { getServerSettings } from "@/lib/settings-server";
import { moneyStartWeek } from "@/lib/staff/money-start";
import { currentBusinessWeek, israelDate } from "@/lib/staff/week";
import { BUDGET_WORK_TYPES, PAID_RESPONSIBILITIES, allocatedTotal, isOwnerEmployee, type PayType } from "@/lib/staff/payroll";
import { hasPayHistory, rateForWeek } from "@/lib/staff/pay-context";
import { computePayroll } from "@/lib/staff/owner/week-math";
import {
  buildPaySummary,
  payLinesByWeek,
  type PayrollEmployeeView,
  type PayrollEntryView,
  type PayrollResponse,
} from "@/lib/staff/owner/pay-summary";
import {
  isMissingTableError,
  loadAllBudgets,
  loadAllPayrollWeeks,
  loadBusinessWeeks,
  loadEmployees,
  loadPayContext,
  loadShifts,
} from "@/lib/staff/owner/data";
import { notConfigured, serverError } from "@/lib/staff/owner/api";
import { loadPayrollEmployees } from "./shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * The pay page: every paid employee with the pay that applies this week and
 * its history, this week's budget, the one-off payments, and how much was
 * paid to each person (closed weeks + this week so far + one-off payments).
 */
export async function GET() {
  const guard = await requireStaff("payroll");
  if (!guard.ok) return guard.response;
  const nc = notConfigured();
  if (nc) return nc;

  try {
    const now = new Date();
    const admin = createAdminClient();
    const settings = await getServerSettings();
    const week = currentBusinessWeek(settings, now);

    const [people, payEmployees, ctx, entriesRes, shifts, snapshots, budgets, bw] = await Promise.all([
      loadPayrollEmployees(admin),
      loadEmployees(admin),
      loadPayContext(admin),
      admin
        .from("payroll_entries")
        .select("id, week_start, employee_id, description, amount, source, created_at")
        .order("week_start", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1000),
      loadShifts(admin, week.weekStart, week.weekEnd),
      loadAllPayrollWeeks(admin),
      loadAllBudgets(admin),
      loadBusinessWeeks(admin, [week.weekStart]),
    ]);
    if (entriesRes.error && !isMissingTableError(entriesRes.error)) return serverError("payroll entries", entriesRes.error);
    const ready = !entriesRes.error;

    const names = new Map(people.map((p) => [p.id, p.full_name]));
    const employees: PayrollEmployeeView[] = people
      .filter((p) => p.is_active !== false && !p.deleted_at && !isOwnerEmployee(p))
      .map((p) => {
        const roles = Array.isArray(p.roles) ? p.roles : [];
        const allRoles = roles.includes(p.role) ? roles : [p.role, ...roles];
        const workTypes = Array.isArray(p.work_types) ? p.work_types : [];
        const history = ctx.history.get(p.id) ?? [];
        const rate = hasPayHistory(ctx, p.id) ? rateForWeek(ctx, p.id, week.weekStart) : null;
        const n = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));
        return {
          id: p.id,
          full_name: p.full_name,
          role: p.role,
          roles: allRoles,
          work_types: workTypes,
          current: hasPayHistory(ctx, p.id)
            ? {
                pay_type: rate?.pay_type ?? null,
                pay_rate: rate?.pay_rate ?? null,
                responsibility_pay: rate?.responsibility_pay ?? null,
                since: rate?.effective_week ?? null,
              }
            : {
                pay_type: p.pay_type === "hourly" || p.pay_type === "per_shift" ? (p.pay_type as PayType) : null,
                pay_rate: n(p.pay_rate),
                responsibility_pay: n(p.responsibility_pay),
                since: null,
              },
          history: [...history].reverse(),
          paysResponsibility: allRoles.some((r) => PAID_RESPONSIBILITIES.includes(r)),
          budgetPaid: workTypes.some((w) => BUDGET_WORK_TYPES.includes(w)),
        };
      })
      .sort((a, b) => a.full_name.localeCompare(b.full_name, "he"));

    type EntryRow = {
      id: string;
      week_start: string;
      employee_id: string | null;
      description: string;
      amount: number | string;
      source: string;
      created_at: string | null;
    };
    const entries: PayrollEntryView[] = ((entriesRes.data ?? []) as EntryRow[]).map((e) => ({
      id: String(e.id),
      week_start: String(e.week_start).slice(0, 10),
      employee_id: e.employee_id ?? null,
      employee_name: e.employee_id ? names.get(e.employee_id) ?? "עובד שנמחק" : null,
      description: e.description,
      amount: Number(e.amount) || 0,
      source: e.source === "migrated_expense" ? "migrated_expense" : "manual",
      created_at: e.created_at ?? null,
    }));

    // This week so far, with the pay that applies this week. Deliveries do
    // not change pay (couriers are paid from the budget), so they are not loaded.
    const budget = budgets.get(week.weekStart);
    const currentLines = computePayroll(payEmployees, shifts, new Map(), israelDate(now), budget, ctx, week.weekStart);
    const summary = buildPaySummary({
      currentWeekStart: week.weekStart,
      startWeek: moneyStartWeek(settings),
      linesByWeek: payLinesByWeek({
        currentWeekStart: week.weekStart,
        currentLines,
        snapshots,
        ctx,
        budgets,
        employees: payEmployees,
      }),
    });

    const body: PayrollResponse = {
      ready,
      week: { weekStart: week.weekStart, weekEnd: week.weekEnd },
      budget: {
        amount: budget?.amount ?? null,
        allocated: allocatedTotal(budget),
        closed: Boolean(bw[0]?.closed_at),
      },
      employees,
      entries,
      summary,
    };
    return NextResponse.json(body);
  } catch (e) {
    return serverError("payroll", e);
  }
}
