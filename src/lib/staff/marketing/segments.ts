// Who receives a WhatsApp broadcast / automation. Pure logic, no DB.

export type SegmentKind = "all" | "ordered_recently" | "never_ordered" | "regulars" | "lapsed";

export const SEGMENT_KINDS: SegmentKind[] = ["all", "ordered_recently", "never_ordered", "regulars", "lapsed"];

export type Segment = { kind: SegmentKind; weeks?: number };

export type ProfileRow = {
  id: string;
  full_name: string | null;
  phone: string | null;
  notification_opt_in: boolean | null;
  customer_status?: string | null;
};

export type OrderRow = {
  id?: string;
  user_id: string | null;
  customer_phone: string | null;
  created_at: string;
  status: string | null;
};

export type CustomerStat = {
  id: string;
  name: string | null;
  /** International digits, e.g. 972501234567; null when missing/invalid. */
  phone: string | null;
  optedIn: boolean;
  isManualRegular: boolean;
  orderCount: number;
  firstOrderAt: string | null;
  lastOrderAt: string | null;
};

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** "050-123 4567" → "972501234567"; null when it can't be a phone. */
export function toIntlPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 9 || digits.length > 15) return null;
  if (digits.startsWith("972")) return digits;
  if (digits.startsWith("0")) return "972" + digits.slice(1);
  return digits;
}

/** Orders count when they weren't cancelled. */
export function isCountedOrder(status: string | null | undefined): boolean {
  return status !== "cancelled";
}

/**
 * Joins profiles with their orders. An order belongs to a profile by user_id,
 * or (guest checkout) by the same phone number.
 */
export function buildCustomerStats(profiles: ProfileRow[], orders: OrderRow[]): CustomerStat[] {
  const byId = new Map<string, CustomerStat>();
  const byPhone = new Map<string, CustomerStat>();
  for (const p of profiles) {
    const phone = toIntlPhone(p.phone);
    const stat: CustomerStat = {
      id: p.id,
      name: p.full_name,
      phone,
      optedIn: p.notification_opt_in !== false,
      isManualRegular: p.customer_status === "returning",
      orderCount: 0,
      firstOrderAt: null,
      lastOrderAt: null,
    };
    byId.set(p.id, stat);
    if (phone && !byPhone.has(phone)) byPhone.set(phone, stat);
  }
  for (const o of orders) {
    if (!isCountedOrder(o.status)) continue;
    const stat =
      (o.user_id ? byId.get(o.user_id) : undefined) ??
      (() => {
        const phone = toIntlPhone(o.customer_phone);
        return phone ? byPhone.get(phone) : undefined;
      })();
    if (!stat) continue;
    stat.orderCount += 1;
    if (!stat.firstOrderAt || o.created_at < stat.firstOrderAt) stat.firstOrderAt = o.created_at;
    if (!stat.lastOrderAt || o.created_at > stat.lastOrderAt) stat.lastOrderAt = o.created_at;
  }
  return Array.from(byId.values());
}

/** Whether a customer belongs to the segment (ignores opt-in / phone). */
export function inSegment(c: CustomerStat, seg: Segment, now: Date, regularThreshold: number): boolean {
  const weeks = Math.max(1, Math.min(104, Math.round(seg.weeks ?? 4)));
  const cutoff = new Date(now.getTime() - weeks * WEEK_MS).toISOString();
  switch (seg.kind) {
    case "all":
      return true;
    case "ordered_recently":
      return !!c.lastOrderAt && c.lastOrderAt >= cutoff;
    case "never_ordered":
      return c.orderCount === 0;
    case "regulars":
      return c.isManualRegular || c.orderCount >= Math.max(1, regularThreshold);
    case "lapsed":
      return !!c.lastOrderAt && c.lastOrderAt < cutoff;
    default:
      return false;
  }
}

/** Customers who can get a WhatsApp message in the segment: opted in, valid phone, no duplicates. */
export function selectRecipients(
  customers: CustomerStat[],
  seg: Segment,
  now: Date,
  regularThreshold: number,
): CustomerStat[] {
  const seen = new Set<string>();
  const out: CustomerStat[] = [];
  for (const c of customers) {
    if (!c.optedIn || !c.phone) continue;
    if (!inSegment(c, seg, now, regularThreshold)) continue;
    if (seen.has(c.phone)) continue;
    seen.add(c.phone);
    out.push(c);
  }
  return out;
}
