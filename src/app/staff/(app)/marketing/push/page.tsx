import { StaffPageHeader } from "@/components/staff/StaffShell";
import { PushCenter } from "@/components/staff/marketing/PushCenter";
import { requireStaffPage } from "@/lib/staff/page-guard";
import { pushConfigured } from "@/lib/staff/marketing/push";

export const dynamic = "force-dynamic";

export default async function MarketingPushPage() {
  await requireStaffPage("marketing_push");
  return (
    <>
      <StaffPageHeader title="התראות ובאנר" description="התראה לטלפון של מי שאישר, והודעת הבאנר באתר." />
      <PushCenter configured={pushConfigured()} />
    </>
  );
}
