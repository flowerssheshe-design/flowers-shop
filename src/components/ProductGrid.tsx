"use client";

import { ProductCard } from "@/components/ProductCard";
import type { Product } from "@/types";

type Props = {
  products: Product[];
  qtyById: Record<string, number>;
  onQtyChange: (id: string, qty: number) => void;
  qualifiesForMember: boolean;
};

export function ProductGrid({
  products,
  qtyById,
  onQtyChange,
  qualifiesForMember,
}: Props) {
  if (products.length === 0) {
    return (
      <div className="rounded-2xl border border-primary/10 bg-card p-10 text-center text-muted-foreground shadow-sm">
        <p className="text-lg">לא נמצאו מוצרים פעילים כרגע.</p>
        <p className="mt-1 text-sm">חזרו מאוחר יותר או צרו קשר בוואטסאפ.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {products.map((p) => (
        <ProductCard
          key={p.id}
          product={p}
          qty={qtyById[p.id] ?? 0}
          onChange={(q) => onQtyChange(p.id, q)}
          qualifiesForMember={qualifiesForMember}
        />
      ))}
    </div>
  );
}