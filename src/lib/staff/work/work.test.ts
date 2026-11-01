import { describe, expect, it, vi } from "vitest";
import {
  buildStallOrderItems,
  computeSaleTotal,
  lineTotal,
  qtyByProduct,
  summarizeSales,
} from "./sales";
import { totalsByStall, validateDistribution, type DistributionProduct } from "./distribution";
import { canSeeDeliveries, isWeekCourier, paymentStatus, weekCourierId } from "./courier";
import { allowedStalls, defaultStallId } from "./stall-access";
import { runWithRollback, StepError } from "./rollback";
import { preorderTotals } from "./forecast";
import { dayRange, monthSpan, weekOrdersRange } from "./ranges";
import { currentBusinessWeek } from "@/lib/staff/week";
import { googleMapsLink, navAddress, wazeLink, whatsappLink } from "./links";

describe("sale totals", () => {
  it("sums qty × unit price and rounds to agorot", () => {
    expect(computeSaleTotal([{ qty: 3, unit_price: 0.1 }])).toBe(0.3);
    expect(computeSaleTotal([{ qty: 2, unit_price: 45 }, { qty: 1, unit_price: 39.9 }])).toBe(129.9);
    expect(computeSaleTotal([])).toBe(0);
    expect(lineTotal({ qty: 4, unit_price: 12.5 })).toBe(50);
  });

  it("builds order items with the actual price and merges same product + price", () => {
    const products = new Map([
      ["p1", { id: "p1", title: "ורדים", image_url: null }],
      ["p2", { id: "p2", title: "חמניות", image_url: "x.jpg" }],
    ]);
    const items = buildStallOrderItems(
      [
        { product_id: "p1", qty: 1, unit_price: 50 },
        { product_id: "p1", qty: 2, unit_price: 50 },
        { product_id: "p1", qty: 1, unit_price: 40 },
        { product_id: "p2", qty: 1, unit_price: 35 },
      ],
      products,
    );
    expect(items).toEqual([
      { productId: "p1", title: "ורדים", qty: 3, price: 50, image_url: null },
      { productId: "p1", title: "ורדים", qty: 1, price: 40, image_url: null },
      { productId: "p2", title: "חמניות", qty: 1, price: 35, image_url: "x.jpg" },
    ]);
    expect(qtyByProduct(items!)).toEqual(new Map([["p1", 4], ["p2", 1]]));
  });

  it("returns null for an unknown product", () => {
    expect(buildStallOrderItems([{ product_id: "nope", qty: 1, unit_price: 1 }], new Map())).toBeNull();
  });

  it("qtyByProduct ignores bad lines", () => {
    expect(qtyByProduct([{ productId: "", qty: 2 }, { productId: "a", qty: 0 }, { productId: "b", qty: 2 }])).toEqual(
      new Map([["b", 2]]),
    );
  });
});

describe("Bit / cash split", () => {
  it("splits totals by payment method and skips cancelled sales", () => {
    const s = summarizeSales([
      { status: "completed", total_amount: 50, payment_method: "cash", items: [{ qty: 1 }] },
      { status: "completed", total_amount: "70.5", payment_method: "bit", items: [{ qty: 2 }] },
      { status: "completed", total_amount: 30, payment_method: "bit", items: [{ qty: 1 }] },
      { status: "cancelled", total_amount: 999, payment_method: "cash", items: [{ qty: 9 }] },
    ]);
    expect(s).toEqual({ count: 3, total: 150.5, bit: 100.5, cash: 50, other: 0, units: 4 });
  });

  it("puts unknown methods under other", () => {
    const s = summarizeSales([{ status: "completed", total_amount: 10, payment_method: null }]);
    expect(s.other).toBe(10);
    expect(s.total).toBe(10);
  });

  it("is all zero for no sales", () => {
    expect(summarizeSales([])).toEqual({ count: 0, total: 0, bit: 0, cash: 0, other: 0, units: 0 });
  });
});

describe("distribution validation", () => {
  const products = new Map<string, DistributionProduct>([
    ["a", { id: "a", title: "ורדים", stock: 10 }],
    ["b", { id: "b", title: "חמניות", stock: 3 }],
    ["c", { id: "c", title: "טוליפ", stock: null }],
  ]);

  it("drops zero lines and merges duplicates", () => {
    const r = validateDistribution(
      [
        { product_id: "a", qty: 4 },
        { product_id: "a", qty: 2 },
        { product_id: "b", qty: 0 },
      ],
      products,
    );
    expect(r).toEqual({ ok: true, items: [{ product_id: "a", title: "ורדים", qty: 6 }] });
  });

  it("rejects an empty distribution", () => {
    const r = validateDistribution([{ product_id: "a", qty: 0 }], products);
    expect(r.ok).toBe(false);
  });

  it("rejects negative or fractional quantities", () => {
    expect(validateDistribution([{ product_id: "a", qty: -1 }], products).ok).toBe(false);
    expect(validateDistribution([{ product_id: "a", qty: 1.5 }], products).ok).toBe(false);
  });

  it("rejects more than the general stock (merged)", () => {
    const r = validateDistribution(
      [
        { product_id: "b", qty: 2 },
        { product_id: "b", qty: 2 },
      ],
      products,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("חמניות");
  });

  it("treats a product without a stock row as zero stock", () => {
    expect(validateDistribution([{ product_id: "c", qty: 1 }], products).ok).toBe(false);
  });

  it("rejects unknown products", () => {
    expect(validateDistribution([{ product_id: "zzz", qty: 1 }], products).ok).toBe(false);
  });

  it("totals what was distributed per stall", () => {
    expect(
      totalsByStall([
        { stall_id: "s1", product_id: "a", qty: 2 },
        { stall_id: "s1", product_id: "a", qty: 3 },
        { stall_id: "s2", product_id: "b", qty: 1 },
      ]),
    ).toEqual({ s1: { a: 5 }, s2: { b: 1 } });
  });
});

describe("courier of the week", () => {
  const rows = [
    { week_start: "2026-11-01", assignment: "courier", employee_id: "e1" },
    { week_start: "2026-10-25", assignment: "courier", employee_id: "e2" },
  ];

  it("finds the courier of the given week only", () => {
    expect(weekCourierId(rows, "2026-11-01")).toBe("e1");
    expect(weekCourierId(rows, "2026-11-08")).toBeNull();
    expect(isWeekCourier({ id: "e1", role: "worker" }, rows, "2026-11-01")).toBe(true);
    expect(isWeekCourier({ id: "e2", role: "worker" }, rows, "2026-11-01")).toBe(false);
  });

  it("lets owners and ops managers in, and workers only when they are the courier", () => {
    expect(canSeeDeliveries({ id: "x", role: "owner" }, [], "2026-11-01")).toBe(true);
    expect(canSeeDeliveries({ id: "x", role: "ops_manager" }, [], "2026-11-01")).toBe(true);
    expect(canSeeDeliveries({ id: "e1", role: "worker" }, rows, "2026-11-01")).toBe(true);
    expect(canSeeDeliveries({ id: "e2", role: "worker" }, rows, "2026-11-01")).toBe(false);
    expect(canSeeDeliveries({ id: "e1", role: "marketing" }, [], "2026-11-01")).toBe(false);
  });

  it("tells the courier whether to collect cash", () => {
    expect(paymentStatus({ payment_method: "cash", total_amount: "80" })).toEqual({ kind: "collect", amount: 80 });
    expect(paymentStatus({ payment_method: "bit", total_amount: 80 })).toEqual({ kind: "paid", method: "bit" });
    expect(paymentStatus({ payment_method: null, total_amount: 80 })).toEqual({ kind: "unknown" });
  });
});

describe("stall access", () => {
  const stalls = [
    { id: "s1", name: "כיכר", is_active: true },
    { id: "s2", name: "מרכז", is_active: true },
    { id: "s3", name: "ישן", is_active: false },
  ];

  it("gives managers every active stall", () => {
    expect(allowedStalls({ role: "owner" }, stalls, []).map((s) => s.id)).toEqual(["s1", "s2"]);
    expect(allowedStalls({ role: "ops_manager" }, stalls, []).map((s) => s.id)).toEqual(["s1", "s2"]);
  });

  it("gives a worker only today's stall shifts", () => {
    const shifts = [
      { stall_id: "s2", shift_type: "stall", start_time: "12:00" },
      { stall_id: "s1", shift_type: "stall", start_time: "08:00" },
      { stall_id: null, shift_type: "courier", start_time: "07:00" },
      { stall_id: "s3", shift_type: "stall", start_time: "06:00" },
    ];
    const allowed = allowedStalls({ role: "worker" }, stalls, shifts);
    expect(allowed.map((s) => s.id)).toEqual(["s1", "s2"]);
    expect(defaultStallId(allowed, shifts)).toBe("s1");
    expect(allowedStalls({ role: "worker" }, stalls, [])).toEqual([]);
    expect(defaultStallId([], [])).toBeNull();
  });
});

describe("rollback", () => {
  it("undoes completed steps in reverse order when one fails", async () => {
    const log: string[] = [];
    const r = await runWithRollback([
      { run: async () => void log.push("run1"), undo: async () => void log.push("undo1") },
      { run: async () => void log.push("run2"), undo: async () => void log.push("undo2") },
      {
        run: async () => {
          throw new StepError("אזל", 409);
        },
        undo: async () => void log.push("undo3"),
      },
    ]);
    expect(log).toEqual(["run1", "run2", "undo2", "undo1"]);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBeInstanceOf(StepError);
      expect((r.error as StepError).status).toBe(409);
      expect(r.undoFailures).toBe(0);
    }
  });

  it("keeps undoing when an undo fails and counts it", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const undo1 = vi.fn(async () => {});
    const r = await runWithRollback([
      { run: async () => {}, undo: undo1 },
      {
        run: async () => {},
        undo: async () => {
          throw new Error("x");
        },
      },
      {
        run: async () => {
          throw new Error("boom");
        },
      },
    ]);
    expect(undo1).toHaveBeenCalled();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.undoFailures).toBe(1);
    spy.mockRestore();
  });

  it("succeeds without undoing anything", async () => {
    const undo = vi.fn();
    expect(await runWithRollback([{ run: async () => {}, undo }])).toEqual({ ok: true });
    expect(undo).not.toHaveBeenCalled();
  });
});

describe("pre-order forecast", () => {
  it("sums items of live (not cancelled) pre-orders", () => {
    const lines = preorderTotals(
      [
        { status: "approved", items: [{ productId: "a", title: "ורדים", qty: 2 }, { productId: "b", title: "חמניות", qty: 1 }] },
        { status: "pending_payment", items: [{ productId: "a", title: "ורדים", qty: 3 }] },
        { status: "cancelled", items: [{ productId: "a", title: "ורדים", qty: 10 }] },
      ],
      new Map([["a", "ורדים אדומים"]]),
    );
    expect(lines).toEqual([
      { product_id: "a", title: "ורדים אדומים", qty: 5 },
      { product_id: "b", title: "חמניות", qty: 1 },
    ]);
  });
});

describe("ranges", () => {
  const settings = { supplier_order_day: 2, supplier_order_time: "12:00", week_close_day: 6, week_close_time: "21:00" };

  it("covers an Israel day", () => {
    // Winter: UTC+2
    expect(dayRange("2026-12-01")).toEqual({ from: "2026-11-30T22:00:00.000Z", to: "2026-12-01T22:00:00.000Z" });
  });

  it("runs from the previous close to this week's close", () => {
    const week = currentBusinessWeek(settings, new Date("2026-12-02T10:00:00Z"));
    expect(week.weekStart).toBe("2026-11-29");
    expect(weekOrdersRange(week, settings)).toEqual({
      from: "2026-11-28T19:00:00.000Z",
      to: "2026-12-05T19:00:00.000Z",
    });
  });

  it("knows the month length", () => {
    expect(monthSpan("2026-02-14")).toEqual({ first: "2026-02-01", last: "2026-02-28" });
    expect(monthSpan("2028-02-03")).toEqual({ first: "2028-02-01", last: "2028-02-29" });
    expect(monthSpan("2026-12-31")).toEqual({ first: "2026-12-01", last: "2026-12-31" });
  });
});

describe("courier links", () => {
  it("adds the town for navigation", () => {
    expect(navAddress("הנרקיס 5")).toBe("הנרקיס 5, ירוחם");
    expect(navAddress("הנרקיס 5 ירוחם")).toBe("הנרקיס 5 ירוחם");
    expect(wazeLink("א 1")).toContain("waze.com/ul?q=");
    expect(googleMapsLink("א 1")).toContain("google.com/maps/search");
  });

  it("builds WhatsApp links only for valid numbers", () => {
    expect(whatsappLink("050-1234567")).toBe("https://wa.me/972501234567");
    expect(whatsappLink("12")).toBeNull();
  });
});
