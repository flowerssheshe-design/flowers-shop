import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";
import type { StaffRole } from "@/lib/staff/access";
import { canWorkShift, findOverlaps, hhmm } from "./schedule";
import type { Shift, ShiftType } from "./types";

type Admin = ReturnType<typeof createAdminClient>;

export const SHIFT_COLUMNS = "id, work_date, start_time, end_time, shift_type, stall_id, employee_id, notes";

export function toShift(row: Record<string, unknown>): Shift {
  return {
    id: String(row.id),
    work_date: String(row.work_date),
    start_time: hhmm(row.start_time as string),
    end_time: hhmm(row.end_time as string),
    shift_type: row.shift_type as ShiftType,
    stall_id: row.stall_id ? String(row.stall_id) : null,
    employee_id: String(row.employee_id),
    notes: (row.notes as string | null) ?? null,
  };
}

/**
 * Checks the employee and stall of a shift. Returns a Hebrew error or null.
 */
export async function validateShiftRefs(
  admin: Admin,
  input: { shift_type: ShiftType; employee_id: string; stall_id: string | null },
): Promise<string | null> {
  const { data: emp, error } = await admin
    .from("employees")
    .select("id, role, work_types, is_active")
    .eq("id", input.employee_id)
    .maybeSingle();
  if (error) throw error;
  if (!emp) return "העובד לא נמצא";
  const member = {
    id: String(emp.id),
    role: emp.role as StaffRole,
    work_types: Array.isArray(emp.work_types) ? emp.work_types.map(String) : [],
    is_active: emp.is_active === true,
  };
  if (!member.is_active) return "העובד לא פעיל. בחרו עובד אחר.";
  if (!canWorkShift(member, input.shift_type)) return "לעובד הזה אין את סוג העבודה שמתאים למשמרת.";

  if (input.shift_type === "stall") {
    if (!input.stall_id) return "במשמרת דוכן צריך לבחור דוכן";
    const { data: stall, error: stallErr } = await admin
      .from("stalls")
      .select("id, is_active")
      .eq("id", input.stall_id)
      .maybeSingle();
    if (stallErr) throw stallErr;
    if (!stall) return "הדוכן לא נמצא";
    if (stall.is_active === false) return "הדוכן לא פעיל. בחרו דוכן אחר.";
  }
  return null;
}

/** Hebrew warnings for shifts of the same employee that overlap this one. */
export async function overlapWarnings(admin: Admin, shift: Shift): Promise<string[]> {
  const { data, error } = await admin
    .from("shifts")
    .select(SHIFT_COLUMNS)
    .eq("employee_id", shift.employee_id)
    .eq("work_date", shift.work_date);
  if (error) throw error;
  const others = (data ?? []).map((r) => toShift(r as Record<string, unknown>));
  return findOverlaps(shift, others).map(
    (o) => `חפיפה עם משמרת אחרת של העובד באותו יום (${o.start_time}–${o.end_time})`,
  );
}
