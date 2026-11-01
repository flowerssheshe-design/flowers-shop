import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaff } from "@/lib/staff/guard";
import { canManageTeam } from "@/lib/staff/access";
import { normalizePhone } from "@/lib/staff/phone";
import { hashPin } from "@/lib/staff/pin";
import { sundayOf } from "@/lib/staff/pay-context";
import {
  DUPLICATE_PHONE_ERROR,
  EMPLOYEE_COLUMNS,
  EMPLOYEE_COLUMNS_LEGACY,
  checkEmployeeChange,
  checkOpsEmployeeInput,
  isDuplicatePhoneError,
  isOpsManageable,
  payFieldsError,
  resolveRoles,
  viewEmployeeFor,
  withResponsibilityColumn,
  workTypesForRole,
  type EmployeeRow,
} from "@/lib/staff/ops/team";
import { EmployeeUpdateSchema } from "@/lib/staff/ops/schemas";
import { UUID_RE, jsonError, notConfigured, parseBody, serverError } from "@/lib/staff/ops/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Edit an employee, set a new PIN or unlock the account. Never pay: that is
 * set on the pay page (/staff/payroll).
 * Owners: anyone. Shift managers: only stall sellers and couriers, never role.
 */
export async function PATCH(req: Request, ctx: { params: { id: string } }) {
  const guard = await requireStaff("team");
  if (!guard.ok) return guard.response;
  const nc = notConfigured();
  if (nc) return nc;
  const id = ctx.params.id;
  if (!UUID_RE.test(id)) return jsonError("עובד לא נמצא", 404);
  const body = await parseBody(req, EmployeeUpdateSchema);
  if (!body.ok) return body.response;
  const v = body.data;
  const me = guard.session.employee;

  try {
    const admin = createAdminClient();
    let hasRespColumn = true;
    const { data: current, error: curErr } = await withResponsibilityColumn((columns, hasColumn) => {
      hasRespColumn = hasColumn;
      return admin.from("employees").select(columns).eq("id", id).maybeSingle();
    });
    if (curErr) return serverError(curErr, "team PATCH load");
    if (!current) return jsonError("עובד לא נמצא", 404);
    const target = current as unknown as EmployeeRow;

    if (!canManageTeam(me)) {
      if (!isOpsManageable(target)) {
        return jsonError("מנהל משמרות יכול לערוך רק מוכרי דוכן ושליחים.", 403);
      }
      const opsError = checkOpsEmployeeInput(v);
      if (opsError) return jsonError(opsError, 403);
    }
    const payError = payFieldsError(v);
    if (payError) return jsonError(payError, 400);

    const { data: owners, error: ownersErr } = await admin
      .from("employees")
      .select("id")
      .eq("role", "owner")
      .eq("is_active", true);
    if (ownersErr) return serverError(ownersErr, "team PATCH owners");

    const rolesChanging = v.roles !== undefined || v.role !== undefined;
    const resolved = resolveRoles(v, target);
    const guardError = checkEmployeeChange({
      actorId: me.id,
      target: { id: target.id, role: target.role, is_active: target.is_active },
      change: { role: rolesChanging ? resolved.role : undefined, is_active: v.is_active },
      activeOwnerIds: (owners ?? []).map((o) => String(o.id)),
    });
    if (guardError) return jsonError(guardError, 409);

    const update: Record<string, unknown> = {};
    if (v.full_name !== undefined) update.full_name = v.full_name;
    if (v.phone !== undefined) {
      const phone = normalizePhone(v.phone);
      if (!phone) return jsonError("מספר הטלפון לא תקין. כתבו מספר ישראלי, למשל 0501234567.", 400);
      update.phone = phone;
    }
    const nextRole = rolesChanging ? resolved.role : target.role;
    if (rolesChanging) {
      update.role = resolved.role;
      update.roles = resolved.roles;
    }
    if (v.work_types !== undefined || rolesChanging) {
      const wt = (v.work_types ?? target.work_types ?? []) as Parameters<typeof workTypesForRole>[1];
      update.work_types = workTypesForRole(nextRole, wt);
    }
    // Pay is not touched here. A responsibility pay only counts while the
    // person holds ops_manager / marketing, and owners are never paid
    // (weeklyResponsibilityPay / computeEarnings), so role changes need no pay change.
    if (v.is_active !== undefined) update.is_active = v.is_active;
    if (v.pin !== undefined) {
      update.pin_hash = await hashPin(v.pin);
      // A fresh PIN also clears any lockout.
      update.failed_pin_attempts = 0;
      update.locked_until = null;
    }
    if (v.unlock) {
      update.failed_pin_attempts = 0;
      update.locked_until = null;
    }
    if (Object.keys(update).length === 0) {
      return NextResponse.json({ employee: viewEmployeeFor(me, target) });
    }

    const { data, error } = await admin
      .from("employees")
      .update(update)
      .eq("id", id)
      .select(hasRespColumn ? EMPLOYEE_COLUMNS : EMPLOYEE_COLUMNS_LEGACY)
      .single();
    if (error) {
      if (isDuplicatePhoneError(error)) return jsonError(DUPLICATE_PHONE_ERROR, 409);
      return serverError(error, "team PATCH");
    }

    // Two owners demoting each other at the same moment could both pass the
    // check above. Re-count and undo if no active owner is left.
    const removedOwner =
      target.role === "owner" && target.is_active && (nextRole !== "owner" || v.is_active === false);
    if (removedOwner) {
      const { count } = await admin
        .from("employees")
        .select("id", { count: "exact", head: true })
        .eq("role", "owner")
        .eq("is_active", true);
      if (!count) {
        await admin
          .from("employees")
          .update({ role: "owner", roles: target.roles ?? ["owner"], is_active: true })
          .eq("id", id);
        return jsonError("חייב להישאר לפחות מנהל ראשי פעיל אחד.", 409);
      }
    }

    return NextResponse.json({ employee: viewEmployeeFor(me, data as unknown as EmployeeRow) });
  } catch (e) {
    return serverError(e, "team PATCH");
  }
}

/**
 * Delete an employee. They disappear from every screen and can no longer log
 * in, and their phone number is freed. Past shifts, pay and sales stay in the
 * history. Owners may delete anyone but themselves and the last owner; shift
 * managers only stall sellers and couriers.
 */
export async function DELETE(_req: Request, ctx: { params: { id: string } }) {
  const guard = await requireStaff("team");
  if (!guard.ok) return guard.response;
  const nc = notConfigured();
  if (nc) return nc;
  const id = ctx.params.id;
  if (!UUID_RE.test(id)) return jsonError("עובד לא נמצא", 404);
  const me = guard.session.employee;
  if (id === me.id) return jsonError("אי אפשר למחוק את עצמך.", 409);

  try {
    const admin = createAdminClient();
    const { data: current, error: curErr } = await withResponsibilityColumn((columns) =>
      admin.from("employees").select(columns).eq("id", id).maybeSingle(),
    );
    if (curErr) return serverError(curErr, "team DELETE load");
    const target = current as unknown as EmployeeRow | null;
    if (!target || target.deleted_at) return jsonError("עובד לא נמצא", 404);

    if (!canManageTeam(me) && !isOpsManageable(target)) {
      return jsonError("מנהל משמרות יכול למחוק רק מוכרי דוכן ושליחים.", 403);
    }

    if (target.role === "owner" && target.is_active) {
      const { count } = await admin
        .from("employees")
        .select("id", { count: "exact", head: true })
        .eq("role", "owner")
        .eq("is_active", true)
        .is("deleted_at", null);
      if ((count ?? 0) <= 1) return jsonError("חייב להישאר לפחות מנהל ראשי פעיל אחד.", 409);
    }

    // Future shifts and this week's budget share go with them; history stays.
    const today = new Date().toISOString().slice(0, 10);
    await admin.from("shifts").delete().eq("employee_id", id).gte("work_date", today);
    await admin.from("week_assignments").delete().eq("employee_id", id).gte("week_start", today);
    // Their share of this week's (and later) pay budget goes back to the budget.
    await admin.from("weekly_pay_allocations").delete().eq("employee_id", id).gte("week_start", sundayOf(today));

    const { error } = await admin
      .from("employees")
      .update({ deleted_at: new Date().toISOString(), is_active: false, phone: null })
      .eq("id", id);
    if (error) return serverError(error, "team DELETE");
    return NextResponse.json({ ok: true });
  } catch (e) {
    return serverError(e, "team DELETE");
  }
}
