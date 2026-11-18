import { describe, expect, it } from "vitest";
import { checkDistribution, checkPercents, computeSplit, equalDistribution, planRows, stallsDoneForTheDay, lockedMoves, shortageCuts, checkFreeQty, deliveryStallFor, shortItem, splitByWeights, type SplitInput, type StallQty } from "./stall-split";

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

describe("saving a split", () => {
  it("quick split: each bouquet's free stock equally between the stalls", () => {
    expect(equalDistribution(["a", "b"], [{ id: "rose", live: 28 }])).toEqual({ rose: { a: 14, b: 14 } });
    expect(equalDistribution(["a", "b", "c"], [{ id: "rose", live: 10 }])).toEqual({ rose: { a: 4, b: 3, c: 3 } });
  });

  it("30 from the supplier, 2 ordered at a: 28 are split, a gets its 2 orders on top", () => {
    const rows = planRows({ rose: { a: 14, b: 14 } }, q({ a: { rose: 2 } }));
    expect(rows).toEqual([
      { stall_id: "a", product_id: "rose", qty: 16 },
      { stall_id: "b", product_id: "rose", qty: 14 },
    ]);
    // Read back: each stall can sell its share, the orders wait at a.
    const s = computeSplit(base({ mode: "count", live: new Map([["rose", 28]]), plan: q({ a: { rose: 16 }, b: { rose: 14 } }), pickups: q({ a: { rose: 2 } }) })).get("rose")!;
    expect(s.stallFree).toEqual({ a: 14, b: 14 });
    expect(s.pickups).toEqual({ a: 2, b: 0 });
  });

  it("never more than is free", () => {
    const products = [{ id: "rose", title: "ורד", live: 28 }];
    expect(checkDistribution({ rose: { a: 14, b: 14 } }, products, ["a", "b"])).toBeNull();
    expect(checkDistribution({ rose: { a: 15, b: 14 } }, products, ["a", "b"])).toContain("28");
    expect(checkDistribution({ rose: { x: 1 } }, products, ["a", "b"])).not.toBeNull();
    expect(checkDistribution({ rose: { a: 1.5 } }, products, ["a", "b"])).not.toBeNull();
  });
});

describe("Friday: stalls that opened and closed again", () => {
  // 2026-11-13 is a Friday; 12:00 UTC = 14:00 Israel.
  const friday = new Date("2026-11-13T12:00:00Z");
  const morning = "2026-11-13T05:00:00Z";
  const s = (id: string, is_open: boolean, opened_at: string | null, pickup = true, delivery = false) => ({
    id,
    is_open,
    opened_at,
    is_pickup_point: pickup,
    is_delivery_point: delivery,
  });

  it("before a stall opens, it still takes orders", () => {
    expect(stallsDoneForTheDay([s("a", false, null), s("b", false, "2026-11-06T05:00:00Z")], friday)).toEqual({ closed: new Set(), noOrders: false });
  });

  it("open now: takes orders", () => {
    expect(stallsDoneForTheDay([s("a", true, morning)], friday).noOrders).toBe(false);
  });

  it("opened and closed today: no more orders there; the other pickup stall still takes them", () => {
    const r = stallsDoneForTheDay([s("a", false, morning), s("b", true, morning)], friday);
    expect(r.closed).toEqual(new Set(["a"]));
    expect(r.noOrders).toBe(false);
  });

  it("every pickup / delivery stall opened and closed: nothing can be ordered", () => {
    const r = stallsDoneForTheDay([s("a", false, morning), s("b", false, morning, false, true), s("c", false, null, false, false)], friday);
    expect(r.noOrders).toBe(true);
  });

  it("any other day, closed changes nothing", () => {
    expect(stallsDoneForTheDay([s("a", false, "2026-11-12T05:00:00Z")], new Date("2026-11-12T12:00:00Z"))).toEqual({ closed: new Set(), noOrders: false });
  });
});

describe("after the lock: moving bouquets between stalls", () => {
  const products = [{ id: "rose", title: "ורד", undistributed: 2 }];

  it("applies only the changes, removals first", () => {
    const r = lockedMoves({ rose: { a: 10, b: 10 } }, { rose: { a: 7, b: 13 } }, products);
    expect(r).toEqual({ ok: true, moves: [
      { stall_id: "a", product_id: "rose", delta: -3 },
      { stall_id: "b", product_id: "rose", delta: 3 },
    ] });
  });

  it("can add from what no stall holds, but not more", () => {
    expect(lockedMoves({ rose: { a: 10 } }, { rose: { a: 12 } }, products).ok).toBe(true);
    const r = lockedMoves({ rose: { a: 10 } }, { rose: { a: 13 } }, products);
    expect(r.ok).toBe(false);
  });

  it("nothing changed: no moves", () => {
    expect(lockedMoves({ rose: { a: 10 } }, { rose: { a: 10 } }, products)).toEqual({ ok: true, moves: [] });
  });
});

describe("fewer arrived after the lock", () => {
  it("takes from what no stall holds first", () => {
    expect(shortageCuts({ a: 5, b: 5 }, 3, 2)).toEqual({ cuts: [], short: 0 });
  });

  it("then from the stall that has the most, keeping them even", () => {
    const r = shortageCuts({ a: 6, b: 3 }, 1, 5); // 4 to take: a 6→2, b stays 3
    expect(r.short).toBe(0);
    expect(Object.fromEntries(r.cuts.map((c) => [c.stall_id, c.delta]))).toEqual({ a: -4 });
  });

  it("says how many could not be taken (held by orders)", () => {
    expect(shortageCuts({ a: 1 }, 0, 4)).toEqual({ cuts: [{ stall_id: "a", delta: -1 }], short: 3 });
  });
});

describe("free bouquets", () => {
  it("must be part of what arrived", () => {
    expect(checkFreeQty(10, 3)).toBeNull();
    expect(checkFreeQty(10, 10)).toBeNull();
    expect(checkFreeQty(2, 3)).toMatch(/לא יכול/);
    expect(checkFreeQty(5, -1)).not.toBeNull();
  });
});
