import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SUPABASE_CONFIGURED } from "@/lib/constants";
import { requireAdmin } from "@/lib/admin-auth";
import type { Inventory } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type SummaryRow = {
  product_id: string;
  title: string;
  price_standard: number;
  cost_price: number;
  live_stock_count: number;
  initial_stock_count: number;
  approved_orders: number;
  admin_extra: number;
};

export async function GET() {
  const denied = requireAdmin();
  if (denied) return denied;
  if (!SUPABASE_CONFIGURED) {
    return NextResponse.json({ summary: [] });
  }

  try {
    const supabase = createAdminClient();

    const since = new Date();
    const day = since.getDay(); // 0=Sun
    since.setDate(since.getDate() - day);
    since.setHours(0, 0, 0, 0);

    const [{ data: products }, { data: inventory }, { data: orders }] =
      await Promise.all([
        supabase
          .from("products")
          .select("id, title, price_standard, cost_price")
          .eq("is_active", true)
          .order("sort_order", { ascending: true }),
        supabase
          .from("inventory")
          .select("product_id, live_stock_count, initial_stock_count"),
        supabase
          .from("orders")
          .select("items, delivery_type")
          .gte("created_at", since.toISOString())
          .in("status", ["approved", "completed"]),
      ]);

    type InventoryRow = { product_id: string; live_stock_count: number; initial_stock_count: number };
    type ProductRow = { id: string; title: string; price_standard: number; cost_price: number };

    const invMap = new Map(
      (inventory ?? []).map((i: InventoryRow) => [i.product_id, { live: i.live_stock_count, initial: i.initial_stock_count }]),
    );

    const counts = new Map<string, number>();
    for (const o of orders ?? []) {
      const items = Array.isArray(o.items) ? o.items : [];
      for (const it of items) {
        const pid = String(it.productId);
        const qty = Number(it.qty ?? 0);
        counts.set(pid, (counts.get(pid) ?? 0) + qty);
      }
    }

    const summary: SummaryRow[] = (products ?? []).map((p: ProductRow) => {
      const approved = counts.get(p.id) ?? 0;
      const inv = invMap.get(p.id);
      const live = inv?.live ?? 0;
      const initial = inv?.initial ?? live;
      const adminExtra = Math.max(0, live - approved);
      return {
        product_id: p.id,
        title: p.title,
        price_standard: p.price_standard,
        cost_price: p.cost_price,
        live_stock_count: live,
        initial_stock_count: initial,
        approved_orders: approved,
        admin_extra: adminExtra,
      };
    });

    return NextResponse.json({ summary });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ summary: [] });
  }
}
