import { requireStaffPage } from "@/lib/staff/page-guard";
import { NewProduct } from "@/components/staff/owner/products/ProductEditor";

export const dynamic = "force-dynamic";

export default async function NewProductPage() {
  await requireStaffPage("products");
  return <NewProduct />;
}
