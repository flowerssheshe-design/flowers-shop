import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaff } from "@/lib/staff/guard";
import { canManageTeam } from "@/lib/staff/access";
import { getServerSettings } from "@/lib/settings-server";
import { addDays } from "@/lib/staff/week";
import { isBudgetShift, shiftHours } from "@/lib/staff/payroll";
import { canReceiveBudget, checkAllocations, type BudgetCandidate } from "@/lib/staff/ops/budget";
import { isoDate } from "@/lib/staff/ops/schemas";
import { resolveWeek } from "@/lib/staff/ops/week-range";
import { jsonError, notConfigured, parseBody, serverError } from "@/lib/staff/ops/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type EmployeeRow = BudgetCandidate & { full_name: string; deleted_at?: string | null };

async function loadWeek(weekStart: string) {
  const admin = createAdminClient();
  const [budgetRes, allocRes, empRes, shiftRes, weekRes] = await Promise.all([
    admin.from("weekly_budgets").select("amount").eq("week_start", weekStart).maybeSingle(),
    admin.from("weekly_pay_allocations").select("employee_id, amount, note").eq("week_start", weekStart),
    admin.from("employees").select("id, full_name, role, work_types, is_active, deleted_at"),
    admin
      .from("shifts")
      .select("employee_id, start_time, end_time, shift_type, work_date")
      .gte("work_date", weekStart)
      .lte("work_date", addDays(weekStart, 6)),
    admin.from("business_weeks").select("closed_at").eq("week_start", weekStart).maybeSingle(),
  ]);
  const err = budgetRes.error ?? allocRes.error ?? empRes.error ?? shiftRes.error ?? weekRes.error;
  if (err) throw err;
  return {
    admin,
    budget: budgetRes.data ? Number((budgetRes.data as { amount: number | string }).amount) : null,
    allocations: (allocRes.data ?? []) as { employee_id: string; amount: number | string; note: string | null }[],
    employees: ((empRes.data ?? []) as EmployeeRow[]).map((e) => ({
      ...e,
      work_types: Array.isArray(e.work_types) ? e.work_types : [],
    })),
    shifts: (shiftRes.data ?? []) as { employee_id: string; start_time: string; end_time: string; shift_type: string }[],
    closed: Boolean((weekRes.data as { closed_at?: string | null } | null)?.closed_at),
  };
}

/** The week's budget, how it is split, and who can get a share (with their stall/courier shifts). */
export async function GET(req: Request) {
  const guard = await requireStaff("schedule");
  if (!guard.ok) return guard.response;
  const nc = notConfigured();
  if (nc) return nc;

  try {
    const settings = await getServerSettings();
    const { weekStart } = resolveWeek(new URL(req.url).searchParams.get("week"), settings);
    const w = await loadWeek(weekStart);
    const allocated = new Map(w.allocations.map((a) => [a.employee_id, a]));

    const people = w.employees
      // Deleted employees are gone from the split (their old allocation is dropped on the next save).
      .filter((e) => !e.deleted_at && (canReceiveBudget(e) || allocated.has(e.id)))
      .map((e) => {
        const mine = w.shifts.filter((s) => s.employee_id === e.id && isBudgetShift(s.shift_type));
        const a = allocated.get(e.id);
        return {
          id: e.id,
          full_name: e.full_name,
          role: e.role,
          work_types: e.work_types,
          is_active: e.is_active,
          shifts: mine.length,
          hours: Math.round(mine.reduce((sum, s) => sum + shiftHours(s), 0) * 100) / 100,
          amount: a ? Number(a.amount) : 0,
          note: a?.note ?? null,
        };
      })
      .sort((a, b) => b.shifts - a.shifts || a.full_name.localeCompare(b.full_name, "he"));

    const total = people.reduce((sum, p) => sum + p.amount, 0);
    return NextResponse.json({
      week: weekStart,
      budget: w.budget,
      allocated: Math.round(total * 100) / 100,
      closed: w.closed,
      canSetBudget: canManageTeam(guard.session.employee),
      people,
    });
  } catch (e) {
    return serverError(e, "pay GET");
  }
}

const BudgetSchema = z.object({
  week: isoDate,
  amount: z.number().min(0).max(1_000_000),
});

/** Owners set the week's budget. */
export async function PUT(req: Request) {
  const guard = await requireStaff("schedule", canManageTeam);
  if (!guard.ok) return guard.response;
  const nc = notConfigured();
  if (nc) return nc;
  const body = await parseBody(req, BudgetSchema);
  if (!body.ok) return body.response;

  try {
    const settings = await getServerSettings();
    const { weekStart } = resolveWeek(body.data.week, settings);
    const w = await loadWeek(weekStart);
    if (w.closed) return jsonError("השבוע הזה כבר נסגר", 409);
    const allocatedTotal = w.allocations.reduce((sum, a) => sum + (Number(a.amount) || 0), 0);
    if (body.data.amount < allocatedTotal) {
      return jsonError(`מנהל המשמרות כבר חילק ${allocatedTotal} ₪. אי אפשר לקבוע תקציב נמוך מזה.`, 409);
    }
    const { error } = await w.admin.from("weekly_budgets").upsert(
      {
        week_start: weekStart,
        amount: body.data.amount,
        set_by: guard.session.employee.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "week_start" },
    );
    if (error) return serverError(error, "budget PUT");
    return NextResponse.json({ week: weekStart, budget: body.data.amount });
  } catch (e) {
    return serverError(e, "budget PUT");
  }
}

const SplitSchema = z.object({
  week: isoDate,
  allocations: z
    .array(
      z.object({
        employee_id: z.string().uuid(),
        amount: z.number().min(0).max(1_000_000),
        note: z.string().trim().max(200).optional(),
      }),
    )
    .max(200),
});

/** The ops manager (or an owner) saves the whole split of the week's budget. */
export async function POST(req: Request) {
  const guard = await requireStaff("schedule");
  if (!guard.ok) return guard.response;
  const nc = notConfigured();
  if (nc) return nc;
  const body = await parseBody(req, SplitSchema);
  if (!body.ok) return body.response;

  try {
    const settings = await getServerSettings();
    const { weekStart } = resolveWeek(body.data.week, settings);
    const w = await loadWeek(weekStart);
    if (w.closed) return jsonError("השבוע הזה כבר נסגר", 409);

    const rows = body.data.allocations.filter((a) => a.amount > 0);
    const check = checkAllocations(w.budget, rows, new Map(w.employees.map((e) => [e.id, e])));
    if (!check.ok) return jsonError(check.error, 400);

    const me = guard.session.employee.id;
    const now = new Date().toISOString();
    const keep = new Set(rows.map((r) => r.employee_id));
    const toRemove = w.allocations.filter((a) => !keep.has(a.employee_id)).map((a) => a.employee_id);

    if (rows.length > 0) {
      const { error } = await w.admin.from("weekly_pay_allocations").upsert(
        rows.map((r) => ({
          week_start: weekStart,
          employee_id: r.employee_id,
          amount: r.amount,
          note: r.note || null,
          set_by: me,
          updated_at: now,
        })),
        { onConflict: "week_start,employee_id" },
      );
      if (error) return serverError(error, "split upsert");
    }
    if (toRemove.length > 0) {
      const { error } = await w.admin
        .from("weekly_pay_allocations")
        .delete()
        .eq("week_start", weekStart)
        .in("employee_id", toRemove);
      if (error) return serverError(error, "split delete");
    }
    return NextResponse.json({ week: weekStart, allocated: check.total, budget: w.budget });
  } catch (e) {
    return serverError(e, "split POST");
  }
}
