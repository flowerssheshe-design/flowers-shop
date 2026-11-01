import { StaffPageHeader } from "@/components/staff/StaffShell";
import { StallView } from "@/components/staff/work/StallView";
import { requireStaffPage } from "@/lib/staff/page-guard";
import { W } from "@/lib/staff/work/labels";

export const dynamic = "force-dynamic";

export default async function StallPage() {
  const { employee } = await requireStaffPage("stall");
  return (
    <>
      <StaffPageHeader refresh={false} title={W.stallTitle} description={W.stallDesc} />
      <StallView meId={employee.id} />
    </>
  );
}
