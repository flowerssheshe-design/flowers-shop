import { StaffPageHeader } from "@/components/staff/StaffShell";
import { DeliveriesView } from "@/components/staff/work/DeliveriesView";
import { requireStaffPage } from "@/lib/staff/page-guard";
import { W } from "@/lib/staff/work/labels";

export const dynamic = "force-dynamic";

export default async function DeliveriesPage() {
  await requireStaffPage("deliveries");
  return (
    <>
      <StaffPageHeader refresh={false} title={W.deliveriesTitle} description={W.deliveriesDesc} />
      <DeliveriesView />
    </>
  );
}
