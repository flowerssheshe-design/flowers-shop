import { notFound } from "next/navigation";
import { requireStaffPage } from "@/lib/staff/page-guard";
import { EditProduct } from "@/components/staff/owner/products/ProductEditor";

export const dynamic = "force-dynamic";

export default async function EditProductPage({ params }: { params: { id: string } }) {
  await requireStaffPage("products");
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) notFound();
  return <EditProduct id={params.id} />;
}
