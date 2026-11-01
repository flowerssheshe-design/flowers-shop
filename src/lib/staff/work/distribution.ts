// Morning distribution of flowers from the general stock to a stall.
// A manager (owner / ops manager) decides it; the pickup worker only sees it.

import { hasRole, type StaffIdentity } from "@/lib/staff/access";

/** Only owners and ops managers decide how many bouquets go to each stall. */
export function canDecideDistribution(who: StaffIdentity): boolean {
  return hasRole(who, "owner") || hasRole(who, "ops_manager");
}

export const DISTRIBUTION_FORBIDDEN = "רק המנהלים קובעים כמה זרים יוצאים לכל דוכן. אפשר לראות את החלוקה בלשונית החלוקה.";

export type DistributionInput = { product_id: string; qty: number };

export type DistributionProduct = {
  id: string;
  title: string;
  /** Current general (global) live stock; null when the product has no stock row. */
  stock: number | null;
};

export type DistributionResult =
  | { ok: true; items: { product_id: string; title: string; qty: number }[] }
  | { ok: false; error: string };

export const MAX_DISTRIBUTION_QTY = 10000;

/**
 * Drops zero lines, merges duplicates, and checks every product exists and
 * that the general stock covers the quantity. Errors are Hebrew, ready to show.
 */
export function validateDistribution(
  input: DistributionInput[],
  products: Map<string, DistributionProduct>,
): DistributionResult {
  const merged = new Map<string, number>();
  for (const line of input) {
    const qty = Number(line.qty);
    if (!Number.isFinite(qty) || !Number.isInteger(qty) || qty < 0) {
      return { ok: false, error: "הכמות חייבת להיות מספר שלם, 0 או יותר" };
    }
    if (qty === 0) continue;
    merged.set(line.product_id, (merged.get(line.product_id) ?? 0) + qty);
  }
  if (merged.size === 0) {
    return { ok: false, error: "רשמו כמות לפחות לזר אחד" };
  }

  const items: { product_id: string; title: string; qty: number }[] = [];
  for (const [productId, qty] of Array.from(merged.entries())) {
    const product = products.get(productId);
    if (!product) return { ok: false, error: "אחד הזרים לא נמצא. רעננו את הדף ונסו שוב." };
    if (qty > MAX_DISTRIBUTION_QTY) {
      return { ok: false, error: `הכמות של "${product.title}" גדולה מדי` };
    }
    const available = product.stock ?? 0;
    if (qty > available) {
      return {
        ok: false,
        error: `במלאי הכללי יש רק ${available} של "${product.title}". עדכנו את הכמות או את המלאי.`,
      };
    }
    items.push({ product_id: productId, title: product.title, qty });
  }
  return { ok: true, items };
}

export type DistributionLogRow = {
  stall_id: string;
  product_id: string;
  qty: number;
};

/** Totals per stall and product, for "already distributed today". */
export function totalsByStall(rows: DistributionLogRow[]): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  for (const r of rows) {
    const stall = (out[r.stall_id] ??= {});
    stall[r.product_id] = (stall[r.product_id] ?? 0) + (Number(r.qty) || 0);
  }
  return out;
}
