import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildCustomerStats, type CustomerStat, type OrderRow, type ProfileRow } from "./segments";

type Admin = ReturnType<typeof createAdminClient>;
type PageResult<T> = PromiseLike<{ data: T[] | null; error: { message: string; code?: string } | null }>;

const PAGE = 1000;

/** Reads every row of a query, 1000 at a time (Supabase caps a single response). */
export async function fetchAll<T>(
  page: (from: number, to: number) => PageResult<T>,
  max = 50_000,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < max; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

/** "Table/column doesn't exist yet" — the staff migrations haven't run. */
export function isMissingSchema(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null;
  if (!e) return false;
  return e.code === "42P01" || e.code === "42703" || e.code === "PGRST204" || e.code === "PGRST205" ||
    /does not exist|could not find/i.test(e.message ?? "");
}

/** Every registered customer with their order history (for segments and automations). */
export async function loadCustomerStats(admin: Admin): Promise<CustomerStat[]> {
  const profiles = await fetchAll<ProfileRow>((a, b) =>
    admin
      .from("profiles")
      .select("id, full_name, phone, notification_opt_in, customer_status")
      .order("created_at", { ascending: true })
      .range(a, b) as unknown as PageResult<ProfileRow>,
  );
  const orders = await fetchAll<OrderRow>((a, b) =>
    admin
      .from("orders")
      .select("id, user_id, customer_phone, created_at, status")
      .neq("status", "cancelled")
      .order("created_at", { ascending: true })
      .range(a, b) as unknown as PageResult<OrderRow>,
  );
  return buildCustomerStats(profiles, orders);
}

/** Regular-customer threshold from system settings (falls back to 3). */
export async function regularThreshold(admin: Admin): Promise<number> {
  const { data } = await admin.from("system_settings").select("value").eq("key", "club_discount_threshold").maybeSingle();
  const raw = (data as { value?: unknown } | null)?.value;
  const value = raw && typeof raw === "object" && "value" in (raw as object) ? (raw as { value: unknown }).value : raw;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 3;
}
