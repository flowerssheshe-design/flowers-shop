import { requireStaffPage } from "@/lib/staff/page-guard";
import { MoneyView } from "@/components/staff/owner/MoneyView";

export const dynamic = "force-dynamic";

export default async function MoneyPage() {
  await requireStaffPage("money");
  return <MoneyView />;
}
