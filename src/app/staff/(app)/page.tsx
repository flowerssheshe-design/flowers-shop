import { redirect } from "next/navigation";
import { requireStaffPage } from "@/lib/staff/page-guard";
import { canAccess, homeHref } from "@/lib/staff/access";
import { DashboardView } from "@/components/staff/owner/dashboard/DashboardView";

export const dynamic = "force-dynamic";

export default async function StaffHomePage() {
  const { employee } = await requireStaffPage();
  if (!canAccess(employee, "dashboard")) redirect(homeHref(employee));
  return <DashboardView />;
}
