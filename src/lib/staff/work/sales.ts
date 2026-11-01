// Pure helpers for stall sales: building the order items, totals and the
// daily cash / Bit split. No server imports, so the UI can use them too.

export type StallPaymentMethod = "cash" | "bit";

export type SaleLineInput = {
  product_id: string;
  qty: number;
  unit_price: number;
};

export type SaleProduct = {
  id: string;
  title: string;
  image_url?: string | null;
};

export type StallOrderItem = {
  productId: string;
  title: string;
  qty: number;
  price: number;
  image_url: string | null;
};

/** Rounds money to agorot so floating point never leaks into totals. */
export function roundMoney(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export function lineTotal(line: { qty: number; unit_price: number }): number {
  return roundMoney(line.qty * line.unit_price);
}

export function computeSaleTotal(lines: { qty: number; unit_price: number }[]): number {
  return roundMoney(lines.reduce((sum, l) => sum + l.qty * l.unit_price, 0));
}

/**
 * Merges lines of the same product priced the same, and builds the order
 * items with the actual price. Returns null when a product is unknown.
 */
export function buildStallOrderItems(
  lines: SaleLineInput[],
  products: Map<string, SaleProduct>,
): StallOrderItem[] | null {
  const merged = new Map<string, StallOrderItem>();
  for (const line of lines) {
    const product = products.get(line.product_id);
    if (!product) return null;
    const price = roundMoney(line.unit_price);
    const key = `${line.product_id}|${price}`;
    const existing = merged.get(key);
    if (existing) existing.qty += line.qty;
    else
      merged.set(key, {
        productId: product.id,
        title: product.title,
        qty: line.qty,
        price,
        image_url: product.image_url ?? null,
      });
  }
  return Array.from(merged.values());
}

/** Quantity per product, for the stock changes of a sale (or its undo). */
export function qtyByProduct(items: { productId: string; qty: number }[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const it of items) {
    const qty = Math.trunc(Number(it.qty) || 0);
    if (!it.productId || qty <= 0) continue;
    out.set(it.productId, (out.get(it.productId) ?? 0) + qty);
  }
  return out;
}

export type SalesSummary = {
  count: number;
  total: number;
  bit: number;
  cash: number;
  /** Anything that is neither cash nor Bit (should not happen for stall sales). */
  other: number;
  units: number;
};

export function summarizeSales(
  orders: {
    status?: string | null;
    total_amount: number | string | null;
    payment_method?: string | null;
    items?: { qty: number }[] | null;
  }[],
): SalesSummary {
  const out: SalesSummary = { count: 0, total: 0, bit: 0, cash: 0, other: 0, units: 0 };
  for (const o of orders) {
    if (o.status === "cancelled" || o.status === "archived") continue;
    const amount = Number(o.total_amount) || 0;
    out.count += 1;
    out.total += amount;
    if (o.payment_method === "bit") out.bit += amount;
    else if (o.payment_method === "cash") out.cash += amount;
    else out.other += amount;
    for (const it of o.items ?? []) out.units += Math.trunc(Number(it.qty) || 0);
  }
  out.total = roundMoney(out.total);
  out.bit = roundMoney(out.bit);
  out.cash = roundMoney(out.cash);
  out.other = roundMoney(out.other);
  return out;
}
