import { requireStaffPage } from "@/lib/staff/page-guard";
import { SettingsView } from "@/components/staff/owner/settings/SettingsView";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await requireStaffPage("settings");
  return <SettingsView />;
}
