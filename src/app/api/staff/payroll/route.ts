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
import { buildPaymentsView, exclusionKey, type PaymentRow } from "@/lib/staff/owner/payments";

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

    const [people, payEmployees, ctx, entriesRes, shifts, snapshots, budgets, bw, paymentsRes, exclusionsRes] = await Promise.all([
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
      admin
        .from("payroll_payments")
        .select("id, week_start, employee_id, amount, note, paid_at")
        .order("paid_at", { ascending: false })
        .limit(5000),
      // ✗ marks (migration 047); missing table = nothing skipped.
      admin.from("payroll_exclusions").select("week_start, employee_id, part").limit(5000),
    ]);
    const exclusions = new Set(
      ((exclusionsRes.error ? [] : exclusionsRes.data ?? []) as { week_start: string; employee_id: string; part: string }[]).map((x) =>
        exclusionKey(String(x.week_start).slice(0, 10), String(x.employee_id), String(x.part)),
      ),
    );
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
    const linesByWeek = payLinesByWeek({
      currentWeekStart: week.weekStart,
      currentLines,
      snapshots,
      ctx,
      budgets,
      employees: payEmployees,
    });
    const summary = buildPaySummary({
      currentWeekStart: week.weekStart,
      startWeek: moneyStartWeek(settings),
      linesByWeek,
    });

    // Before migration 046 there is no payments table: the screen says so.
    const payments = paymentsRes.error
      ? null
      : buildPaymentsView({
          currentWeekStart: week.weekStart,
          linesByWeek,
          entries: entries.map((e) => ({
            id: e.id,
            week_start: e.week_start,
            employee_id: e.employee_id,
            description: e.description,
            amount: e.amount,
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
          exclusions,
          now,
          startWeek: moneyStartWeek(settings),
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
      payments,
    };
    return NextResponse.json(body);
  } catch (e) {
    return serverError("payroll", e);
  }
}
