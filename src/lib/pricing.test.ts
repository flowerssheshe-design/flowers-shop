import { describe, it, expect } from "vitest";
import { applyDiscount, effectiveDiscountPercent, priceCart } from "@/lib/pricing";
import { calculateMemberPrice } from "@/lib/utils";

const base = { threshold: 3, memberPercent: 10 };

describe("applyDiscount", () => {
  it("rounds like calculateMemberPrice", () => {
    for (const price of [99, 125, 149, 155, 1, 0, 333]) {
      for (const pct of [5, 10, 12.5, 15, 33]) {
        expect(applyDiscount(price, pct)).toBe(calculateMemberPrice(price, pct));
      }
    }
    expect(applyDiscount(155, 10)).toBe(140); // 139.5 -> 140
    expect(applyDiscount(149, 10)).toBe(134); // 134.1 -> 134
  });

  it("returns the original price for 0% and clamps out-of-range percents", () => {
    expect(applyDiscount(120, 0)).toBe(120);
    expect(applyDiscount(120, -5)).toBe(120);
    expect(applyDiscount(120, 150)).toBe(0);
  });
});

describe("effectiveDiscountPercent", () => {
  it("gives no discount below the threshold", () => {
    expect(effectiveDiscountPercent({ ...base, completedCount: 2 })).toBe(0);
  });

  it("gives the member percent when completed orders reach the threshold", () => {
    expect(effectiveDiscountPercent({ ...base, completedCount: 3 })).toBe(10);
    expect(effectiveDiscountPercent({ ...base, completedCount: 7 })).toBe(10);
  });

  it("gives the member percent to customers manually marked as returning", () => {
    expect(
      effectiveDiscountPercent({ ...base, completedCount: 0, customerStatus: "returning" }),
    ).toBe(10);
    expect(
      effectiveDiscountPercent({ ...base, completedCount: 0, customerStatus: "new" }),
    ).toBe(0);
  });

  it("uses a personal discount on its own and when it is higher", () => {
    expect(
      effectiveDiscountPercent({ ...base, completedCount: 0, personalPercent: 15 }),
    ).toBe(15);
    expect(
      effectiveDiscountPercent({ ...base, completedCount: 5, personalPercent: 20 }),
    ).toBe(20);
  });

  it("does not stack: member percent wins when the personal one is lower", () => {
    expect(
      effectiveDiscountPercent({ ...base, completedCount: 5, personalPercent: 5 }),
    ).toBe(10);
  });

  it("clamps to 0-100 and tolerates bad input", () => {
    expect(
      effectiveDiscountPercent({ ...base, completedCount: 0, personalPercent: 250 }),
    ).toBe(100);
    expect(
      effectiveDiscountPercent({ ...base, completedCount: 0, personalPercent: null }),
    ).toBe(0);
    expect(
      effectiveDiscountPercent({ ...base, completedCount: 0, personalPercent: NaN }),
    ).toBe(0);
  });
});

describe("priceCart", () => {
  const products = [
    { id: "a", title: "Rose", price_standard: 155 },
    { id: "b", title: "Tulip", price_standard: 100 },
  ];

  it("prices from products, applies discount per unit and adds delivery", () => {
    const res = priceCart(
      products,
      [
        { productId: "a", qty: 2 },
        { productId: "b", qty: 1 },
      ],
      10,
      15,
    );
    expect(res.items.map((i) => [i.title, i.price, i.qty])).toEqual([
      ["Rose", 140, 2],
      ["Tulip", 90, 1],
    ]);
    expect(res.subtotal).toBe(370);
    expect(res.deliveryFee).toBe(15);
    expect(res.total).toBe(385);
    expect(res.missing).toEqual([]);
  });

  it("reports unknown products", () => {
    const res = priceCart(products, [{ productId: "zzz", qty: 1 }], 0, 0);
    expect(res.missing).toEqual(["zzz"]);
    expect(res.items).toEqual([]);
  });
});
