import "server-only";
import { NextResponse } from "next/server";
import { getStaffSession, type StaffSession } from "@/lib/staff/session";
import { canAccess, type SectionKey, type StaffIdentity } from "@/lib/staff/access";

export type StaffGuard =
  | { ok: true; session: StaffSession }
  | { ok: false; response: NextResponse };

/**
 * For /api/staff/* routes. Checks the signed session AND the employee row
 * (must still be active), then the section permission.
 *
 *   const guard = await requireStaff("schedule");
 *   if (!guard.ok) return guard.response;
 *   const me = guard.session.employee;
 */
export async function requireStaff(
  section: SectionKey | SectionKey[],
  extra?: (who: StaffIdentity) => boolean,
): Promise<StaffGuard> {
  const session = await getStaffSession();
  if (!session) {
    return {
      ok: false,
      response: NextResponse.json({ error: "נדרשת התחברות עובד" }, { status: 401 }),
    };
  }
  const keys = Array.isArray(section) ? section : [section];
  const who = session.employee;
  const allowed = keys.some((k) => canAccess(who, k)) && (!extra || extra(who));
  if (!allowed) {
    return {
      ok: false,
      response: NextResponse.json({ error: "אין לך הרשאה לפעולה הזאת" }, { status: 403 }),
    };
  }
  return { ok: true, session };
}
