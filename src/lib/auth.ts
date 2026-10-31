import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SUPABASE_CONFIGURED } from "@/lib/constants";
import { getServerSettings } from "@/lib/settings-server";
import { effectiveDiscountPercent } from "@/lib/pricing";
import type { SessionUser } from "@/types";

export type { SessionUser };

export async function getSessionUser(): Promise<SessionUser | null> {
  if (!SUPABASE_CONFIGURED) return null;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    // Use admin client to bypass RLS on profiles (user row exists but RLS
    // requires auth.uid() which works in browser context but is the safest
    // route via service role here to avoid RLS recursion).
    const admin = createAdminClient();
    const { data: profile } = await admin
      .from("profiles")
      .select("full_name, phone, address, notification_opt_in")
      .eq("id", user.id)
      .single();

    return {
      id: user.id,
      email: user.email ?? null,
      fullName: profile?.full_name ?? "",
      phone: profile?.phone ?? null,
      address: profile?.address ?? null,
      notification_opt_in: profile?.notification_opt_in ?? true,
    };
  } catch (e) {
    console.error("getSessionUser error:", e);
    return null;
  }
}

export type UserOrderStats = {
  completedCount: number;
  /** True when the customer gets any discount (member or personal). */
  qualifies: boolean;
  /** The discount percent the customer actually gets at checkout. */
  discountPercent: number;
  /** Member threshold from system settings. */
  threshold: number;
  /** Member discount percent from system settings. */
  memberPercent: number;
  /** Personal discount percent from profiles.discount_percent. */
  personalPercent: number;
  /** profiles.customer_status (e.g. 'returning' when marked by admin). */
  customerStatus: string | null;
};

async function loadDiscountProfile(
  userId: string,
): Promise<{ customerStatus: string | null; personalPercent: number }> {
  const admin = createAdminClient();
  const full = await admin
    .from("profiles")
    .select("customer_status, discount_percent")
    .eq("id", userId)
    .maybeSingle();
  if (!full.error) {
    const row = full.data as
      | { customer_status?: string | null; discount_percent?: number | string | null }
      | null;
    return {
      customerStatus: row?.customer_status ?? null,
      personalPercent: Number(row?.discount_percent ?? 0) || 0,
    };
  }
  // discount_percent may not exist yet (migration pending) — retry without it.
  const basic = await admin
    .from("profiles")
    .select("customer_status")
    .eq("id", userId)
    .maybeSingle();
  if (basic.error) {
    return { customerStatus: null, personalPercent: 0 };
  }
  const row = basic.data as { customer_status?: string | null } | null;
  return { customerStatus: row?.customer_status ?? null, personalPercent: 0 };
}

/**
 * Discount stats for a logged-in customer. This is the single source of truth
 * for the storefront AND the orders API, so the price a customer sees is the
 * price they are charged.
 */
export async function getUserOrderStats(userId: string): Promise<UserOrderStats> {
  const settings = await getServerSettings();
  const threshold = Number(settings.club_discount_threshold) || 0;
  const memberPercent = Number(settings.member_discount_percent) || 0;
  const empty: UserOrderStats = {
    completedCount: 0,
    qualifies: false,
    discountPercent: 0,
    threshold,
    memberPercent,
    personalPercent: 0,
    customerStatus: null,
  };
  if (!SUPABASE_CONFIGURED) return empty;

  let completedCount = 0;
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("user_completed_order_count", {
      uid: userId,
    });
    if (!error && data != null) completedCount = Number(data) || 0;
  } catch {
    completedCount = 0;
  }

  let customerStatus: string | null = null;
  let personalPercent = 0;
  try {
    ({ customerStatus, personalPercent } = await loadDiscountProfile(userId));
  } catch {
    // keep defaults
  }

  const discountPercent = effectiveDiscountPercent({
    completedCount,
    threshold,
    memberPercent,
    customerStatus,
    personalPercent,
  });

  return {
    completedCount,
    qualifies: discountPercent > 0,
    discountPercent,
    threshold,
    memberPercent,
    personalPercent,
    customerStatus,
  };
}
