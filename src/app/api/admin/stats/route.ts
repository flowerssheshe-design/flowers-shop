import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SUPABASE_CONFIGURED, CLUB_DISCOUNT_THRESHOLD } from "@/lib/constants";
import type { TopProduct, WeeklyKpi } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const EMPTY_KPI: WeeklyKpi = {
  total_revenue: 0,
  delivery_revenue: 0,
  products_revenue: 0,
  orders_count: 0,
  pickup_count: 0,
  delivery_count: 0,
  member_orders_count: 0,
  new_customers_count: 0,
  returning_customers_count: 0,
  avg_order_value: 0,
};

function emptyKpi(): WeeklyKpi {
  return { ...EMPTY_KPI };
}

export async function GET() {
  if (!SUPABASE_CONFIGURED) {
    return NextResponse.json({
      kpi: emptyKpi(),
      previousKpi: emptyKpi(),
      topProducts: [] as TopProduct[],
      suppliers: [] as TopProduct[],
      memberRatio: { members: 0, total: 0, percent: 0 },
    });
  }
  try {
    const admin = createAdminClient();

    const { data: kpiRows, error: kpiError } = await admin.rpc(
      "weekly_stats",
      {},
    );
    if (kpiError) console.error("weekly_stats error:", kpiError);

    const kpi: WeeklyKpi = (kpiRows as WeeklyKpi[] | null)?.[0]
      ? (kpiRows as WeeklyKpi[])[0]
      : emptyKpi();

    // Previous week (last 7 days excluding current week) for comparison.
    const since = new Date();
    const day = since.getDay(); // 0 = Sunday
    const weekStart = new Date(since);
    weekStart.setDate(since.getDate() - day);
    weekStart.setHours(0, 0, 0, 0);
    const prevStart = new Date(weekStart);
    prevStart.setDate(prevStart.getDate() - 7);

    const { data: prevRows } = await admin.rpc("weekly_stats", {
      week_start: prevStart.toISOString(),
    });
    const previousKpi: WeeklyKpi = (prevRows as WeeklyKpi[] | null)?.[0]
      ? (prevRows as WeeklyKpi[])[0]
      : emptyKpi();

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 7);
    const { data: topRows } = await admin.rpc("weekly_top_products", {
      week_start: weekStart.toISOString(),
      week_end: weekEnd.toISOString(),
    });
    const topProducts = (topRows as TopProduct[] | null) ?? [];

    const { data: supplierRows } = await admin.rpc("supplier_week_aggregate");
    const suppliers = (supplierRows as TopProduct[] | null) ?? [];

    // Member ratio: orders by is_member in current week
    const memberOrdersCount = kpi.member_orders_count;
    const total = kpi.orders_count || 0;
    const memberRatio = {
      members: Number(memberOrdersCount),
      total,
      percent: total > 0 ? Math.round((Number(memberOrdersCount) / total) * 100) : 0,
    };

    // Fulfillment split derived from KPI counts
    const fulfillment = {
      pickup: kpi.pickup_count,
      delivery: kpi.delivery_count,
      pickupPercent:
        kpi.orders_count > 0
          ? Math.round((kpi.pickup_count / kpi.orders_count) * 100)
          : 0,
      deliveryPercent:
        kpi.orders_count > 0
          ? Math.round((kpi.delivery_count / kpi.orders_count) * 100)
          : 0,
    };

    return NextResponse.json({
      kpi,
      previousKpi,
      topProducts,
      suppliers,
      memberRatio,
      fulfillment,
      weekStart: weekStart.toISOString(),
      weekEnd: weekEnd.toISOString(),
      threshold: CLUB_DISCOUNT_THRESHOLD,
    });
  } catch (e) {
    console.error("stats route error:", e);
    return NextResponse.json({ error: "שגיאת שרת" }, { status: 500 });
  }
}