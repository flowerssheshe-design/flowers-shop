import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/staff/guard";
import { addDays } from "@/lib/staff/week";
import {
  computeEarningsByWeek,
  employeeForWeek,
  isOwnerEmployee,
  shiftHours,
  weeklyResponsibilityPay,
  type PayEmployee,
  type PayShift,
} from "@/lib/staff/payroll";
import { dateSpanRange, monthSpan, weekStartsInSpan } from "@/lib/staff/work/ranges";
import { jsonError, workContext } from "@/lib/staff/work/server";
import { loadPayContext } from "@/lib/staff/owner/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type ShiftRow = PayShift & {
  id: string;
  work_date: string;
  shift_type: string;
  stall_id: string | null;
  notes: string | null;
  stalls: { name: string } | null;
};

type MeRow = {
  id: string;
  role: string;
  roles?: string[] | null;
  pay_type: string | null;
  pay_rate: number | string | null;
  responsibility_pay?: number | string | null;
  is_active?: boolean | null;
  deleted_at?: string | null;
};

/** Newer columns (037 roles/deleted_at, 038 responsibility_pay) are dropped when missing. */
const ME_SELECTS = [
  "id, role, roles, pay_type, pay_rate, is_active, deleted_at, responsibility_pay",
  "id, role, roles, pay_type, pay_rate, is_active, deleted_at",
  "id, role, pay_type, pay_rate",
];

async function loadMe(
  admin: Awaited<ReturnType<typeof workContext>>["admin"],
  id: string,
): Promise<{ data: MeRow | null; error: unknown }> {
  let lastError: unknown = null;
  for (const columns of ME_SELECTS) {
    const { data, error } = await admin.from("employees").select(columns).eq("id", id).single();
    if (!error) return { data: data as unknown as MeRow, error: null };
    lastError = error;
  }
  return { data: null, error: lastError };
}

/** "My area": my shifts this week and next, my hours and (for paid staff) my earnings. */
export async function GET() {
  const guard = await requireStaff("me");
  if (!guard.ok) return guard.response;
  const me = guard.session.employee;

  try {
    const { admin, week, today } = await workContext();
    const month = monthSpan(today);
    const nextWeekEnd = addDays(week.weekStart, 13);
    // One query covers this week, next week and the whole month.
    const from = month.first < week.weekStart ? month.first : week.weekStart;
    const to = month.last > nextWeekEnd ? month.last : nextWeekEnd;

    const [empRes, shiftsRes] = await Promise.all([
      loadMe(admin, me.id),
      admin
        .from("shifts")
        .select("id, employee_id, work_date, start_time, end_time, shift_type, stall_id, notes, stalls(name)")
        .eq("employee_id", me.id)
        .gte("work_date", from)
        .lte("work_date", to)
        .order("work_date", { ascending: true })
        .order("start_time", { ascending: true }),
    ]);
    if (empRes.error || !empRes.data) return jsonError("לא הצלחנו לטעון את הפרטים שלך", 500);
    if (shiftsRes.error) return jsonError("לא הצלחנו לטעון את המשמרות", 500);

    const row = empRes.data;
    const employee: PayEmployee = {
      id: String(row.id),
      role: String(row.role),
      roles: Array.isArray(row.roles) ? row.roles : null,
      pay_type: (row.pay_type ?? null) as PayEmployee["pay_type"],
      pay_rate: row.pay_rate === null || row.pay_rate === undefined ? null : Number(row.pay_rate),
      responsibility_pay: row.responsibility_pay ?? null,
      is_active: row.is_active ?? null,
      deleted_at: row.deleted_at ?? null,
    };
    const shifts = (shiftsRes.data ?? []) as unknown as ShiftRow[];
    const inSpan = (first: string, last: string) =>
      shifts.filter((s) => s.work_date >= first && s.work_date <= last);

    const toView = (s: ShiftRow) => ({
      id: s.id,
      work_date: s.work_date,
      start_time: s.start_time.slice(0, 5),
      end_time: s.end_time.slice(0, 5),
      shift_type: s.shift_type,
      stall_name: s.stalls?.name ?? null,
      notes: s.notes,
      hours: shiftHours(s),
    });

    const weekShifts = inSpan(week.weekStart, week.weekEnd);
    const nextShifts = inSpan(addDays(week.weekStart, 7), nextWeekEnd);
    const monthShifts = inSpan(month.first, month.last);

    const isOwner = isOwnerEmployee(employee);
    let earnings: { week: ReturnType<typeof computeEarningsByWeek>; month: ReturnType<typeof computeEarningsByWeek> } | null =
      null;
    // The pay settings of this week (pay changes never rewrite earlier weeks).
    let payNow: PayEmployee = employee;

    if (!isOwner) {
      const weekRange = dateSpanRange(week.weekStart, week.weekEnd);
      const monthRange = dateSpanRange(month.first, month.last);
      const countDelivered = async (r: { from: string; to: string }) => {
        const { count, error } = await admin
          .from("orders")
          .select("id", { count: "exact", head: true })
          .eq("delivered_by", me.id)
          .eq("status", "completed")
          .eq("delivery_type", "delivery")
          .gte("delivered_at", r.from)
          .lt("delivered_at", r.to);
        if (error) throw error;
        return count ?? 0;
      };
      const [weekDeliveries, monthDeliveries, allocRes, payContext] = await Promise.all([
        countDelivered(weekRange),
        countDelivered(monthRange),
        // What the shift manager gave me from the weekly budget. A week counts in
        // the month its Sunday falls in.
        admin
          .from("weekly_pay_allocations")
          .select("week_start, amount")
          .eq("employee_id", me.id)
          .gte("week_start", month.first < week.weekStart ? month.first : week.weekStart)
          .lte("week_start", month.last > week.weekStart ? month.last : week.weekStart),
        // My pay history and one-off payments.
        loadPayContext(admin, { employeeId: me.id }),
      ]);
      const allocations = (allocRes.error ? [] : allocRes.data ?? []) as { week_start: string; amount: number | string }[];
      const allocByWeek = new Map<string, number>();
      for (const a of allocations) {
        allocByWeek.set(a.week_start, (allocByWeek.get(a.week_start) ?? 0) + (Number(a.amount) || 0));
      }
      // Each week is paid with the setting that applied in it. The budget share,
      // responsibility pay and one-off payments count once per business week; the
      // month counts the weeks whose Sunday falls in it.
      const monthWeeks = weekStartsInSpan(week.weekStart, month.first, month.last);
      earnings = {
        week: computeEarningsByWeek(employee, weekShifts, weekDeliveries, {
          weeks: [week.weekStart],
          allocations: allocByWeek,
          ctx: payContext,
        }),
        month: computeEarningsByWeek(employee, monthShifts, monthDeliveries, {
          weeks: monthWeeks,
          allocations: allocByWeek,
          ctx: payContext,
        }),
      };
      payNow = employeeForWeek(employee, payContext, week.weekStart);
    } else {
      // Owners see hours only.
      const hoursOf = (list: ShiftRow[]) => list.reduce((sum, s) => sum + shiftHours(s), 0);
      return NextResponse.json({
        isOwner,
        today,
        week: { start: week.weekStart, end: week.weekEnd },
        month,
        pay: null,
        earnings: null,
        hours: {
          week: Math.round(hoursOf(weekShifts) * 100) / 100,
          month: Math.round(hoursOf(monthShifts) * 100) / 100,
        },
        shifts: { thisWeek: weekShifts.map(toView), nextWeek: nextShifts.map(toView) },
      });
    }

    return NextResponse.json({
      isOwner,
      today,
      week: { start: week.weekStart, end: week.weekEnd },
      month,
      pay: {
        pay_type: payNow.pay_type,
        pay_rate: payNow.pay_rate === null || payNow.pay_rate === undefined ? null : Number(payNow.pay_rate),
        responsibility_pay: weeklyResponsibilityPay(payNow) || null,
      },
      earnings,
      hours: { week: earnings.week.hours, month: earnings.month.hours },
      shifts: { thisWeek: weekShifts.map(toView), nextWeek: nextShifts.map(toView) },
    });
  } catch (e) {
    console.error("staff/me/summary failed:", e);
    return jsonError("שגיאת שרת. נסו שוב.", 500);
  }
}
