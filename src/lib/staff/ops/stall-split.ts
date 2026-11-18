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
// The managers save the split in one go: how many of the free bouquets each
// stall gets, on top of the orders taken from it (stored in stall_plan with the
// orders included, so a later pickup order comes off its own stall). Until a
// split is saved, the free stock is split equally ("percent" with no percents).
//
// A manager locks the split by hand (nothing locks by itself): every stall
// gets a fixed stock that no longer moves between stalls. From then on a pickup order, a stall sale or
// a write-off comes off that stall only (and off the general stock).
//
// A stall with nothing left of a bouquet can't be picked for it. A bouquet with
// nothing left anywhere (pickup points and delivery) is sold out.

import { israelDate, israelWeekday } from "@/lib/staff/week";

export type SplitMode = "count" | "percent";

export const SPLIT_MODES: SplitMode[] = ["count", "percent"];

export function parseSplitMode(v: unknown): SplitMode {
  return v === "count" ? "count" : "percent";
}

/** From Thursday at this Israel time (day 4 = Thursday) the managers are reminded to lock. Nothing locks by itself. */
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

export type StallOpenState = {
  id: string;
  is_open: boolean;
  is_pickup_point: boolean;
  is_delivery_point?: boolean;
  /** When the stall was last opened (null before migration 049, or never). */
  opened_at?: string | null;
};

/**
 * Friday: a stall that opened today and is closed again is done for the day
 * and takes no more website orders. A stall that hasn't opened yet still
 * does. When every pickup / delivery stall is done, nothing can be ordered.
 * Any other day the stalls being closed changes nothing.
 */
export function stallsDoneForTheDay(stalls: StallOpenState[], now: Date = new Date()): { closed: Set<string>; noOrders: boolean } {
  if (israelWeekday(now) !== 5) return { closed: new Set(), noOrders: false };
  const today = israelDate(now);
  const done = (s: StallOpenState) => !s.is_open && Boolean(s.opened_at) && israelDate(new Date(s.opened_at!)) === today;
  const closed = new Set(stalls.filter(done).map((s) => s.id));
  const points = stalls.filter((s) => s.is_pickup_point || s.is_delivery_point);
  return { closed, noOrders: points.length > 0 && points.every((s) => closed.has(s.id)) };
}

/** How many free bouquets each stall gets, orders not included: productId → stallId → qty. */
export type Distribution = Record<string, Record<string, number>>;

/** The quick split: each bouquet's free stock split equally between the stalls. */
export function equalDistribution(stallIds: string[], products: { id: string; live: number }[]): Distribution {
  const out: Distribution = {};
  for (const p of products) {
    const parts = splitByWeights(p.live, stallIds.map(() => 1));
    out[p.id] = Object.fromEntries(stallIds.map((id, i) => [id, parts[i]]));
  }
  return out;
}

/**
 * A split to save: whole numbers, active stalls, and never more of a bouquet
 * than is free. Errors are Hebrew, ready to show.
 */
export function checkDistribution(
  dist: Distribution,
  products: { id: string; title: string; live: number }[],
  stallIds: string[],
): string | null {
  const stalls = new Set(stallIds);
  const byId = new Map(products.map((p) => [p.id, p]));
  for (const [pid, row] of Object.entries(dist)) {
    const p = byId.get(pid);
    if (!p) return "אחד הזרים לא נמצא. רעננו את הדף ונסו שוב.";
    let sum = 0;
    for (const [sid, qty] of Object.entries(row)) {
      if (!stalls.has(sid)) return "אחד הדוכנים כבר לא פעיל. רעננו את הדף ונסו שוב.";
      if (!Number.isInteger(qty) || qty < 0) return `הכמות של "${p.title}" צריכה להיות מספר שלם, 0 או יותר`;
      sum += qty;
    }
    if (sum > p.live) return `ב"${p.title}" חולקו ${sum}, אבל יש לחלוקה רק ${p.live}.`;
  }
  return null;
}

/** The stall_plan rows for a split: each stall's share plus the orders already taken from it. */
export function planRows(dist: Distribution, pickups: StallQty): { stall_id: string; product_id: string; qty: number }[] {
  const rows: { stall_id: string; product_id: string; qty: number }[] = [];
  for (const [pid, row] of Object.entries(dist)) {
    for (const [sid, qty] of Object.entries(row)) rows.push({ stall_id: sid, product_id: pid, qty: qty + qtyOf(pickups, sid, pid) });
  }
  return rows;
}

export type StallMove = { stall_id: string; product_id: string; delta: number };

/**
 * After the lock: the changes a manager made to the stalls' stock, as moves
 * relative to what they saw (so a sale made meanwhile is never lost). A stall
 * can only get more from what no stall holds. Removals come first.
 */
export function lockedMoves(
  seen: Distribution,
  want: Distribution,
  products: { id: string; title: string; undistributed: number }[],
): { ok: true; moves: StallMove[] } | { ok: false; error: string } {
  const byId = new Map(products.map((p) => [p.id, p]));
  const moves: StallMove[] = [];
  for (const [pid, row] of Object.entries(want)) {
    const p = byId.get(pid);
    if (!p) return { ok: false, error: "אחד הזרים לא נמצא. רעננו את הדף ונסו שוב." };
    let added = 0;
    for (const [sid, qty] of Object.entries(row)) {
      const delta = qty - (seen[pid]?.[sid] ?? 0);
      if (delta !== 0) moves.push({ stall_id: sid, product_id: pid, delta });
      added += delta;
    }
    if (added > p.undistributed) {
      return { ok: false, error: `ב"${p.title}" נוספו לדוכנים ${added}, אבל מחוץ לדוכנים יש רק ${p.undistributed}.` };
    }
  }
  moves.sort((a, b) => a.delta - b.delta);
  return { ok: true, moves };
}

/**
 * After the lock, fewer of a bouquet arrived than the stock counts on: what
 * comes off which stall. First from what no stall holds, then one at a time
 * from the stall that has the most, so the stalls stay even. If the stalls
 * don't hold enough, `short` is what still could not be taken.
 */
export function shortageCuts(
  stallFree: Record<string, number>,
  undistributed: number,
  shortBy: number,
): { cuts: { stall_id: string; delta: number }[]; short: number } {
  let left = Math.max(0, shortBy - Math.max(0, undistributed));
  const have = new Map(Object.entries(stallFree).map(([id, n]) => [id, Math.max(0, n)]));
  const taken = new Map<string, number>();
  while (left > 0) {
    let best: string | null = null;
    for (const [id, n] of Array.from(have.entries())) if (n > 0 && (best === null || n > have.get(best)!)) best = id;
    if (best === null) break;
    have.set(best, have.get(best)! - 1);
    taken.set(best, (taken.get(best) ?? 0) + 1);
    left -= 1;
  }
  return { cuts: Array.from(taken.entries()).map(([stall_id, n]) => ({ stall_id, delta: -n })), short: left };
}

/** Free bouquets must be part of what arrived. */
export function checkFreeQty(received: number, free: number): string | null {
  if (!Number.isInteger(free) || free < 0) return "כמה בחינם צריך להיות מספר שלם, 0 או יותר";
  if (free > received) return `בחינם (${free}) לא יכול להיות יותר ממה שהגיע (${received})`;
  return null;
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
