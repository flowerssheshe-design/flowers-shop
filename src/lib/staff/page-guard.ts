import "server-only";
import { redirect } from "next/navigation";
import { getStaffSession, type StaffSession } from "@/lib/staff/session";
import { canAccess, homeHref, type SectionKey } from "@/lib/staff/access";

/**
 * For server components under /staff. Sends logged-out visitors to the login
 * page and staff without permission to their own home page.
 *
 *   export default async function Page() {
 *     const session = await requireStaffPage("schedule");
 *     return <ScheduleView me={session.employee} />;
 *   }
 */
export async function requireStaffPage(section?: SectionKey): Promise<StaffSession> {
  const session = await getStaffSession();
  if (!session) redirect("/staff/login");
  if (section && !canAccess(session.employee, section)) {
    redirect(homeHref(session.employee));
  }
  return session;
}
