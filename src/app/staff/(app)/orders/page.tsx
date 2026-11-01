import { requireStaffPage } from "@/lib/staff/page-guard";
import { OrdersView } from "@/components/staff/ops/OrdersView";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { employee } = await requireStaffPage("orders");
  return <OrdersView me={employee} />;
}
