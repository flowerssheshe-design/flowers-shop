import { StaffPageHeader } from "@/components/staff/StaffShell";
import { SupplyView } from "@/components/staff/work/SupplyView";
import { requireStaffPage } from "@/lib/staff/page-guard";
import { W } from "@/lib/staff/work/labels";

export const dynamic = "force-dynamic";

export default async function SupplyPage() {
  await requireStaffPage("supply");
  return (
    <>
      <StaffPageHeader refresh={false} title={W.supplyTitle} description={W.supplyDesc} />
      <SupplyView />
    </>
  );
}
