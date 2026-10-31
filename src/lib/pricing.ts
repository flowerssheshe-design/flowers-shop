// Pure pricing helpers shared by the storefront (client) and the orders API
// (server). Keep this file free of server-only imports.

export type CustomerStatus = string | null | undefined;

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

/** Discounted unit price, rounded to whole shekels (same as calculateMemberPrice). */
export function applyDiscount(price: number, percent: number): number {
  const p = clampPercent(percent);
  if (p === 0) return price;
  return Math.round((price * (100 - p)) / 100);
}

export type DiscountInput = {
  completedCount: number;
  threshold: number;
  memberPercent: number;
  customerStatus?: CustomerStatus;
  personalPercent?: number | null;
};

/**
 * The discount a customer actually gets:
 * - a "member" (manually marked returning, or completedCount >= threshold)
 *   gets memberPercent;
 * - a personal discount (profiles.discount_percent) applies on its own;
 * - when both apply, the higher one wins (they are not stacked).
 */
export function effectiveDiscountPercent({
  completedCount,
  threshold,
  memberPercent,
  customerStatus,
  personalPercent,
}: DiscountInput): number {
  const qualifiesAsMember =
    customerStatus === "returning" || completedCount >= threshold;
  const member = qualifiesAsMember ? clampPercent(Number(memberPercent) || 0) : 0;
  const personal = clampPercent(Number(personalPercent) || 0);
  return clampPercent(Math.max(member, personal));
}

export type PricingProduct = {
  id: string;
  title: string;
  price_standard: number;
  image_url?: string | null;
};

export type PricingItem = {
  productId: string;
  qty: number;
  image_url?: string | null;
};

export type PricedItem = {
  productId: string;
  title: string;
  qty: number;
  price: number;
  image_url?: string | null;
};

export type PricedCart = {
  items: PricedItem[];
  subtotal: number;
  deliveryFee: number;
  total: number;
  /** productIds that were not found in `products`. */
  missing: string[];
};

/** Prices a cart from product records (never from client-sent prices). */
export function priceCart(
  products: PricingProduct[],
  items: PricingItem[],
  discountPercent: number,
  deliveryFee: number,
): PricedCart {
  const byId = new Map(products.map((p) => [p.id, p]));
  const priced: PricedItem[] = [];
  const missing: string[] = [];
  for (const item of items) {
    const product = byId.get(item.productId);
    if (!product) {
      missing.push(item.productId);
      continue;
    }
    priced.push({
      productId: product.id,
      title: product.title,
      qty: item.qty,
      price: applyDiscount(Number(product.price_standard), discountPercent),
      image_url: product.image_url ?? null,
    });
  }
  const subtotal = priced.reduce((s, it) => s + it.price * it.qty, 0);
  const fee = Math.max(0, Number(deliveryFee) || 0);
  return {
    items: priced,
    subtotal,
    deliveryFee: fee,
    total: subtotal + fee,
    missing,
  };
}
