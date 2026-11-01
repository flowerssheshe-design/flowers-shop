import { notFound } from "next/navigation";
import { requireStaffPage } from "@/lib/staff/page-guard";
import { CustomerDetail } from "@/components/staff/owner/customers/CustomerDetail";

export const dynamic = "force-dynamic";

export default async function CustomerPage({ params }: { params: { id: string } }) {
  await requireStaffPage("customers");
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) notFound();
  return <CustomerDetail id={params.id} />;
}
