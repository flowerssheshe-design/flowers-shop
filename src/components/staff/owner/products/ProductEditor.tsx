"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProductForm } from "@/components/ProductForm";
import { StaffPageHeader } from "@/components/staff/StaffShell";
import type { Product } from "@/types";
import { ErrorState, LoadingState, useStaffJson } from "../shared";

type StaffProduct = Product & { default_order_qty?: number | null };

const back = (
  <Button asChild variant="ghost" size="sm">
    <Link href="/staff/products">
      <ArrowRight className="h-4 w-4" />
      חזרה למוצרים
    </Link>
  </Button>
);

export function NewProduct() {
  // Load the list first so the new bouquet goes to the end of the store.
  const { data, error, loading } = useStaffJson<{ products: StaffProduct[] }>("/api/admin/products");
  const next = (data?.products ?? []).reduce((m, p) => Math.max(m, p.sort_order), -1) + 1;
  return (
    <div>
      <StaffPageHeader title="זר חדש" actions={back} />
      {loading && !data && !error ? (
        <LoadingState />
      ) : (
        <ProductForm mode="create" nextSortOrder={next} backHref="/staff/products" embedded withDefaultOrderQty />
      )}
    </div>
  );
}

export function EditProduct({ id }: { id: string }) {
  const { data, error, loading, reload } = useStaffJson<{ product: StaffProduct }>(`/api/admin/products/${id}`);
  return (
    <div>
      <StaffPageHeader title={data ? `עריכה: ${data.product.title}` : "עריכת זר"} actions={back} />
      {error && <ErrorState message={error} onRetry={() => void reload()} />}
      {loading && !data && <LoadingState />}
      {data && <ProductForm mode="edit" initial={data.product} backHref="/staff/products" embedded withDefaultOrderQty />}
    </div>
  );
}
