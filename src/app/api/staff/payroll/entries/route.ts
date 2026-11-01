import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaff } from "@/lib/staff/guard";
import { getServerSettings } from "@/lib/settings-server";
import { currentBusinessWeek } from "@/lib/staff/week";
import { isOwnerEmployee } from "@/lib/staff/payroll";
import { sundayOf } from "@/lib/staff/pay-context";
import { isMissingTableError } from "@/lib/staff/owner/data";
import { jsonError, notConfigured, parseBody, serverError } from "@/lib/staff/ops/http";
import { EntrySchema, loadPayrollEmployees } from "../shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Adds a one-off payment (bonus, extra) for an employee in a week. It adds to
 * that week's pay everywhere (money page, "my area", pay summary) and is never
 * part of the closed-week snapshots, so it may be added to a closed week too.
 */
export async function POST(req: Request) {
  const guard = await requireStaff("payroll");
  if (!guard.ok) return guard.response;
  const nc = notConfigured();
  if (nc) return nc;
  const body = await parseBody(req, EntrySchema);
  if (!body.ok) return body.response;
  const v = body.data;

  try {
    const admin = createAdminClient();
    const [target] = await loadPayrollEmployees(admin, v.employee_id);
    if (!target || target.deleted_at) return jsonError("עובד לא נמצא", 404);
    if (isOwnerEmployee(target)) return jsonError("מנהלים ראשיים לא מקבלים שכר במערכת.", 400);

    const settings = await getServerSettings();
    const current = currentBusinessWeek(settings).weekStart;
    const week = sundayOf(v.week_start);
    if (week > current) return jsonError("אפשר לרשום תשלום עד השבוע הנוכחי.", 400);

    const { data, error } = await admin
      .from("payroll_entries")
      .insert({
        week_start: week,
        employee_id: target.id,
        description: v.description,
        amount: Math.round(v.amount * 100) / 100,
        source: "manual",
        created_by: guard.session.employee.id,
      })
      .select("id, week_start, employee_id, description, amount, source, created_at")
      .single();
    if (error) {
      if (isMissingTableError(error)) return jsonError("טבלת התשלומים עוד לא קיימת. צריך להריץ את מיגרציה 039.", 409);
      return serverError(error, "payroll entry POST");
    }
    return NextResponse.json({ entry: data });
  } catch (e) {
    return serverError(e, "payroll entry POST");
  }
}
