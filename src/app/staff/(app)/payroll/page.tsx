import { requireStaffPage } from "@/lib/staff/page-guard";
import { PayrollView } from "@/components/staff/owner/payroll/PayrollView";

export const dynamic = "force-dynamic";

export default async function PayrollPage() {
  await requireStaffPage("payroll");
  return <PayrollView />;
}
