import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";
import { getServerSettings } from "@/lib/settings-server";
import { addDays, currentBusinessWeek, israelTimeToDate, israelWeekday, type BusinessWeek } from "@/lib/staff/week";
import { weekOrdersRange } from "@/lib/staff/work/ranges";
import { ensureBusinessWeek } from "@/lib/staff/owner/data";
import { normalizeItems } from "./orders";
import {
  STALL_LOCK_DAY,
  STALL_LOCK_MINUTES,
  computeSplit,
  parseSplitMode,
  type ProductSplit,
  type SplitMode,
  type StallQty,
} from "./stall-split";

type Admin = ReturnType<typeof createAdminClient>;

export type SplitStallRow = {
  id: string;
  name: string;
  location: string | null;
  is_pickup_point: boolean;
  /** The courier takes delivery bouquets from here (false before migration 045). */
  is_delivery_point: boolean;
  is_open: boolean;
};

export type StallSplitState = {
  week: BusinessWeek;
  mode: SplitMode;
  percents: Record<string, number>;
  lockedAt: string | null;
  lockAt: Date;
  stalls: SplitStallRow[];
  products: { id: string; title: string }[];
  plan: StallQty;
  split: Map<string, ProductSplit>;
  /** Stalls that can't take website orders right now (on Friday: the closed ones). */
  closedForOrders: Set<string>;
  /** Friday and every stall is closed: the website can't take orders at all. */
  noOrders: boolean;
};

function addQty(m: StallQty, stallId: string, productId: string, qty: number) {
  const inner = m.get(stallId) ?? new Map<string, number>();
  inner.set(productId, (inner.get(productId) ?? 0) + qty);
  m.set(stallId, inner);
}

/** A manager re-opened the split by hand: no auto-lock until they lock again. (false before migration 044) */
async function manuallyUnlocked(admin: Admin, weekStart: string): Promise<boolean> {
  const { data, error } = await admin.from("business_weeks").select("stalls_unlocked_at").eq("week_start", weekStart).maybeSingle();
  if (error) return false;
  return Boolean((data as { stalls_unlocked_at?: string | null } | null)?.stalls_unlocked_at);
}

/** Thursday evening of the week: from then on each stall has a fixed stock. */
export function lockTimeOf(week: BusinessWeek): Date {
  return israelTimeToDate(addDays(week.weekStart, STALL_LOCK_DAY), STALL_LOCK_MINUTES);
}

/** The current week's split, as it stands now. Locks it first if Thursday evening has passed. */
export async function loadStallSplit(admin: Admin, opts: { autoLock?: boolean; now?: Date } = {}): Promise<StallSplitState> {
  const now = opts.now ?? new Date();
  const settings = await getServerSettings();
  const week = currentBusinessWeek(settings, now);
  const range = weekOrdersRange(week, settings);

  const [weekRes, stallsRes, productsRes, invRes, planRes, ordersRes] = await Promise.all([
    admin
      .from("business_weeks")
      .select("stall_split_mode, stall_split_percents, stalls_locked_at")
      .eq("week_start", week.weekStart)
      .maybeSingle(),
    admin
      .from("stalls")
      // "*" so a missing newer column (is_delivery_point, migration 045) doesn't break it.
      .select("*")
      .eq("is_active", true)
      .order("sort_order")
      .order("name"),
    admin.from("products").select("id, title, sort_order").eq("is_active", true).order("sort_order").order("title"),
    admin.from("inventory").select("product_id, live_stock_count"),
    admin.from("stall_plan").select("stall_id, product_id, qty").eq("week_start", week.weekStart),
    admin
      .from("orders")
      .select("items, pickup_stall_id")
      .not("pickup_stall_id", "is", null)
      .neq("order_type", "stall")
      .neq("status", "cancelled")
      .gte("created_at", range.from)
      .lt("created_at", range.to),
  ]);
  const err = weekRes.error ?? stallsRes.error ?? productsRes.error ?? invRes.error ?? planRes.error ?? ordersRes.error;
  if (err) throw new Error(`stall split: ${err.message}`);

  const w = weekRes.data as { stall_split_mode?: string; stall_split_percents?: Record<string, number>; stalls_locked_at?: string | null } | null;
  const lockAt = lockTimeOf(week);
  let lockedAt = w?.stalls_locked_at ?? null;

  if (!lockedAt && opts.autoLock !== false && now >= lockAt && !(await manuallyUnlocked(admin, week.weekStart))) {
    await lockStalls(admin, now);
    return loadStallSplit(admin, { ...opts, autoLock: false });
  }

  const stalls = (
    (stallsRes.data ?? []) as {
      id: string;
      name: string;
      location: string | null;
      is_open?: boolean | null;
      is_pickup_point?: boolean | null;
      is_delivery_point?: boolean | null;
    }[]
  ).map((s) => ({
    id: String(s.id),
    name: String(s.name),
    location: s.location ?? null,
    is_pickup_point: s.is_pickup_point === true,
    is_delivery_point: s.is_delivery_point === true,
    is_open: s.is_open === true,
  }));

  // The stalls sell on Friday only. On Friday a closed stall takes no website
  // orders, and when every stall is closed there is nowhere to bring them from.
  const friday = israelWeekday(now) === 5;
  const closedForOrders = new Set(friday ? stalls.filter((s) => !s.is_open).map((s) => s.id) : []);
  const noOrders = friday && stalls.length > 0 && stalls.every((s) => !s.is_open);
  const products = (productsRes.data ?? []).map((p) => ({ id: String(p.id), title: String(p.title) }));
  const live = new Map((invRes.data ?? []).map((r) => [String(r.product_id), Number(r.live_stock_count) || 0]));

  const plan: StallQty = new Map();
  for (const r of planRes.data ?? []) addQty(plan, String(r.stall_id), String(r.product_id), Number(r.qty) || 0);

  const pickups: StallQty = new Map();
  for (const o of ordersRes.data ?? []) {
    for (const it of normalizeItems(o.items)) addQty(pickups, String(o.pickup_stall_id), it.productId, it.qty);
  }

  const lockedStock: StallQty = new Map();
  if (lockedAt) {
    const { data, error } = await admin.from("stall_inventory").select("stall_id, product_id, stock");
    if (error) throw new Error(`stall split stock: ${error.message}`);
    for (const r of data ?? []) addQty(lockedStock, String(r.stall_id), String(r.product_id), Number(r.stock) || 0);
  }

  const mode = parseSplitMode(w?.stall_split_mode);
  const percents = (w?.stall_split_percents && typeof w.stall_split_percents === "object" ? w.stall_split_percents : {}) as Record<string, number>;
  const split = computeSplit({
    mode,
    stalls,
    productIds: products.map((p) => p.id),
    live,
    plan,
    percents,
    pickups,
    locked: Boolean(lockedAt),
    lockedStock,
    closedForOrders,
    noOrders,
  });
  return { week, mode, percents, lockedAt, lockAt, stalls, products, plan, split, closedForOrders, noOrders };
}

/**
 * Locks the week's split: every active stall gets a fixed stock (what it can
 * still sell, without the pickup orders already waiting there). Only the first
 * caller locks; later calls do nothing.
 */
export async function lockStalls(admin: Admin, now: Date = new Date()): Promise<boolean> {
  const state = await loadStallSplit(admin, { autoLock: false, now });
  if (state.lockedAt) return false;
  await ensureBusinessWeek(admin, state.week.weekStart, state.week.supplierOrderAt);
  const at = now.toISOString();
  const { data: claimed, error } = await admin
    .from("business_weeks")
    .update({ stalls_locked_at: at })
    .eq("week_start", state.week.weekStart)
    .is("stalls_locked_at", null)
    .select("week_start");
  if (error) throw new Error(`lock stalls: ${error.message}`);
  if (!claimed || claimed.length === 0) return false;
  // Locked again: the next week's auto-lock works as usual (ignored before migration 044).
  await admin.from("business_weeks").update({ stalls_unlocked_at: null }).eq("week_start", state.week.weekStart);

  // Start clean: nothing left over from older weeks.
  await admin.from("stall_inventory").update({ stock: 0, initial_stock: 0, updated_at: at }).gte("stock", 0);
  const rows: { stall_id: string; product_id: string; stock: number; initial_stock: number; updated_at: string }[] = [];
  for (const p of state.products) {
    const s = state.split.get(p.id);
    if (!s) continue;
    for (const st of state.stalls) {
      const n = s.stallFree[st.id] ?? 0;
      rows.push({ stall_id: st.id, product_id: p.id, stock: n, initial_stock: n + (s.pickups[st.id] ?? 0), updated_at: at });
    }
  }
  if (rows.length > 0) {
    const { error: upErr } = await admin.from("stall_inventory").upsert(rows, { onConflict: "stall_id,product_id" });
    if (upErr) {
      await admin.from("business_weeks").update({ stalls_locked_at: null }).eq("week_start", state.week.weekStart);
      throw new Error(`lock stalls stock: ${upErr.message}`);
    }
  }
  return true;
}

/** Opens the split again (managers only). The general stock already includes the stalls' stock. */
export async function unlockStalls(admin: Admin, now: Date = new Date()): Promise<void> {
  const settings = await getServerSettings();
  const week = currentBusinessWeek(settings, now);
  let { error } = await admin
    .from("business_weeks")
    .update({ stalls_locked_at: null, stalls_unlocked_at: now.toISOString() })
    .eq("week_start", week.weekStart);
  if (error && /stalls_unlocked_at/.test(error.message)) {
    // Before migration 044 a re-open only lasts until the next auto-lock check.
    ({ error } = await admin.from("business_weeks").update({ stalls_locked_at: null }).eq("week_start", week.weekStart));
  }
  if (error) throw new Error(`unlock stalls: ${error.message}`);
  await admin.from("stall_inventory").update({ stock: 0, initial_stock: 0, updated_at: now.toISOString() }).gte("stock", 0);
}

/** Is the current week's split locked? (false before migration 043) */
export async function stallsLocked(admin: Admin): Promise<boolean> {
  const settings = await getServerSettings();
  const week = currentBusinessWeek(settings);
  const { data, error } = await admin.from("business_weeks").select("stalls_locked_at").eq("week_start", week.weekStart).maybeSingle();
  if (error) return false;
  return Boolean((data as { stalls_locked_at?: string | null } | null)?.stalls_locked_at);
}

type Line = { productId: string; qty: number; title?: string };

async function stallStep(admin: Admin, stallId: string, productId: string, delta: number): Promise<boolean> {
  const { data, error } = await admin.rpc("stall_stock_adjust", { p_stall: stallId, p_product: productId, p_delta: delta });
  return !error && data !== null && data !== undefined;
}

/**
 * Takes an order's bouquets off the general stock, and off the pickup stall's
 * fixed stock when the split is locked. All or nothing.
 */
export async function takeOrderStock(
  admin: Admin,
  items: Line[],
  pickupStallId: string | null,
): Promise<{ ok: true; stallDeducted: boolean } | { ok: false; title: string }> {
  const fromStall = pickupStallId ? await stallsLocked(admin) : false;
  const done: { productId: string; qty: number; stall: boolean }[] = [];
  const undo = async () => {
    for (const d of done) {
      await admin.rpc("increment_inventory", { p_product_id: d.productId, p_qty: d.qty });
      if (d.stall && pickupStallId) await stallStep(admin, pickupStallId, d.productId, d.qty);
    }
  };
  for (const it of items) {
    if (fromStall && pickupStallId && !(await stallStep(admin, pickupStallId, it.productId, -it.qty))) {
      await undo();
      return { ok: false, title: it.title ?? "" };
    }
    const { data: after, error } = await admin.rpc("decrement_inventory", { p_product_id: it.productId, p_qty: it.qty });
    if (error || after === null || after === undefined) {
      if (fromStall && pickupStallId) await stallStep(admin, pickupStallId, it.productId, it.qty);
      await undo();
      return { ok: false, title: it.title ?? "" };
    }
    done.push({ productId: it.productId, qty: it.qty, stall: fromStall });
  }
  return { ok: true, stallDeducted: fromStall };
}

/** Gives an order's bouquets back (general stock, and the stall if it was taken from it while locked). */
export async function returnOrderStock(
  admin: Admin,
  items: Line[],
  opts: { pickupStallId?: string | null; stallDeducted?: boolean } = {},
): Promise<void> {
  const toStall = Boolean(opts.stallDeducted && opts.pickupStallId && (await stallsLocked(admin)));
  for (const it of items) {
    await admin.rpc("increment_inventory", { p_product_id: it.productId, p_qty: it.qty });
    if (toStall) await stallStep(admin, opts.pickupStallId!, it.productId, it.qty);
  }
}

/**
 * Cheap check for busy screens: locks the split once Thursday evening has
 * passed. Never throws (before migration 043 it just does nothing).
 */
export async function lockStallsIfDue(admin: Admin, now: Date = new Date()): Promise<void> {
  try {
    const settings = await getServerSettings();
    const week = currentBusinessWeek(settings, now);
    if (now < lockTimeOf(week)) return;
    const { data, error } = await admin
      .from("business_weeks")
      .select("stalls_locked_at")
      .eq("week_start", week.weekStart)
      .maybeSingle();
    if (error || (data as { stalls_locked_at?: string | null } | null)?.stalls_locked_at) return;
    if (await manuallyUnlocked(admin, week.weekStart)) return;
    await lockStalls(admin, now);
  } catch (e) {
    console.error("lockStallsIfDue:", e);
  }
}

/** What the stock page needs to show and edit the split between the stalls. */
export function splitPayload(state: StallSplitState) {
  return {
    week: state.week.weekStart,
    mode: state.mode,
    percents: state.percents,
    lockedAt: state.lockedAt,
    lockAt: state.lockAt.toISOString(),
    stalls: state.stalls,
    products: state.products.map((p) => {
      const s = state.split.get(p.id)!;
      const plan: Record<string, number> = {};
      for (const st of state.stalls) plan[st.id] = state.plan.get(st.id)?.get(p.id) ?? 0;
      return {
        id: p.id,
        title: p.title,
        live: s.live,
        plan,
        stallFree: s.stallFree,
        pickups: s.pickups,
        undistributed: s.undistributed,
        deliveryFree: s.deliveryFree,
        orderable: s.orderable,
      };
    }),
  };
}

