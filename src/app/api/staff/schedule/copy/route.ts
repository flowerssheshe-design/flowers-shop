import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaff } from "@/lib/staff/guard";
import { getServerSettings } from "@/lib/settings-server";
import { addDays } from "@/lib/staff/week";
import type { StaffRole } from "@/lib/staff/access";
import { CopyWeekSchema } from "@/lib/staff/ops/schemas";
import { canBeWeekCourier, canWorkShift } from "@/lib/staff/ops/schedule";
import { resolveWeek } from "@/lib/staff/ops/week-range";
import { toShift } from "@/lib/staff/ops/shift-server";
import { jsonError, notConfigured, parseBody, serverError } from "@/lib/staff/ops/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Copies last week's shifts (and courier, if this week has none) into the given week.
 * Shifts of employees who are no longer active / eligible, or of inactive stalls, are skipped.
 * Existing shifts in the target week are kept.
 */
export async function POST(req: Request) {
  const guard = await requireStaff("schedule");
  if (!guard.ok) return guard.response;
  const nc = notConfigured();
  if (nc) return nc;
  const body = await parseBody(req, CopyWeekSchema);
  if (!body.ok) return body.response;

  try {
    const settings = await getServerSettings();
    const { weekStart } = resolveWeek(body.data.week, settings);
    const prevStart = addDays(weekStart, -7);
    const admin = createAdminClient();

    const [prevRes, empRes, stallRes, prevCourierRes, curCourierRes] = await Promise.all([
      admin
        .from("shifts")
        .select("id, work_date, start_time, end_time, shift_type, stall_id, employee_id, notes")
        .gte("work_date", prevStart)
        .lte("work_date", addDays(prevStart, 6)),
      admin.from("employees").select("id, role, work_types, is_active"),
      admin.from("stalls").select("id, is_active"),
      admin.from("week_assignments").select("employee_id").eq("week_start", prevStart).eq("assignment", "courier").maybeSingle(),
      admin.from("week_assignments").select("employee_id").eq("week_start", weekStart).eq("assignment", "courier").maybeSingle(),
    ]);
    const err = prevRes.error ?? empRes.error ?? stallRes.error ?? prevCourierRes.error ?? curCourierRes.error;
    if (err) return serverError(err, "copy load");

    const prev = (prevRes.data ?? []).map((r) => toShift(r as Record<string, unknown>));
    if (prev.length === 0 && !prevCourierRes.data) {
      return jsonError("בשבוע הקודם אין משמרות להעתיק.", 404);
    }

    const pool = new Map(
      (empRes.data ?? []).map((e) => [
        String(e.id),
        {
          id: String(e.id),
          role: e.role as StaffRole,
          work_types: Array.isArray(e.work_types) ? e.work_types.map(String) : [],
          is_active: e.is_active === true,
        },
      ]),
    );
    const activeStalls = new Set((stallRes.data ?? []).filter((s) => s.is_active).map((s) => String(s.id)));

    const me = guard.session.employee.id;
    const rows = [];
    let skipped = 0;
    for (const s of prev) {
      const member = pool.get(s.employee_id);
      const stallOk = s.shift_type !== "stall" || (s.stall_id && activeStalls.has(s.stall_id));
      if (!member || !canWorkShift(member, s.shift_type) || !stallOk) {
        skipped++;
        continue;
      }
      rows.push({
        work_date: addDays(s.work_date, 7),
        start_time: s.start_time,
        end_time: s.end_time,
        shift_type: s.shift_type,
        stall_id: s.shift_type === "stall" ? s.stall_id : null,
        employee_id: s.employee_id,
        notes: s.notes,
        created_by: me,
      });
    }
    if (rows.length > 0) {
      const { error } = await admin.from("shifts").insert(rows);
      if (error) return serverError(error, "copy insert");
    }

    let courierCopied = false;
    const prevCourier = prevCourierRes.data?.employee_id ? String(prevCourierRes.data.employee_id) : null;
    const prevCourierMember = prevCourier ? pool.get(prevCourier) : undefined;
    if (!curCourierRes.data && prevCourierMember && canBeWeekCourier(prevCourierMember)) {
      const { error } = await admin
        .from("week_assignments")
        .insert({ week_start: weekStart, assignment: "courier", employee_id: prevCourier, created_by: me });
      if (!error) courierCopied = true;
    }

    return NextResponse.json({ copied: rows.length, skipped, courierCopied });
  } catch (e) {
    return serverError(e, "copy POST");
  }
}
