import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";
import type { OrderItem } from "./types";

// Global stock moves for orders. Same behaviour as the helpers inside
// src/app/api/admin/orders/[id]/route.ts (decrement_inventory /
// increment_inventory RPCs, roll back on a missing product).

type Admin = ReturnType<typeof createAdminClient>;

export async function restoreStockForItems(admin: Admin, items: Pick<OrderItem, "productId" | "qty">[]) {
  for (const item of items ?? []) {
    await admin.rpc("increment_inventory", { p_product_id: item.productId, p_qty: item.qty });
  }
}

/** Deducts every item or none. On failure returns the title of the product that ran out. */
export async function deductStockForItems(
  admin: Admin,
  items: Pick<OrderItem, "productId" | "qty" | "title">[],
): Promise<{ success: true } | { success: false; title: string }> {
  const done: { productId: string; qty: number }[] = [];
  for (const item of items ?? []) {
    const { data: after, error } = await admin.rpc("decrement_inventory", {
      p_product_id: item.productId,
      p_qty: item.qty,
    });
    if (error || after === null || after === undefined) {
      await restoreStockForItems(admin, done);
      return { success: false, title: item.title };
    }
    done.push({ productId: item.productId, qty: item.qty });
  }
  return { success: true };
}
