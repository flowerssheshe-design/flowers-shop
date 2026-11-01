import { StaffPageHeader } from "@/components/staff/StaffShell";
import { TrackingLinks } from "@/components/staff/marketing/TrackingLinks";
import { requireStaffPage } from "@/lib/staff/page-guard";
import { SITE_URL } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function MarketingLinksPage() {
  await requireStaffPage("marketing_links");
  return (
    <>
      <StaffPageHeader
        title="קישורי מעקב"
        description="קישור וברקוד לכל מקור פרסום, כדי לדעת כמה נכנסו, נרשמו והזמינו דרכו."
      />
      <TrackingLinks siteUrl={SITE_URL} />
    </>
  );
}
