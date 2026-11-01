import "server-only";
import type { StaffEmployee } from "@/lib/staff/session";
import { canSeeDeliveries, weekCourierId, type WeekAssignmentRow } from "@/lib/staff/work/courier";
import type { Admin } from "@/lib/staff/work/server";

/** Whether this person may use the deliveries screen this week, and who the courier is. */
export async function deliveriesAccess(
  admin: Admin,
  me: StaffEmployee,
  weekStart: string,
): Promise<{ allowed: boolean; courierId: string | null; courierName: string | null }> {
  const { data, error } = await admin
    .from("week_assignments")
    .select("week_start, assignment, employee_id, employees!week_assignments_employee_id_fkey(full_name)")
    .eq("week_start", weekStart)
    .eq("assignment", "courier");
  if (error) throw error;
  const rows = (data ?? []) as unknown as (WeekAssignmentRow & { employees: { full_name: string } | null })[];
  const courierId = weekCourierId(rows, weekStart);
  return {
    allowed: canSeeDeliveries(me, rows, weekStart),
    courierId,
    courierName: rows.find((r) => r.employee_id === courierId)?.employees?.full_name ?? null,
  };
}
