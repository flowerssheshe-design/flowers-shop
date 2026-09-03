import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SUPABASE_CONFIGURED, CLUB_DISCOUNT_THRESHOLD } from "@/lib/constants";
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

export async function getUserOrderStats(userId: string): Promise<{
  completedCount: number;
  qualifies: boolean;
}> {
  if (!SUPABASE_CONFIGURED) return { completedCount: 0, qualifies: false };
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("user_completed_order_count", {
      uid: userId,
    });
    if (error || data == null) {
      return { completedCount: 0, qualifies: false };
    }
    const completedCount = Number(data);
    return {
      completedCount,
       qualifies: completedCount >= CLUB_DISCOUNT_THRESHOLD,
    };
  } catch {
    return { completedCount: 0, qualifies: false };
  }
}