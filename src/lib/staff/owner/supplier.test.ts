import { describe, it, expect } from "vitest";
import { buildSupplierWhatsApp, computeSupplierLines, finalQtyFor, liveStockFor, preorderQuantities } from "./supplier";
import type { OrderRow, ProductRow } from "./week-math";

const products: ProductRow[] = [
  { id: "a", title: "ורדים", default_order_qty: 10, sort_order: 1 },
  { id: "b", title: "צבעונים", default_order_qty: 0, sort_order: 2 },
  { id: "c", title: "ישן", default_order_qty: 5, is_active: false, sort_order: 3 },
];

function o(id: string, items: { productId: string; qty: number }[], extra: Partial<OrderRow> = {}): OrderRow {
  return { id, created_at: "2026-11-02T10:00:00Z", status: "approved", order_type: "preorder", total_amount: 0, items, ...extra };
}

describe("preorderQuantities", () => {
  it("counts only non-cancelled website pre-orders", () => {
    const m = preorderQuantities([
      o("1", [{ productId: "a", qty: 2 }, { productId: "b", qty: 1 }]),
      o("2", [{ productId: "a", qty: 3 }], { status: "pending_payment" }),
      o("3", [{ productId: "a", qty: 9 }], { status: "cancelled" }),
      o("4", [{ productId: "a", qty: 9 }], { order_type: "live" }),
      o("5", [{ productId: "a", qty: 9 }], { order_type: "stall" }),
    ]);
    expect(m.get("a")).toBe(5);
    expect(m.get("b")).toBe(1);
  });
});

describe("computeSupplierLines", () => {
  const pre = new Map([["a", 5]]);

  it("defaults: extra = default_order_qty, final = pre + extra", () => {
    const lines = computeSupplierLines(products, pre, []);
    expect(lines.map((l) => [l.product_id, l.preorder_qty, l.extra_qty, l.final_qty, l.live_qty])).toEqual([
      ["a", 5, 10, 15, 10],
      ["b", 0, 0, 0, 0],
    ]);
  });

  it("a saved 'extra' line follows new pre-orders: pre-orders + extra", () => {
    // saved when there were 3 pre-orders with extra 4; now there are 5
    const lines = computeSupplierLines(products, pre, [{ product_id: "a", preorder_qty: 3, extra_qty: 4, final_qty: 7 }]);
    const a = lines.find((l) => l.product_id === "a")!;
    expect(a).toMatchObject({ mode: "extra", preorder_qty: 5, extra_qty: 4, final_qty: 9, live_qty: 4, saved: true });
  });

  it("'total' orders a fixed total and leaves the rest for live sale (owners' example: 15, 10 pre-ordered)", () => {
    const lines = computeSupplierLines(products, new Map([["a", 10]]), [
      { product_id: "a", preorder_qty: 10, extra_qty: 15, final_qty: 15, order_mode: "total" },
    ]);
    expect(lines.find((l) => l.product_id === "a")).toMatchObject({ mode: "total", final_qty: 15, live_qty: 5 });
  });

  it("'total' never orders less than was pre-ordered", () => {
    expect(finalQtyFor("total", 15, 18)).toBe(18);
    expect(finalQtyFor("total", 15, 0)).toBe(15);
    expect(finalQtyFor("extra", 3, 10)).toBe(13);
  });

  it("uses the bouquet's default mode for a new week", () => {
    const lines = computeSupplierLines(
      [{ id: "t", title: "ת", default_order_qty: 15, order_mode: "total", is_active: true }],
      new Map([["t", 4]]),
      [],
    );
    expect(lines[0]).toMatchObject({ mode: "total", extra_qty: 15, final_qty: 15, live_qty: 11 });
  });

  it("never goes below zero", () => {
    const lines = computeSupplierLines(products, new Map(), [{ product_id: "a", preorder_qty: 5, extra_qty: 0, final_qty: 0 }]);
    expect(lines.find((l) => l.product_id === "a")!.final_qty).toBe(0);
  });

  it("shows the saved numbers as they are once the order was sent", () => {
    const lines = computeSupplierLines(products, new Map([["a", 50]]), [{ product_id: "a", preorder_qty: 5, extra_qty: 4, final_qty: 12 }], true);
    expect(lines.find((l) => l.product_id === "a")).toMatchObject({ preorder_qty: 5, final_qty: 12, live_qty: 7 });
  });

  it("includes an inactive product only when it was pre-ordered", () => {
    expect(computeSupplierLines(products, new Map(), []).some((l) => l.product_id === "c")).toBe(false);
    expect(computeSupplierLines(products, new Map([["c", 1]]), []).some((l) => l.product_id === "c")).toBe(true);
  });
});

describe("live stock and message", () => {
  it("live stock = final − pre-ordered, at least 0", () => {
    expect(liveStockFor(15, 5)).toBe(10);
    expect(liveStockFor(3, 5)).toBe(0);
  });

  it("lists only ordered products", () => {
    const text = buildSupplierWhatsApp(
      [
        { title: "ורדים", final_qty: 15 },
        { title: "צבעונים", final_qty: 0 },
      ],
      "2026-11-01",
      "2026-11-07",
    );
    expect(text).toContain("• ורדים – 15");
    expect(text).not.toContain("צבעונים");
    expect(text).toContain("סה״כ: 15 יחידות");
    expect(text).toContain("01.11.2026");
  });
});
