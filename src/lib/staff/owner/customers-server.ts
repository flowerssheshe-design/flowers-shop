import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { CustomerProfileRow } from "./customers";

type Admin = ReturnType<typeof createAdminClient>;

const PROFILE_COLUMNS =
  "id, full_name, phone, address, notification_opt_in, customer_status, discount_percent, admin_notes, signup_link_id, created_at";
const PROFILE_COLUMNS_BASIC = "id, full_name, phone, address, notification_opt_in, customer_status, created_at";

export async function loadAllAuthUsers(admin: Admin) {
  const users: { id: string; email: string | null; created_at: string | null }[] = [];
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`auth users: ${error.message}`);
    for (const u of data.users) users.push({ id: u.id, email: u.email ?? null, created_at: u.created_at ?? null });
    if (data.users.length < 1000) break;
  }
  return users;
}

/** Profiles, with a fallback when columns from migrations 030/031 are missing. */
export async function loadProfiles(admin: Admin, id?: string): Promise<CustomerProfileRow[]> {
  const run = (cols: string) => {
    const q = admin.from("profiles").select(cols);
    return id ? q.eq("id", id) : q;
  };
  let res = await run(PROFILE_COLUMNS);
  if (res.error) res = await run(PROFILE_COLUMNS_BASIC);
  if (res.error) throw new Error(`profiles: ${res.error.message}`);
  return (res.data ?? []) as unknown as CustomerProfileRow[];
}
