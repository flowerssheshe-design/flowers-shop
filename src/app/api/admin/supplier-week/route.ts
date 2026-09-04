import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SUPABASE_CONFIGURED } from "@/lib/constants";
import { requireAdmin } from "@/lib/admin-auth";
import type { SupplierAggregate } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const denied = requireAdmin();
  if (denied) return denied;
  if (!SUPABASE_CONFIGURED) {
    return NextResponse.json({ aggregates: [] });
  }
  try {
    const supabase = createAdminClient();
    // Sunday-start week boundary in server timezone.
    const { data, error } = await supabase.rpc("supplier_week_aggregate");
    if (error) {
      // Fallback: compute in JS via two queries (JSONB aggregation is gnarly in pure REST).
      return await fallbackAggregation(supabase);
    }
    return NextResponse.json({ aggregates: (data as SupplierAggregate[]) ?? [] });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ aggregates: [] });
  }
}

async function fallbackAggregation(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
) {
  const since = new Date();
  const day = since.getDay(); // 0=Sun
  since.setDate(since.getDate() - day);
  since.setHours(0, 0, 0, 0);

  const { data: orders, error } = await supabase
    .from("orders")
    .select("items")
    .gte("created_at", since.toISOString())
    .neq("status", "cancelled");
  if (error || !orders) return NextResponse.json({ aggregates: [] });

  const counts = new Map<string, { title: string; qty: number }>();
  for (const o of orders) {
    const items = Array.isArray(o.items) ? o.items : [];
    for (const it of items) {
      const key = String(it.productId ?? it.title);
      const prev = counts.get(key);
      const qty = Number(it.qty ?? 0);
      if (prev) prev.qty += qty;
      else counts.set(key, { title: String(it.title ?? key), qty });
    }
  }

  const aggregates: SupplierAggregate[] = [...counts.entries()]
    .map(([id, v]) => ({
      product_id: id,
      title: v.title,
      total_qty: v.qty,
    }))
    .sort((a, b) => b.total_qty - a.total_qty);

  return NextResponse.json({ aggregates });
}