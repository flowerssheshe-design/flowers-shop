// Pure team helpers: what each viewer may see about an employee, and the
// guardrails for changing employees. No server-only imports (tested in vitest).

import type { StaffIdentity, StaffRole, WorkType } from "@/lib/staff/access";
import { RESPONSIBILITIES, canManageTeam, primaryRole } from "@/lib/staff/access";
import type { PayType } from "@/lib/staff/payroll";
import type { TeamMember, TeamMemberOwnerView } from "./types";

export const STAFF_ROLES: StaffRole[] = ["owner", "ops_manager", "marketing", "worker"];
export const WORK_TYPES: WorkType[] = ["stall_seller", "courier", "supply_runner"];

/** The employees columns read by the team API (never pin_hash), before migration 038. */
export const EMPLOYEE_COLUMNS_LEGACY =
  "id, full_name, phone, role, roles, work_types, is_active, deleted_at, pay_type, pay_rate, failed_pin_attempts, locked_until, last_login_at";

/** The employees columns read by the team API (never pin_hash). */
export const EMPLOYEE_COLUMNS = `${EMPLOYEE_COLUMNS_LEGACY}, responsibility_pay`;

/** Postgres / PostgREST error for a column the live table doesn't have yet. */
export function isMissingColumnError(
  err: { code?: string; message?: string } | null | undefined,
  column: string,
): boolean {
  if (!err) return false;
  const msg = err.message ?? "";
  return (err.code === "42703" || err.code === "PGRST204" || /column|schema cache/i.test(msg)) && msg.includes(column);
}

/**
 * Runs a team query with responsibility_pay, and again without it when the
 * column doesn't exist yet (before migration 038). `run` gets the columns to
 * select and whether responsibility_pay may be written.
 */
export async function withResponsibilityColumn<R extends { error: { code?: string; message?: string } | null }>(
  run: (columns: string, hasColumn: boolean) => PromiseLike<R>,
): Promise<R> {
  const first = await run(EMPLOYEE_COLUMNS, true);
  if (!isMissingColumnError(first.error, "responsibility_pay")) return first;
  return run(EMPLOYEE_COLUMNS_LEGACY, false);
}

/** Columns everybody with access to the team page may see. */
export const PUBLIC_EMPLOYEE_COLUMNS = "id, full_name, phone, role, roles, work_types, is_active, deleted_at";

export type EmployeeRow = {
  id: string;
  full_name: string;
  phone: string;
  role: StaffRole;
  roles?: string[] | null;
  work_types: string[] | null;
  is_active: boolean;
  deleted_at?: string | null;
  pay_type?: PayType | null;
  pay_rate?: number | string | null;
  responsibility_pay?: number | string | null;
  failed_pin_attempts?: number | null;
  locked_until?: string | null;
  last_login_at?: string | null;
  pin_hash?: string;
};

function cleanWorkTypes(list: string[] | null | undefined): WorkType[] {
  return (list ?? []).filter((w): w is WorkType => (WORK_TYPES as string[]).includes(w));
}

function cleanRoles(list: string[] | null | undefined, role: StaffRole): Exclude<StaffRole, "worker">[] {
  const all = new Set([...(list ?? []), ...(role === "worker" ? [] : [role])]);
  return RESPONSIBILITIES.filter((r) => all.has(r));
}

/**
 * The responsibilities to save, from either the new list (roles) or the old
 * single role. Returns the list and the primary role stored in employees.role.
 */
export function resolveRoles(
  input: { role?: StaffRole; roles?: string[] },
  current?: { role: StaffRole; roles?: string[] | null },
): { roles: Exclude<StaffRole, "worker">[]; role: StaffRole } {
  const list =
    input.roles !== undefined
      ? input.roles
      : input.role !== undefined
        ? input.role === "worker" ? [] : [input.role]
        : current
          ? cleanRoles(current.roles, current.role)
          : [];
  const roles = RESPONSIBILITIES.filter((r) => list.includes(r));
  return { roles, role: primaryRole(roles) };
}

/** Public view: no pay, no PIN, no lockout data. Builds a new object (allow-list). */
export function toTeamMember(row: EmployeeRow): TeamMember {
  return {
    id: String(row.id),
    full_name: String(row.full_name ?? ""),
    phone: String(row.phone ?? ""),
    role: row.role,
    roles: cleanRoles(row.roles, row.role),
    work_types: cleanWorkTypes(row.work_types),
    is_active: row.is_active === true,
  };
}

export function toOwnerView(row: EmployeeRow): TeamMemberOwnerView {
  const rate = row.pay_rate === null || row.pay_rate === undefined ? null : Number(row.pay_rate);
  const resp =
    row.responsibility_pay === null || row.responsibility_pay === undefined ? null : Number(row.responsibility_pay);
  return {
    ...toTeamMember(row),
    pay_type: row.pay_type ?? null,
    pay_rate: rate !== null && Number.isFinite(rate) ? rate : null,
    responsibility_pay: resp !== null && Number.isFinite(resp) ? resp : null,
    failed_pin_attempts: Number(row.failed_pin_attempts ?? 0),
    locked_until: row.locked_until ?? null,
    last_login_at: row.last_login_at ?? null,
  };
}

/**
 * The only way the team API turns DB rows into a response.
 * Owners get pay and lockout data; everybody else gets the public view only.
 */
export function viewEmployeeFor(viewer: StaffIdentity, row: EmployeeRow): TeamMember | TeamMemberOwnerView {
  return canManageTeam(viewer) ? toOwnerView(row) : toTeamMember(row);
}

export function isLocked(member: { locked_until: string | null }, now: Date = new Date()): boolean {
  return !!member.locked_until && new Date(member.locked_until) > now;
}

export type EmployeeChange = {
  role?: StaffRole;
  is_active?: boolean;
};

/**
 * Guardrails for editing an employee. Returns a Hebrew error, or null when allowed.
 * - you can't deactivate or demote yourself
 * - there must always be at least one active owner
 *
 * `activeOwnerIds` = ids of the currently active owners (before the change).
 */
export function checkEmployeeChange(args: {
  actorId: string;
  target: { id: string; role: StaffRole; is_active: boolean };
  change: EmployeeChange;
  activeOwnerIds: string[];
}): string | null {
  const { actorId, target, change, activeOwnerIds } = args;
  const nextRole = change.role ?? target.role;
  const nextActive = change.is_active ?? target.is_active;

  if (target.id === actorId) {
    if (!nextActive) return "אי אפשר להפוך את עצמך ללא פעיל.";
    if (target.role === "owner" && nextRole !== "owner") return "אי אפשר להוריד את התפקיד של עצמך.";
  }

  const wasActiveOwner = target.role === "owner" && target.is_active;
  const staysActiveOwner = nextRole === "owner" && nextActive;
  if (wasActiveOwner && !staysActiveOwner) {
    const remaining = activeOwnerIds.filter((id) => id !== target.id);
    if (remaining.length === 0) return "חייב להישאר לפחות מנהל ראשי פעיל אחד.";
  }
  return null;
}

/** Work types are separate from responsibilities: anyone may also work at a stall, deliver or pick up. */
export function workTypesForRole(_role: StaffRole, workTypes: WorkType[]): WorkType[] {
  return Array.from(new Set(workTypes));
}

/** Where pay is set now. Creating / editing an employee sets only their details and what they do. */
export const PAY_PAGE_POINTER = "את השכר קובעים בדף שכר (/staff/payroll), לא בכרטיס העובד.";

/**
 * The team API never changes pay. Returns the Hebrew pointer to the pay page
 * when the request tries to set any pay field, or null.
 */
export function payFieldsError(input: { pay_type?: unknown; pay_rate?: unknown; responsibility_pay?: unknown }): string | null {
  const set = (v: unknown) => v !== undefined && v !== null && v !== "";
  return set(input.pay_type) || set(input.pay_rate) || set(input.responsibility_pay) ? PAY_PAGE_POINTER : null;
}

// ---- The shift manager hires stall sellers and couriers ----

/** Work types a shift manager may give (the ones paid from the weekly budget). */
export const OPS_WORK_TYPES: WorkType[] = ["stall_seller", "courier"];

/** A worker whose every work type is stall seller / courier: the shift manager may manage them. */
export function isOpsManageable(target: { role: StaffRole; work_types: string[] | null }): boolean {
  const wt = target.work_types ?? [];
  return target.role === "worker" && wt.length > 0 && wt.every((w) => (OPS_WORK_TYPES as string[]).includes(w));
}

/** Validates what a shift manager asks for. Returns a Hebrew error, or null. */
export function checkOpsEmployeeInput(input: {
  role?: StaffRole;
  roles?: string[];
  work_types?: string[];
  pay_type?: unknown;
  pay_rate?: unknown;
  responsibility_pay?: unknown;
}): string | null {
  if (input.role !== undefined && input.role !== "worker") return "מנהל משמרות יכול להוסיף רק עובדים.";
  if (input.roles !== undefined && input.roles.length > 0) return "רק המנהלים הראשיים קובעים אחריות.";
  if (input.work_types !== undefined) {
    if (input.work_types.length === 0) return "בחרו לפחות סוג עבודה אחד: מוכר בדוכן או שליח.";
    if (!input.work_types.every((w) => (OPS_WORK_TYPES as string[]).includes(w))) {
      return "מנהל משמרות יכול להוסיף רק מוכרי דוכן ושליחים.";
    }
  }
  if ((input.pay_type ?? null) !== null || (input.pay_rate ?? null) !== null) {
    return "השכר של מוכרים ושליחים נקבע מהתקציב השבועי, לא כאן.";
  }
  if ((input.responsibility_pay ?? null) !== null) return "רק המנהלים הראשיים קובעים שכר על אחריות.";
  return null;
}

/** Postgres unique violation on employees.phone. */
export function isDuplicatePhoneError(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  return err.code === "23505" || /duplicate key|unique/i.test(err.message ?? "");
}

export const DUPLICATE_PHONE_ERROR = "כבר יש עובד עם מספר הטלפון הזה.";
