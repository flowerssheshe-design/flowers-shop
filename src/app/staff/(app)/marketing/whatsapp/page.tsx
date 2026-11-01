import { StaffPageHeader } from "@/components/staff/StaffShell";
import { WhatsAppCenter } from "@/components/staff/marketing/WhatsAppCenter";
import { requireStaffPage } from "@/lib/staff/page-guard";
import { whatsappConfigured } from "@/lib/staff/marketing/whatsapp-send";

export const dynamic = "force-dynamic";

export default async function MarketingWhatsAppPage() {
  await requireStaffPage("marketing_whatsapp");
  return (
    <>
      <StaffPageHeader title="הודעות וואטסאפ" description="תבניות, שליחה ללקוחות והודעות אוטומטיות." />
      <WhatsAppCenter configured={whatsappConfigured()} />
    </>
  );
}
