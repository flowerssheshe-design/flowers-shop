// How the week's bouquets are split between the stalls, without locking the
// website stock. Pure rules, shared by the API, the checkout and the tests.
//
// The general stock (inventory.live_stock_count) is the whole stock that is
// still free. Website orders always come off it. On top of that:
//
// - "count":   each stall gets a fixed number of each bouquet (orders for pickup
//              there included). A pickup order at a stall comes off that stall.
//              Deliveries come from what was not given to any stall.
// - "percent": what is left after the orders is split by percent; each stall
//              also gets the bouquets of the orders picked up there.
//              Deliveries come off the general stock before the split.
//
// A stall can also be a delivery point: the courier takes the delivery
// bouquets from there, so a delivery order comes off that stall exactly like
// a pickup order (the order keeps the stall in pickup_stall_id).
//
// On Thursday evening the split is locked: every stall gets a fixed stock that
// no longer moves between stalls. From then on a pickup order, a stall sale or
// a write-off comes off that stall only (and off the general stock).
//
// A stall with nothing left of a bouquet can't be picked for it. A bouquet with
// nothing left anywhere (pickup points and delivery) is sold out.

export type SplitMode = "count" | "percent";

export const SPLIT_MODES: SplitMode[] = ["count", "percent"];

export function parseSplitMode(v: unknown): SplitMode {
  return v === "count" ? "count" : "percent";
}

/** The stalls are locked on Thursday at this Israel time (day 4 = Thursday). */
export const STALL_LOCK_DAY = 4;
export const STALL_LOCK_MINUTES = 20 * 60;

export type SplitStall = { id: string; is_pickup_point: boolean; is_delivery_point?: boolean };

/** qty per stall, per product: Map<stallId, Map<productId, qty>>. */
export type StallQty = Map<string, Map<string, number>>;

export type SplitInput = {
  mode: SplitMode;
  /** Active stalls only, in display order. */
  stalls: SplitStall[];
  productIds: string[];
  /** General stock per product (what is still free). */
  live: Map<string, number>;
  /** Count mode: how many of each bouquet each stall gets (pickups included). */
  plan: StallQty;
  /** Percent mode: share per stall. Empty (or all zero) = equal split between the stalls. */
  percents: Record<string, number>;
  /** This week's website orders taken from each stall (pickup there, or the courier takes them from there). */
  pickups: StallQty;
  /** After Thursday evening: each stall's fixed stock (stall_inventory.stock). */
  locked: boolean;
  lockedStock: StallQty;
  /** Stalls that can't take orders right now (on Friday: the closed ones). */
  closedForOrders?: Set<string>;
  /** Nothing can be ordered right now (on Friday when every stall is closed). */
  noOrders?: boolean;
};

export type ProductSplit = {
  /** General stock still free. */
  live: number;
  /** What each stall can still sell or take orders for, per stall id. */
  stallFree: Record<string, number>;
  /** Website pickup orders waiting at each stall. */
  pickups: Record<string, number>;
  /** General stock not given to any stall. */
  undistributed: number;
  /** How many can still be ordered for delivery. */
  deliveryFree: number;
  /** How many can still be ordered at all (best pickup point or delivery). */
  orderable: number;
};

const qtyOf = (m: StallQty, stallId: string, productId: string) => Math.max(0, Math.floor(Number(m.get(stallId)?.get(productId)) || 0));

/**
 * Splits `total` whole units by weights (largest remainder), so the parts
 * always add up to exactly `total`. Ties go to the earlier entry.
 */
export function splitByWeights(total: number, weights: number[]): number[] {
  const t = Math.max(0, Math.floor(total));
  const sum = weights.reduce((s, w) => s + Math.max(0, w), 0);
  if (t === 0 || sum <= 0) return weights.map(() => 0);
  const exact = weights.map((w) => (Math.max(0, w) / sum) * t);
  const out = exact.map(Math.floor);
  let left = t - out.reduce((s, n) => s + n, 0);
  const order = exact
    .map((e, i) => ({ i, r: e - Math.floor(e) }))
    .sort((a, b) => b.r - a.r || a.i - b.i);
  for (const { i } of order) {
    if (left <= 0) break;
    out[i]++;
    left--;
  }
  return out;
}

/** The percents that are really used: the given ones, or an equal split when none are set. */
export function effectivePercents(stalls: SplitStall[], percents: Record<string, number>): number[] {
  const given = stalls.map((s) => Math.max(0, Number(percents[s.id]) || 0));
  if (given.some((p) => p > 0)) return given;
  return stalls.map(() => (stalls.length ? 100 / stalls.length : 0));
}

export function computeSplit(input: SplitInput): Map<string, ProductSplit> {
  const out = new Map<string, ProductSplit>();
  const closed = input.closedForOrders ?? new Set<string>();
  const pickupIds = input.stalls.filter((s) => s.is_pickup_point).map((s) => s.id);
  const deliveryIds = input.stalls.filter((s) => s.is_delivery_point).map((s) => s.id);
  const openPickupIds = pickupIds.filter((id) => !closed.has(id));
  const openDeliveryIds = deliveryIds.filter((id) => !closed.has(id));
  const percents = effectivePercents(input.stalls, input.percents);
  const percentSum = Math.min(100, percents.reduce((s, p) => s + p, 0));

  for (const pid of input.productIds) {
    const live = Math.max(0, Math.floor(Number(input.live.get(pid)) || 0));
    const pickups: Record<string, number> = {};
    for (const s of input.stalls) pickups[s.id] = qtyOf(input.pickups, s.id, pid);

    let free: number[];
    if (input.locked) {
      free = input.stalls.map((s) => qtyOf(input.lockedStock, s.id, pid));
    } else if (input.mode === "count") {
      free = input.stalls.map((s) => Math.max(0, qtyOf(input.plan, s.id, pid) - pickups[s.id]));
      // Never more than the general stock really has (e.g. after a manual stock change).
      const sum = free.reduce((a, b) => a + b, 0);
      if (sum > live) free = splitByWeights(live, free);
    } else {
      const toSplit = Math.floor((live * percentSum) / 100 + 1e-9);
      free = splitByWeights(toSplit, percents);
    }

    const stallFree: Record<string, number> = {};
    input.stalls.forEach((s, i) => (stallFree[s.id] = free[i]));
    const given = free.reduce((a, b) => a + b, 0);
    const undistributed = Math.max(0, live - given);
    // Percent mode before the lock: a delivery just makes every share a bit smaller.
    // With delivery-point stalls: whatever the best of them still has. Without:
    // percent mode before the lock = every share gets a bit smaller; otherwise
    // what was not given to any stall.
    const deliveryFree = input.noOrders
      ? 0
      : deliveryIds.length > 0
        ? openDeliveryIds.reduce((m, id) => Math.max(m, stallFree[id] ?? 0), 0)
        : !input.locked && input.mode === "percent"
          ? live
          : undistributed;
    // No stall is a pickup point: pickup is at the general address, from the general stock.
    const bestPickup = input.noOrders
      ? 0
      : pickupIds.length === 0
        ? live
        : openPickupIds.reduce((m, id) => Math.max(m, stallFree[id] ?? 0), 0);
    const orderable = Math.min(live, Math.max(bestPickup, deliveryFree));

    out.set(pid, { live, stallFree, pickups, undistributed, deliveryFree, orderable });
  }
  return out;
}

export type CartLine = { productId: string; qty: number; title?: string };

/**
 * Can this cart be ordered for pickup at this stall, for delivery
 * ("delivery"), or for pickup at the general address when no stall is a
 * pickup point ("general")? Returns the first bouquet that is short, or null.
 */
export function shortItem(
  split: Map<string, ProductSplit>,
  items: CartLine[],
  where: string,
): CartLine | null {
  const need = new Map<string, number>();
  for (const it of items) need.set(it.productId, (need.get(it.productId) ?? 0) + it.qty);
  for (const it of items) {
    const p = split.get(it.productId);
    const have = !p ? 0 : where === "delivery" ? p.deliveryFree : where === "general" ? p.live : p.stallFree[where] ?? 0;
    if ((need.get(it.productId) ?? 0) > have) return it;
  }
  return null;
}

/**
 * The delivery-point stall a delivery order comes from: the first one (in
 * display order) that has the whole cart. null = none can take it. Returns
 * undefined when no stall is a delivery point (the order then uses the
 * general stock).
 */
export function deliveryStallFor(
  stalls: SplitStall[],
  split: Map<string, ProductSplit>,
  items: CartLine[],
  closedForOrders: Set<string> = new Set(),
): string | null | undefined {
  const ids = stalls.filter((s) => s.is_delivery_point).map((s) => s.id);
  if (ids.length === 0) return undefined;
  return ids.filter((id) => !closedForOrders.has(id)).find((id) => !shortItem(split, items, id)) ?? null;
}

/** Percents must be whole-ish numbers between 0 and 100 that add up to at most 100. */
export function checkPercents(percents: Record<string, number>): string | null {
  let sum = 0;
  for (const v of Object.values(percents)) {
    if (!Number.isFinite(v) || v < 0 || v > 100) return "כל אחוז צריך להיות בין 0 ל-100";
    sum += v;
  }
  if (sum > 100.0001) return `סך האחוזים הוא ${Math.round(sum * 10) / 10}%. אפשר עד 100%.`;
  return null;
}
