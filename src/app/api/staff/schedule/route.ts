import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaff } from "@/lib/staff/guard";
import { getServerSettings } from "@/lib/settings-server";
import { ShiftSchema } from "@/lib/staff/ops/schemas";
import { resolveWeek } from "@/lib/staff/ops/week-range";
import { toTeamMember, type EmployeeRow } from "@/lib/staff/ops/team";
import { SHIFT_COLUMNS, overlapWarnings, toShift, validateShiftRefs } from "@/lib/staff/ops/shift-server";
import { jsonError, notConfigured, parseBody, serverError } from "@/lib/staff/ops/http";
import type { ScheduleData, Stall } from "@/lib/staff/ops/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/** A week of shifts + the employee pool (never pay), stalls and the week's courier. */
export async function GET(req: Request) {
  const guard = await requireStaff("schedule");
  if (!guard.ok) return guard.response;
  const nc = notConfigured();
  if (nc) return nc;

  try {
    const settings = await getServerSettings();
    const week = resolveWeek(new URL(req.url).searchParams.get("week"), settings);
    const admin = createAdminClient();
    const [shiftsRes, employeesRes, stallsRes, courierRes] = await Promise.all([
      admin
        .from("shifts")
        .select(SHIFT_COLUMNS)
        .gte("work_date", week.weekStart)
        .lte("work_date", week.weekEnd)
        .order("work_date")
        .order("start_time"),
      // Public columns only — pay never leaves the server here.
      admin.from("employees").select("id, full_name, phone, role, work_types, is_active").order("full_name"),
      admin.from("stalls").select("id, name, location, is_active, is_open, sort_order").order("sort_order").order("name"),
      admin
        .from("week_assignments")
        .select("employee_id")
        .eq("week_start", week.weekStart)
        .eq("assignment", "courier")
        .maybeSingle(),
    ]);
    const err = shiftsRes.error ?? employeesRes.error ?? stallsRes.error ?? courierRes.error;
    if (err) return serverError(err, "schedule GET");

    const shifts = (shiftsRes.data ?? []).map((r) => toShift(r as Record<string, unknown>));
    const referenced = new Set(shifts.map((s) => s.employee_id));
    if (courierRes.data?.employee_id) referenced.add(String(courierRes.data.employee_id));
    // Active employees, plus inactive ones that still appear in this week.
    const employees = ((employeesRes.data ?? []) as unknown as EmployeeRow[])
      .filter((e) => e.is_active || referenced.has(String(e.id)))
      .map(toTeamMember);

    const data: ScheduleData = {
      weekStart: week.weekStart,
      weekEnd: week.weekEnd,
      isCurrentWeek: week.isCurrentWeek,
      shifts,
      employees,
      stalls: (stallsRes.data ?? []) as Stall[],
      courierId: courierRes.data?.employee_id ? String(courierRes.data.employee_id) : null,
    };
    return NextResponse.json(data);
  } catch (e) {
    return serverError(e, "schedule GET");
  }
}

/** Add a shift. Overlaps are allowed but come back as warnings. */
export async function POST(req: Request) {
  const guard = await requireStaff("schedule");
  if (!guard.ok) return guard.response;
  const nc = notConfigured();
  if (nc) return nc;
  const body = await parseBody(req, ShiftSchema);
  if (!body.ok) return body.response;
  const v = body.data;
  const stall_id = v.shift_type === "stall" ? v.stall_id ?? null : null;

  try {
    const admin = createAdminClient();
    const refError = await validateShiftRefs(admin, { shift_type: v.shift_type, employee_id: v.employee_id, stall_id });
    if (refError) return jsonError(refError, 400);

    const { data, error } = await admin
      .from("shifts")
      .insert({
        work_date: v.work_date,
        start_time: v.start_time,
        end_time: v.end_time,
        shift_type: v.shift_type,
        stall_id,
        employee_id: v.employee_id,
        notes: v.notes || null,
        created_by: guard.session.employee.id,
      })
      .select(SHIFT_COLUMNS)
      .single();
    if (error) return serverError(error, "schedule POST");
    const shift = toShift(data as Record<string, unknown>);
    const warnings = await overlapWarnings(admin, shift);
    return NextResponse.json({ shift, warnings });
  } catch (e) {
    return serverError(e, "schedule POST");
  }
}
