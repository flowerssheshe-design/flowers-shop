import { requireStaffPage } from "@/lib/staff/page-guard";
import { ExpensesView } from "@/components/staff/owner/expenses/ExpensesView";

export const dynamic = "force-dynamic";

export default async function ExpensesPage() {
  await requireStaffPage("expenses");
  return <ExpensesView />;
}
