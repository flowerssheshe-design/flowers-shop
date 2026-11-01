import { requireStaffPage } from "@/lib/staff/page-guard";
import { SupplierView } from "@/components/staff/owner/SupplierView";

export const dynamic = "force-dynamic";

export default async function SupplierPage() {
  await requireStaffPage("supplier");
  return <SupplierView />;
}
