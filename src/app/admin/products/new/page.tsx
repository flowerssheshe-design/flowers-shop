"use client";

import { useEffect, useState } from "react";
import { ProductForm } from "@/components/ProductForm";
import { isAdminAuthenticated } from "@/components/AdminGate";
import type { Product } from "@/types";

export default function NewProductPage() {
  const [nextSortOrder, setNextSortOrder] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!isAdminAuthenticated()) {
      window.location.replace("/admin");
      return;
    }
    setReady(true);
    void fetch("/api/admin/products")
      .then((r) => r.json())
      .then((d: { products?: Product[] }) => {
        const list = d.products ?? [];
        const max = list.reduce(
          (m, p) => (p.sort_order > m ? p.sort_order : m),
          -1,
        );
        setNextSortOrder(max + 1);
      })
      .catch(() => undefined);
  }, []);

  if (!ready) return null;
  return <ProductForm mode="create" nextSortOrder={nextSortOrder} />;
}