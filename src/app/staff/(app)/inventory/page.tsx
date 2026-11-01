import { requireStaffPage } from "@/lib/staff/page-guard";
import { InventoryView } from "@/components/staff/ops/InventoryView";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { employee } = await requireStaffPage("inventory");
  return <InventoryView me={employee} />;
}
