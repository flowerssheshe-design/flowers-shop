import { redirect } from "next/navigation";
import { getSessionUser, getUserOrderStats } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { SUPABASE_CONFIGURED } from "@/lib/constants";
import { ProfileView } from "@/components/ProfileView";
import { CLUB_DISCOUNT_THRESHOLD, type Order } from "@/types";

export const dynamic = "force-dynamic";

async function loadUserOrders(userId: string): Promise<Order[]> {
  if (!SUPABASE_CONFIGURED) return [];
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("orders")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) return [];
    return (data as Order[]) ?? [];
  } catch {
    return [];
  }
}

export default async function ProfilePage() {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }

  const [orders, stats] = await Promise.all([
    loadUserOrders(user.id),
    getUserOrderStats(user.id),
  ]);

  return (
    <ProfileView
      user={user}
      orders={orders}
      completedCount={stats.completedCount}
      qualifies={stats.qualifies}
      threshold={CLUB_DISCOUNT_THRESHOLD}
    />
  );
}