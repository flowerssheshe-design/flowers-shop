import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaff } from "@/lib/staff/guard";
import { getServerSettings } from "@/lib/settings-server";
import type { StaffRole } from "@/lib/staff/access";
import { CourierSchema } from "@/lib/staff/ops/schemas";
import { canBeWeekCourier } from "@/lib/staff/ops/schedule";
import { resolveWeek } from "@/lib/staff/ops/week-range";
import { jsonError, notConfigured, parseBody, serverError } from "@/lib/staff/ops/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Set (or clear, with employee_id: null) the courier of the week. */
export async function PUT(req: Request) {
  const guard = await requireStaff("schedule");
  if (!guard.ok) return guard.response;
  const nc = notConfigured();
  if (nc) return nc;
  const body = await parseBody(req, CourierSchema);
  if (!body.ok) return body.response;

  try {
    const settings = await getServerSettings();
    const { weekStart } = resolveWeek(body.data.week, settings);
    const admin = createAdminClient();

    if (body.data.employee_id === null) {
      const { error } = await admin
        .from("week_assignments")
        .delete()
        .eq("week_start", weekStart)
        .eq("assignment", "courier");
      if (error) return serverError(error, "courier clear");
      return NextResponse.json({ courierId: null });
    }

    const { data: emp, error: empErr } = await admin
      .from("employees")
      .select("id, role, work_types, is_active")
      .eq("id", body.data.employee_id)
      .maybeSingle();
    if (empErr) return serverError(empErr, "courier employee");
    if (!emp) return jsonError("העובד לא נמצא", 404);
    const ok = canBeWeekCourier({
      id: String(emp.id),
      role: emp.role as StaffRole,
      work_types: Array.isArray(emp.work_types) ? emp.work_types.map(String) : [],
      is_active: emp.is_active === true,
    });
    if (!ok) return jsonError("אפשר לבחור רק עובד פעיל שמוגדר כשליח, או מנהל.", 400);

    const { error } = await admin.from("week_assignments").upsert(
      {
        week_start: weekStart,
        assignment: "courier",
        employee_id: body.data.employee_id,
        created_by: guard.session.employee.id,
      },
      { onConflict: "week_start,assignment" },
    );
    if (error) return serverError(error, "courier upsert");
    return NextResponse.json({ courierId: body.data.employee_id });
  } catch (e) {
    return serverError(e, "courier PUT");
  }
}
