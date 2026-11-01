import { StaffPageHeader } from "@/components/staff/StaffShell";
import { MyAreaView } from "@/components/staff/work/MyAreaView";
import { requireStaffPage } from "@/lib/staff/page-guard";
import { W } from "@/lib/staff/work/labels";

export const dynamic = "force-dynamic";

export default async function MyAreaPage() {
  const { employee } = await requireStaffPage("me");
  return (
    <>
      <StaffPageHeader title={W.myArea} description={`שלום ${employee.full_name}. ${W.myAreaDesc}`} />
      <MyAreaView />
    </>
  );
}
