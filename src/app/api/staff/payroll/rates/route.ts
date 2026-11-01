import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaff } from "@/lib/staff/guard";
import { getServerSettings } from "@/lib/settings-server";
import { currentBusinessWeek } from "@/lib/staff/week";
import { PAID_RESPONSIBILITIES, isOwnerEmployee } from "@/lib/staff/payroll";
import { HISTORY_SEED_WEEK } from "@/lib/staff/pay-context";
import { isMissingTableError } from "@/lib/staff/owner/data";
import { jsonError, notConfigured, parseBody, serverError } from "@/lib/staff/ops/http";
import { RateSchema, loadPayrollEmployees } from "../shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const NOT_READY = "טבלת היסטוריית השכר עוד לא קיימת. צריך להריץ את מיגרציה 039.";

/**
 * Sets an employee's pay from this business week on. Earlier weeks keep the
 * pay they had: the change is stored in employee_pay_history with
 * effective_week = this week's Sunday (saving twice in a week overwrites that
 * week's row). employees.pay_type / pay_rate / responsibility_pay are kept
 * equal to the latest values for older screens.
 */
export async function PUT(req: Request) {
  const guard = await requireStaff("payroll");
  if (!guard.ok) return guard.response;
  const nc = notConfigured();
  if (nc) return nc;
  const body = await parseBody(req, RateSchema);
  if (!body.ok) return body.response;
  const v = body.data;

  try {
    const admin = createAdminClient();
    const [target] = await loadPayrollEmployees(admin, v.employee_id);
    if (!target || target.deleted_at) return jsonError("עובד לא נמצא", 404);
    if (isOwnerEmployee(target)) return jsonError("מנהלים ראשיים לא מקבלים שכר במערכת.", 400);

    const roles = Array.isArray(target.roles) ? [...target.roles, target.role] : [target.role];
    const paysResponsibility = roles.some((r) => PAID_RESPONSIBILITIES.includes(r));
    if (!paysResponsibility && v.responsibility_pay !== null && v.responsibility_pay > 0) {
      return jsonError("שכר על אחריות רק למנהל הזמנות ומשמרות או לאחראי שיווק.", 400);
    }
    const round = (n: number | null) => (n === null ? null : Math.round(n * 100) / 100);
    const next = {
      pay_type: v.pay_type,
      pay_rate: v.pay_type ? round(v.pay_rate) : null,
      responsibility_pay: paysResponsibility ? round(v.responsibility_pay) : null,
    };

    const settings = await getServerSettings();
    const week = currentBusinessWeek(settings).weekStart;

    // First change for someone without history (e.g. added after migration
    // 039 by an old screen): keep their old pay for the weeks before.
    const existing = await admin.from("employee_pay_history").select("effective_week").eq("employee_id", target.id).limit(1);
    if (existing.error) {
      if (isMissingTableError(existing.error)) return jsonError(NOT_READY, 409);
      return serverError(existing.error, "payroll rates history");
    }
    const oldType = target.pay_type === "hourly" || target.pay_type === "per_shift" ? target.pay_type : null;
    const oldRate = target.pay_rate === null || target.pay_rate === undefined ? null : Number(target.pay_rate);
    const oldResp =
      target.responsibility_pay === null || target.responsibility_pay === undefined ? null : Number(target.responsibility_pay);
    if ((existing.data ?? []).length === 0 && week > HISTORY_SEED_WEEK && (oldType || oldRate !== null || oldResp !== null)) {
      const seed = await admin.from("employee_pay_history").upsert(
        {
          employee_id: target.id,
          effective_week: HISTORY_SEED_WEEK,
          pay_type: oldType,
          pay_rate: oldRate !== null && oldRate >= 0 ? oldRate : null,
          responsibility_pay: oldResp !== null && oldResp >= 0 ? oldResp : null,
        },
        { onConflict: "employee_id,effective_week", ignoreDuplicates: true },
      );
      if (seed.error) return serverError(seed.error, "payroll rates seed");
    }

    const { error } = await admin.from("employee_pay_history").upsert(
      {
        employee_id: target.id,
        effective_week: week,
        ...next,
        created_by: guard.session.employee.id,
        created_at: new Date().toISOString(),
      },
      { onConflict: "employee_id,effective_week" },
    );
    if (error) return serverError(error, "payroll rates upsert");

    // Keep the employee columns equal to the latest pay (older screens read them).
    let upd = await admin.from("employees").update(next).eq("id", target.id);
    if (upd.error && /responsibility_pay/.test(upd.error.message ?? "")) {
      upd = await admin.from("employees").update({ pay_type: next.pay_type, pay_rate: next.pay_rate }).eq("id", target.id);
    }
    if (upd.error) return serverError(upd.error, "payroll rates employee");

    return NextResponse.json({ ok: true, employee_id: target.id, effective_week: week, ...next });
  } catch (e) {
    return serverError(e, "payroll rates");
  }
}
