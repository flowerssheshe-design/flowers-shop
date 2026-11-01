import { describe, expect, it } from "vitest";
import { actionsFor, canApplyAction, filterOrders, normalizeOrder, planStockChange, summarizeOrders } from "./orders";
import { resolveWeek } from "./week-range";

describe("order actions", () => {
  it("allows only sensible transitions", () => {
    expect(actionsFor("pending_payment")).toEqual(["approve", "complete", "cancel"]);
    expect(actionsFor("approved")).toEqual(["complete", "cancel"]);
    expect(actionsFor("completed")).toEqual(["cancel"]);
    expect(actionsFor("cancelled")).toEqual([]);
    expect(actionsFor("archived")).toEqual([]);
    expect(canApplyAction("approve", "approved")).toBe(false);
  });
});

describe("stock plan (mirrors admin PATCH)", () => {
  const p = (o: Partial<Parameters<typeof planStockChange>[0]>) =>
    planStockChange({ oldStatus: "pending_payment", newStatus: "approved", wasDeducted: false, isRealtime: true, itemCount: 2, ...o });

  it("deducts on approve/complete in realtime mode only", () => {
    expect(p({})).toEqual({ deduct: true, restore: false });
    expect(p({ newStatus: "completed" })).toEqual({ deduct: true, restore: false });
    expect(p({ isRealtime: false })).toEqual({ deduct: false, restore: false });
  });

  it("never deducts twice", () => {
    expect(p({ oldStatus: "approved", newStatus: "completed", wasDeducted: true })).toEqual({ deduct: false, restore: false });
  });

  it("restores on cancel only when stock was deducted", () => {
    expect(p({ oldStatus: "approved", newStatus: "cancelled", wasDeducted: true })).toEqual({ deduct: false, restore: true });
    expect(p({ oldStatus: "approved", newStatus: "cancelled", wasDeducted: false })).toEqual({ deduct: false, restore: false });
    expect(p({ oldStatus: "cancelled", newStatus: "cancelled", wasDeducted: true })).toEqual({ deduct: false, restore: false });
  });

  it("does nothing for empty orders", () => {
    expect(p({ itemCount: 0 })).toEqual({ deduct: false, restore: false });
  });
});

describe("normalise, summarise, filter", () => {
  const rows = [
    { id: "1", status: "pending_payment", order_type: "preorder", customer_name: "יוסי כהן", customer_phone: "050-111-2222", delivery_type: "delivery", items: [{ productId: "p", title: "זר", qty: 2, price: 50 }] },
    { id: "2", status: "approved", order_type: "live", customer_name: "רות", customer_phone: "0523334444", delivery_type: "delivery", fulfillment_type: "pickup", items: [] },
    { id: "3", status: "completed", order_type: "stall", customer_name: "לקוח דוכן", customer_phone: "", delivery_type: "pickup", approved_by: "e1", items: "bad" },
    { id: "4", status: "approved", order_type: "weird", customer_name: "אבי", customer_phone: "0541112222", delivery_type: "pickup", items: null },
  ];
  const names = new Map([["e1", "דנה"]]);
  const orders = rows.map((r) => normalizeOrder(r, names));

  it("normalises odd rows", () => {
    expect(orders[0].items).toHaveLength(1);
    expect(orders[2].items).toEqual([]);
    expect(orders[2].approved_by_name).toBe("דנה");
    expect(orders[3].order_type).toBe("preorder");
  });

  it("summarises per status, type and fulfillment (fulfillment_type wins)", () => {
    const s = summarizeOrders(orders);
    expect(s.total).toBe(4);
    expect(s.byStatus).toEqual({ pending_payment: 1, approved: 2, completed: 1 });
    expect(s.byType).toEqual({ preorder: 2, live: 1, stall: 1 });
    expect(s.delivery).toBe(1);
    expect(s.pickup).toBe(3);
  });

  it("filters by status, type, fulfillment and search", () => {
    const all = { status: "all", type: "all", fulfillment: "all", query: "" };
    expect(filterOrders(orders, { ...all, status: "approved" }).map((o) => o.id)).toEqual(["2", "4"]);
    expect(filterOrders(orders, { ...all, type: "stall" }).map((o) => o.id)).toEqual(["3"]);
    expect(filterOrders(orders, { ...all, fulfillment: "delivery" }).map((o) => o.id)).toEqual(["1"]);
    expect(filterOrders(orders, { ...all, query: "רות" }).map((o) => o.id)).toEqual(["2"]);
    expect(filterOrders(orders, { ...all, query: "0501112222" }).map((o) => o.id)).toEqual(["1"]);
    expect(filterOrders(orders, { ...all, query: "1112222" }).map((o) => o.id)).toEqual(["1", "4"]);
  });
});

describe("week param", () => {
  const settings = { supplier_order_day: 2, supplier_order_time: "12:00", week_close_day: 6, week_close_time: "21:00" };
  const now = new Date("2026-11-03T08:00:00Z"); // Tuesday

  it("defaults to the current week", () => {
    const w = resolveWeek(null, settings, now);
    expect(w.weekStart).toBe("2026-11-01");
    expect(w.weekEnd).toBe("2026-11-07");
    expect(w.isCurrentWeek).toBe(true);
  });

  it("any date in a week resolves to its Sunday; bad input falls back", () => {
    expect(resolveWeek("2026-10-29", settings, now).weekStart).toBe("2026-10-25");
    expect(resolveWeek("2026-10-29", settings, now).isCurrentWeek).toBe(false);
    expect(resolveWeek("2026-02-31", settings, now).weekStart).toBe("2026-11-01");
    expect(resolveWeek("junk", settings, now).weekStart).toBe("2026-11-01");
  });

  it("order window runs from last week's close to this week's close", () => {
    const w = resolveWeek("2026-11-01", settings, now);
    // Saturday 2026-10-31 21:00 Israel (UTC+2) → 19:00Z
    expect(w.from.toISOString()).toBe("2026-10-31T19:00:00.000Z");
    expect(w.to.toISOString()).toBe("2026-11-07T19:00:00.000Z");
  });
});
