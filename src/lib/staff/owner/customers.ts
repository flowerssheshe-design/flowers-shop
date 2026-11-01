// Pure: the customers list for the owner ("לקוחות").

import { effectiveDiscountPercent } from "@/lib/pricing";

export type CustomerProfileRow = {
  id: string;
  full_name: string | null;
  phone: string | null;
  address: string | null;
  notification_opt_in: boolean | null;
  customer_status: string | null;
  discount_percent?: number | string | null;
  admin_notes?: string | null;
  signup_link_id?: string | null;
  created_at: string | null;
};

export type CustomerOrderRow = { user_id: string | null; status: string; created_at: string };

export type CustomerListItem = {
  id: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  customer_status: "regular" | "returning";
  discount_percent: number;
  effective_discount: number;
  orders_count: number;
  completed_count: number;
  last_order_at: string | null;
  source: string | null;
  created_at: string | null;
};

/** Same statuses as the SQL user_completed_order_count() (migration 013). */
export const COMPLETED_STATUSES = new Set(["approved", "completed", "archived"]);

export function buildCustomerList(args: {
  users: { id: string; email?: string | null; created_at?: string | null }[];
  profiles: CustomerProfileRow[];
  orders: CustomerOrderRow[];
  links: { id: string; name: string }[];
  threshold: number;
  memberPercent: number;
  query?: string;
}): CustomerListItem[] {
  const profiles = new Map(args.profiles.map((p) => [p.id, p]));
  const links = new Map(args.links.map((l) => [l.id, l.name]));
  const stats = new Map<string, { orders: number; completed: number; last: string | null }>();
  for (const o of args.orders) {
    if (!o.user_id) continue;
    const s = stats.get(o.user_id) ?? { orders: 0, completed: 0, last: null };
    if (o.status !== "cancelled") s.orders += 1;
    if (COMPLETED_STATUSES.has(o.status)) s.completed += 1;
    if (!s.last || o.created_at > s.last) s.last = o.created_at;
    stats.set(o.user_id, s);
  }

  const ids = new Set<string>([...args.users.map((u) => u.id), ...args.profiles.map((p) => p.id)]);
  const emails = new Map(args.users.map((u) => [u.id, u]));
  const q = (args.query ?? "").trim().toLowerCase();
  const qDigits = q.replace(/\D/g, "");

  const list: CustomerListItem[] = [];
  for (const id of Array.from(ids)) {
    const p = profiles.get(id);
    const u = emails.get(id);
    const s = stats.get(id) ?? { orders: 0, completed: 0, last: null };
    const status = p?.customer_status === "returning" ? "returning" : "regular";
    const personal = Number(p?.discount_percent ?? 0) || 0;
    const item: CustomerListItem = {
      id,
      email: u?.email ?? null,
      full_name: p?.full_name ?? null,
      phone: p?.phone ?? null,
      customer_status: status,
      discount_percent: personal,
      effective_discount: effectiveDiscountPercent({
        completedCount: s.completed,
        threshold: args.threshold,
        memberPercent: args.memberPercent,
        customerStatus: status,
        personalPercent: personal,
      }),
      orders_count: s.orders,
      completed_count: s.completed,
      last_order_at: s.last,
      source: p?.signup_link_id ? links.get(p.signup_link_id) ?? null : null,
      created_at: p?.created_at ?? u?.created_at ?? null,
    };
    if (q) {
      const hay = `${item.full_name ?? ""} ${item.email ?? ""} ${item.phone ?? ""}`.toLowerCase();
      const phoneDigits = (item.phone ?? "").replace(/\D/g, "");
      const hit = hay.includes(q) || (qDigits.length >= 3 && phoneDigits.includes(qDigits));
      if (!hit) continue;
    }
    list.push(item);
  }
  return list.sort(
    (a, b) => (b.last_order_at ?? "").localeCompare(a.last_order_at ?? "") || (b.created_at ?? "").localeCompare(a.created_at ?? ""),
  );
}
