// Marketing analytics: aggregates only (no names or phones leave this module).

import { addDays, israelDate } from "@/lib/staff/week";
import { isCountedOrder, toIntlPhone } from "./segments";

export type VisitRow = { session_id: string; created_at: string; tracking_link_id: string | null };
export type SignupRow = { created_at: string; signup_link_id: string | null };
export type AnalyticsOrderRow = {
  id: string;
  user_id: string | null;
  customer_phone: string | null;
  created_at: string;
  status: string | null;
  items: unknown;
  tracking_link_id: string | null;
  order_type?: string | null;
};
export type LinkRow = { id: string; name: string; slug?: string };

export type WeekPoint = { weekStart: string; visits: number; newUsers: number; orders: number };
export type SourcePoint = { linkId: string | null; name: string; visits: number; signups: number; orders: number };

export type AnalyticsResult = {
  from: string;
  to: string;
  weeks: WeekPoint[];
  totals: { visits: number; newUsers: number; orders: number; conversionPct: number | null };
  sources: SourcePoint[];
  customers: { new: number; returning: number };
  topProducts: { title: string; qty: number }[];
};

export const DIRECT_LABEL = "ישיר";

/** Sunday ("YYYY-MM-DD") of the Israel calendar week that contains `iso`. */
export function weekStartOfDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return addDays(isoDate, -dow);
}

export function weekStartOfInstant(at: string | Date): string {
  return weekStartOfDate(israelDate(typeof at === "string" ? new Date(at) : at));
}

/** All week starts between two Israel dates (inclusive). */
export function weeksBetween(from: string, to: string): string[] {
  const out: string[] = [];
  let w = weekStartOfDate(from);
  const last = weekStartOfDate(to);
  while (w <= last && out.length < 60) {
    out.push(w);
    w = addDays(w, 7);
  }
  return out;
}

/** Orders placed online by customers (not stall sales or manual entries). */
export function isOnlineOrder(o: { order_type?: string | null }): boolean {
  return !o.order_type || o.order_type === "preorder" || o.order_type === "live";
}

export function customerKey(o: { id: string; user_id: string | null; customer_phone: string | null }): string {
  if (o.user_id) return `u:${o.user_id}`;
  const phone = toIntlPhone(o.customer_phone);
  return phone ? `p:${phone}` : `o:${o.id}`;
}

type Item = { title?: unknown; qty?: unknown };

export function computeAnalytics(input: {
  from: string;
  to: string;
  visits: VisitRow[];
  signups: SignupRow[];
  orders: AnalyticsOrderRow[];
  /** customerKey() of everyone who ordered before `from`. */
  priorCustomerKeys: Set<string>;
  links: LinkRow[];
}): AnalyticsResult {
  const weeks = weeksBetween(input.from, input.to);
  const weekMap = new Map<string, { sessions: Set<string>; newUsers: number; orders: number }>();
  for (const w of weeks) weekMap.set(w, { sessions: new Set(), newUsers: 0, orders: 0 });

  const linkName = new Map(input.links.map((l) => [l.id, l.name]));
  const sources = new Map<string | null, { sessions: Set<string>; signups: number; orders: number }>();
  const src = (id: string | null) => {
    const key = id && linkName.has(id) ? id : null;
    let s = sources.get(key);
    if (!s) {
      s = { sessions: new Set(), signups: 0, orders: 0 };
      sources.set(key, s);
    }
    return s;
  };

  const allSessions = new Set<string>();
  for (const v of input.visits) {
    allSessions.add(v.session_id);
    weekMap.get(weekStartOfInstant(v.created_at))?.sessions.add(v.session_id);
    src(v.tracking_link_id).sessions.add(v.session_id);
  }

  for (const s of input.signups) {
    const w = weekMap.get(weekStartOfInstant(s.created_at));
    if (w) w.newUsers += 1;
    src(s.signup_link_id).signups += 1;
  }

  const seen = new Set(input.priorCustomerKeys);
  let newCustomers = 0;
  let returning = 0;
  const products = new Map<string, number>();
  const online = input.orders
    .filter((o) => isCountedOrder(o.status) && isOnlineOrder(o))
    .sort((a, b) => a.created_at.localeCompare(b.created_at));

  for (const o of online) {
    const w = weekMap.get(weekStartOfInstant(o.created_at));
    if (w) w.orders += 1;
    src(o.tracking_link_id).orders += 1;

    const key = customerKey(o);
    if (seen.has(key)) returning += 1;
    else {
      newCustomers += 1;
      seen.add(key);
    }

    if (Array.isArray(o.items)) {
      for (const raw of o.items as Item[]) {
        const title = typeof raw?.title === "string" ? raw.title.trim() : "";
        const qty = Number(raw?.qty);
        if (!title || !Number.isFinite(qty) || qty <= 0) continue;
        products.set(title, (products.get(title) ?? 0) + qty);
      }
    }
  }

  const totalOrders = online.length;
  const visits = allSessions.size;

  return {
    from: input.from,
    to: input.to,
    weeks: weeks.map((w) => {
      const b = weekMap.get(w)!;
      return { weekStart: w, visits: b.sessions.size, newUsers: b.newUsers, orders: b.orders };
    }),
    totals: {
      visits,
      newUsers: input.signups.length,
      orders: totalOrders,
      conversionPct: visits > 0 ? Math.round((totalOrders / visits) * 1000) / 10 : null,
    },
    sources: Array.from(sources.entries())
      .map(([id, s]) => ({
        linkId: id,
        name: id ? linkName.get(id)! : DIRECT_LABEL,
        visits: s.sessions.size,
        signups: s.signups,
        orders: s.orders,
      }))
      .sort((a, b) => b.orders - a.orders || b.visits - a.visits),
    customers: { new: newCustomers, returning },
    topProducts: Array.from(products.entries())
      .map(([title, qty]) => ({ title, qty }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 10),
  };
}

export type PeriodKind = "week" | "4weeks" | "custom";
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Turns the period picker into an Israel-date range; null when invalid. */
export function resolvePeriod(
  kind: string | null | undefined,
  from: string | null | undefined,
  to: string | null | undefined,
  now: Date = new Date(),
): { from: string; to: string } | null {
  const today = israelDate(now);
  const thisWeek = weekStartOfDate(today);
  if (kind === "week" || !kind) return { from: thisWeek, to: today };
  if (kind === "4weeks") return { from: addDays(thisWeek, -21), to: today };
  if (kind !== "custom") return null;
  if (!from || !to || !DATE_RE.test(from) || !DATE_RE.test(to)) return null;
  if (Number.isNaN(Date.parse(from)) || Number.isNaN(Date.parse(to))) return null;
  if (from > to) return null;
  const days = (Date.parse(to) - Date.parse(from)) / 86_400_000;
  if (days > 366) return null;
  return { from, to };
}
