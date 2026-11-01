import { StaffPageHeader } from "@/components/staff/StaffShell";
import { MarketingAnalytics } from "@/components/staff/marketing/MarketingAnalytics";
import { requireStaffPage } from "@/lib/staff/page-guard";

export const dynamic = "force-dynamic";

export default async function MarketingPage() {
  await requireStaffPage("marketing");
  return (
    <>
      <StaffPageHeader
        title="נתוני שיווק"
        description="ביקורים, נרשמים חדשים, הזמנות ומאיפה הגיעו. מספרים מסוכמים בלבד."
      />
      <MarketingAnalytics />
    </>
  );
}
