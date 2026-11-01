import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaff } from "@/lib/staff/guard";
import { canManageTeam } from "@/lib/staff/access";
import { normalizePhone } from "@/lib/staff/phone";
import { hashPin } from "@/lib/staff/pin";
import {
  DUPLICATE_PHONE_ERROR,
  PUBLIC_EMPLOYEE_COLUMNS,
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
import { EmployeeCreateSchema } from "@/lib/staff/ops/schemas";
import { jsonError, notConfigured, parseBody, serverError } from "@/lib/staff/ops/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Team list. Owners get everyone incl. pay; ops managers get active employees, no pay. */
export async function GET() {
  const guard = await requireStaff("team");
  if (!guard.ok) return guard.response;
  const nc = notConfigured();
  if (nc) return nc;
  const me = guard.session.employee;
  const isOwner = canManageTeam(me);

  try {
    const admin = createAdminClient();
    const list = (columns: string) =>
      admin
        .from("employees")
        .select(columns)
        .order("is_active", { ascending: false })
        .order("full_name", { ascending: true });
    // Owners also get pay (incl. responsibility_pay when the column exists).
    const { data, error } = isOwner
      ? await withResponsibilityColumn((columns) => list(columns))
      : await list(PUBLIC_EMPLOYEE_COLUMNS);
    if (error) return serverError(error, "team GET");
    // Shift managers also see the inactive stall sellers / couriers they can bring back.
    const rows = ((data ?? []) as unknown as EmployeeRow[]).filter(
      (r) => !r.deleted_at && (isOwner || r.is_active || isOpsManageable(r)),
    );
    return NextResponse.json({
      employees: rows.map((r) => viewEmployeeFor(me, r)),
      canManage: isOwner,
      meId: me.id,
    });
  } catch (e) {
    return serverError(e, "team GET");
  }
}

/**
 * Add an employee: details and what they do only. Pay is set on the pay page
 * (/staff/payroll). Owners: anyone. Shift managers: stall sellers and couriers only.
 */
export async function POST(req: Request) {
  const guard = await requireStaff("team");
  if (!guard.ok) return guard.response;
  const nc = notConfigured();
  if (nc) return nc;
  const body = await parseBody(req, EmployeeCreateSchema);
  if (!body.ok) return body.response;
  const v = body.data;
  if (!canManageTeam(guard.session.employee)) {
    const opsError = checkOpsEmployeeInput(v);
    if (opsError) return jsonError(opsError, 403);
  }
  const payError = payFieldsError(v);
  if (payError) return jsonError(payError, 400);

  const phone = normalizePhone(v.phone);
  if (!phone) return jsonError("מספר הטלפון לא תקין. כתבו מספר ישראלי, למשל 0501234567.", 400);

  try {
    const pin_hash = await hashPin(v.pin);
    const { roles, role } = resolveRoles(v);
    const admin = createAdminClient();
    const row: Record<string, unknown> = {
      full_name: v.full_name,
      phone,
      pin_hash,
      role,
      roles,
      work_types: workTypesForRole(role, v.work_types ?? []),
      is_active: v.is_active,
    };
    const { data, error } = await withResponsibilityColumn((columns) =>
      admin.from("employees").insert(row).select(columns).single(),
    );
    if (error) {
      if (isDuplicatePhoneError(error)) return jsonError(DUPLICATE_PHONE_ERROR, 409);
      return serverError(error, "team POST");
    }
    return NextResponse.json({ employee: viewEmployeeFor(guard.session.employee, data as unknown as EmployeeRow) });
  } catch (e) {
    return serverError(e, "team POST");
  }
}
