import { StaffShell } from "@/components/staff/StaffShell";
import { requireStaffPage } from "@/lib/staff/page-guard";

export const dynamic = "force-dynamic";

export default async function StaffAppLayout({ children }: { children: React.ReactNode }) {
  const { employee } = await requireStaffPage();
  return <StaffShell employee={employee}>{children}</StaffShell>;
}
