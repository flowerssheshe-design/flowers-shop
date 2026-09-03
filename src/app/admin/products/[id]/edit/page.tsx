"use client";

import { useEffect, useState } from "react";
import { ProductForm } from "@/components/ProductForm";
import { isAdminAuthenticated } from "@/components/AdminGate";
import type { Product } from "@/types";

export default function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [product, setProduct] = useState<Product | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!isAdminAuthenticated()) {
      window.location.replace("/admin");
      return;
    }
    void (async () => {
      const { id } = await params;
      const res = await fetch(`/api/admin/products/${id}`);
      if (!res.ok) {
        window.location.replace("/admin/products");
        return;
      }
      const data = (await res.json()) as { product: Product };
      setProduct(data.product);
      setReady(true);
    })();
  }, [params]);

  if (!ready || !product) return null;
  return <ProductForm mode="edit" initial={product} />;
}