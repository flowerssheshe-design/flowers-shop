import { requireStaffPage } from "@/lib/staff/page-guard";
import { CustomersView } from "@/components/staff/owner/customers/CustomersView";

export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  await requireStaffPage("customers");
  return <CustomersView />;
}
