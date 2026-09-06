import { Suspense } from "react";
import { Storefront } from "@/components/Storefront";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser, getUserOrderStats } from "@/lib/auth";
import { SUPABASE_CONFIGURED } from "@/lib/constants";
import type { Product } from "@/types";

export const dynamic = "force-dynamic";

async function loadProducts(): Promise<Product[]> {
  if (!SUPABASE_CONFIGURED) return [];
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });
    if (error) {
      console.error("Failed to load products:", error.message);
      return [];
    }
    return (data as Product[]) ?? [];
  } catch (e) {
    console.error(e);
    return [];
  }
}

export default async function HomePage() {
  const [products, user] = await Promise.all([
    loadProducts(),
    getSessionUser(),
  ]);

  let qualifies = false;
  let completedCount = 0;
  if (user) {
    const stats = await getUserOrderStats(user.id);
    qualifies = stats.qualifies;
    completedCount = stats.completedCount;
  }

  return (
    <Suspense fallback={null}>
      <Storefront
        products={products}
        user={user}
        qualifiesForMember={qualifies}
        completedOrderCount={completedCount}
      />
    </Suspense>
  );
}
