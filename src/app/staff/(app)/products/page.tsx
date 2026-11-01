import { requireStaffPage } from "@/lib/staff/page-guard";
import { ProductsView } from "@/components/staff/owner/products/ProductsView";

export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  await requireStaffPage("products");
  return <ProductsView />;
}
