import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaff } from "@/lib/staff/guard";
import { getServerSettings } from "@/lib/settings-server";
import { currentBusinessWeek } from "@/lib/staff/week";
import { isOwnerEmployee } from "@/lib/staff/payroll";
import { sundayOf } from "@/lib/staff/pay-context";
import { isMissingTableError } from "@/lib/staff/owner/data";
import { jsonError, notConfigured, parseBody, serverError } from "@/lib/staff/ops/http";
import { loadPayrollEmployees } from "../shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const Body = z.object({
  employee_id: z.string().uuid({ message: "בחרו עובד" }),
  week_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "בחרו שבוע"),
  amount: z.number({ invalid_type_error: "כתבו סכום במספרים" }).gt(0, "הסכום צריך להיות גדול מ-0").max(100000, "הסכום גבוה מדי"),
  note: z.string().trim().max(200).optional(),
});

/** "שולם": records money actually paid to an employee for a week (owners only). */
export async function POST(req: Request) {
  const guard = await requireStaff("payroll");
  if (!guard.ok) return guard.response;
  const nc = notConfigured();
  if (nc) return nc;
  const body = await parseBody(req, Body);
  if (!body.ok) return body.response;
  const v = body.data;

  try {
    const admin = createAdminClient();
    const [target] = await loadPayrollEmployees(admin, v.employee_id);
    if (!target) return jsonError("עובד לא נמצא", 404);
    if (isOwnerEmployee(target)) return jsonError("מנהלים ראשיים לא מקבלים שכר במערכת.", 400);
    const week = sundayOf(v.week_start);
    if (week > currentBusinessWeek(await getServerSettings()).weekStart) return jsonError("אפשר לשלם עד השבוע הנוכחי.", 400);

    const { data, error } = await admin
      .from("payroll_payments")
      .insert({
        week_start: week,
        employee_id: target.id,
        amount: Math.round(v.amount * 100) / 100,
        note: v.note || null,
        paid_by: guard.session.employee.id,
      })
      .select("id, week_start, employee_id, amount, note, paid_at")
      .single();
    if (error) {
      if (isMissingTableError(error)) return jsonError("טבלת התשלומים עוד לא קיימת. צריך להריץ את מיגרציה 046.", 409);
      return serverError(error, "payment POST");
    }
    return NextResponse.json({ payment: data });
  } catch (e) {
    return serverError(e, "payment POST");
  }
}
