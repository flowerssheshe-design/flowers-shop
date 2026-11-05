import { describe, expect, it } from "vitest";
import { checkPercents, computeSplit, deliveryStallFor, shortItem, splitByWeights, type SplitInput, type StallQty } from "./stall-split";

const q = (o: Record<string, Record<string, number>>): StallQty =>
  new Map(Object.entries(o).map(([s, m]) => [s, new Map(Object.entries(m))]));

const base = (over: Partial<SplitInput>): SplitInput => ({
  mode: "percent",
  stalls: [
    { id: "a", is_pickup_point: true },
    { id: "b", is_pickup_point: true },
  ],
  productIds: ["rose"],
  live: new Map([["rose", 20]]),
  plan: new Map(),
  percents: {},
  pickups: new Map(),
  locked: false,
  lockedStock: new Map(),
  ...over,
});

describe("splitByWeights", () => {
  it("always adds up to the total", () => {
    expect(splitByWeights(15, [50, 50])).toEqual([8, 7]);
    expect(splitByWeights(10, [1, 1, 1])).toEqual([4, 3, 3]);
    expect(splitByWeights(0, [50, 50])).toEqual([0, 0]);
    expect(splitByWeights(5, [0, 0])).toEqual([0, 0]);
  });
});

describe("percent split", () => {
  it("splits what is left after the orders; the pickup stall also gets its orders", () => {
    // 20 bouquets, 5 ordered for pickup at a: general is now 15, split half-half.
    const s = computeSplit(
      base({ live: new Map([["rose", 15]]), percents: { a: 50, b: 50 }, pickups: q({ a: { rose: 5 } }) }),
    ).get("rose")!;
    expect(s.stallFree).toEqual({ a: 8, b: 7 });
    expect(s.pickups).toEqual({ a: 5, b: 0 });
    expect(s.deliveryFree).toBe(15);
    expect(s.orderable).toBe(15);
  });

  it("splits equally when no percents are set", () => {
    expect(computeSplit(base({})).get("rose")!.stallFree).toEqual({ a: 10, b: 10 });
  });

  it("keeps the rest undistributed when the percents add up to less than 100", () => {
    const s = computeSplit(base({ percents: { a: 40, b: 40 } })).get("rose")!;
    expect(s.stallFree).toEqual({ a: 8, b: 8 });
    expect(s.undistributed).toBe(4);
  });
});

describe("count split", () => {
  it("pickup orders come off the stall that was picked", () => {
    const s = computeSplit(
      base({
        mode: "count",
        live: new Map([["rose", 15]]),
        plan: q({ a: { rose: 10 }, b: { rose: 8 } }),
        pickups: q({ a: { rose: 3 } }),
      }),
    ).get("rose")!;
    expect(s.stallFree).toEqual({ a: 7, b: 8 });
    expect(s.undistributed).toBe(0);
    expect(s.deliveryFree).toBe(0);
    expect(s.orderable).toBe(8);
  });

  it("a stall that ran out can't be picked, the other still can", () => {
    const split = computeSplit(
      base({ mode: "count", live: new Map([["rose", 4]]), plan: q({ a: { rose: 3 }, b: { rose: 4 } }), pickups: q({ a: { rose: 3 } }) }),
    );
    expect(shortItem(split, [{ productId: "rose", qty: 1 }], "a")).not.toBeNull();
    expect(shortItem(split, [{ productId: "rose", qty: 1 }], "b")).toBeNull();
  });

  it("never gives the stalls more than the general stock", () => {
    const s = computeSplit(base({ mode: "count", live: new Map([["rose", 6]]), plan: q({ a: { rose: 6 }, b: { rose: 6 } }) })).get("rose")!;
    expect(s.stallFree.a + s.stallFree.b).toBe(6);
  });
});

describe("locked (Thursday evening on)", () => {
  it("uses each stall's fixed stock, whatever the mode", () => {
    const s = computeSplit(
      base({ locked: true, live: new Map([["rose", 12]]), lockedStock: q({ a: { rose: 0 }, b: { rose: 9 } }) }),
    ).get("rose")!;
    expect(s.stallFree).toEqual({ a: 0, b: 9 });
    expect(s.undistributed).toBe(3);
    expect(s.deliveryFree).toBe(3);
    expect(s.orderable).toBe(9);
  });

  it("a bouquet is sold out when no pickup point has it and nothing is left for delivery", () => {
    const s = computeSplit(
      base({
        locked: true,
        stalls: [
          { id: "a", is_pickup_point: true },
          { id: "b", is_pickup_point: false },
        ],
        live: new Map([["rose", 5]]),
        lockedStock: q({ a: { rose: 0 }, b: { rose: 5 } }),
      }),
    ).get("rose")!;
    expect(s.orderable).toBe(0);
  });
});

it("with no pickup points, pickup uses the general stock", () => {
  const s = computeSplit(
    base({ mode: "count", stalls: [{ id: "a", is_pickup_point: false }], plan: q({ a: { rose: 20 } }) }),
  ).get("rose")!;
  expect(s.orderable).toBe(20);
});

it("checks percents", () => {
  expect(checkPercents({ a: 50, b: 50 })).toBeNull();
  expect(checkPercents({ a: 60, b: 50 })).not.toBeNull();
  expect(checkPercents({ a: -1 })).not.toBeNull();
});

describe("delivery point stalls", () => {
  const stalls = [
    { id: "a", is_pickup_point: true, is_delivery_point: false },
    { id: "b", is_pickup_point: false, is_delivery_point: true },
  ];
  it("deliveries come from the delivery stall's share, even at 100%", () => {
    const split = computeSplit(base({ stalls, percents: { a: 50, b: 50 } }));
    const s = split.get("rose")!;
    expect(s.deliveryFree).toBe(10);
    expect(deliveryStallFor(stalls, split, [{ productId: "rose", qty: 3 }])).toBe("b");
    expect(deliveryStallFor(stalls, split, [{ productId: "rose", qty: 11 }])).toBeNull();
  });
  it("no delivery stall: general rules", () => {
    const plain = stalls.map((s) => ({ ...s, is_delivery_point: false }));
    expect(deliveryStallFor(plain, computeSplit(base({ stalls: plain })), [{ productId: "rose", qty: 1 }])).toBeUndefined();
  });
});

describe("Friday: closed stalls", () => {
  const stalls = [
    { id: "a", is_pickup_point: true, is_delivery_point: true },
    { id: "b", is_pickup_point: true, is_delivery_point: false },
  ];
  it("a closed stall can't be picked; the open one still can", () => {
    const split = computeSplit(base({ stalls, closedForOrders: new Set(["a"]) }));
    const s = split.get("rose")!;
    expect(s.orderable).toBe(10); // only b's share
    expect(s.deliveryFree).toBe(0); // the delivery stall is closed
    expect(deliveryStallFor(stalls, split, [{ productId: "rose", qty: 1 }], new Set(["a"]))).toBeNull();
  });
  it("every stall closed: nothing can be ordered", () => {
    const s = computeSplit(base({ stalls, closedForOrders: new Set(["a", "b"]), noOrders: true })).get("rose")!;
    expect(s.orderable).toBe(0);
    expect(s.deliveryFree).toBe(0);
  });
});
