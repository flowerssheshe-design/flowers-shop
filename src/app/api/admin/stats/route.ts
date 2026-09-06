import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SUPABASE_CONFIGURED, CLUB_DISCOUNT_THRESHOLD } from "@/lib/constants";
import { requireAdmin } from "@/lib/admin-auth";
import type { TopProduct, WeeklyKpi } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const EMPTY_KPI: WeeklyKpi = {
  total_revenue: 0,
  delivery_revenue: 0,
  products_revenue: 0,
  total_cost: 0,
  gross_profit: 0,
  orders_count: 0,
  pickup_count: 0,
  delivery_count: 0,
  member_orders_count: 0,
  new_customers_count: 0,
  returning_customers_count: 0,
  avg_order_value: 0,
  cancelled_orders_count: 0,
  cancelled_orders_value: 0,
  visitors_count: 0,
};

function emptyKpi(): WeeklyKpi {
  return { ...EMPTY_KPI };
}

export async function GET() {
  const denied = requireAdmin();
  if (denied) return denied;
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

    const since = new Date();
    const day = since.getUTCDay(); // 0 = Sunday
    const weekStart = new Date(since);
    weekStart.setUTCDate(since.getUTCDate() - day);
    weekStart.setUTCHours(0, 0, 0, 0);
    const prevStart = new Date(weekStart);
    prevStart.setUTCDate(prevStart.getUTCDate() - 7);
    const weekEnd = new Date(weekStart);
    weekEnd.setUTCDate(weekStart.getUTCDate() + 7);
    const prevEnd = new Date(prevStart);
    prevEnd.setUTCDate(prevStart.getUTCDate() + 7);

    const weekStartISO = weekStart.toISOString();
    const prevStartISO = prevStart.toISOString();
    const weekEndISO = weekEnd.toISOString();
    const prevEndISO = prevEnd.toISOString();

    const [{ data: finRows }, { data: prevFinRows }, { data: visitorCount }] = await Promise.all([
      admin.rpc("weekly_financial_summary", { week_start: weekStartISO }),
      admin.rpc("weekly_financial_summary", { week_start: prevStartISO }),
      admin.rpc("weekly_visitor_count", { week_start: weekStartISO }),
    ]);

    const kpi: WeeklyKpi = (finRows as WeeklyKpi[] | null)?.[0]
      ? (finRows as WeeklyKpi[])[0]
      : emptyKpi();

    const previousKpi: WeeklyKpi = (prevFinRows as WeeklyKpi[] | null)?.[0]
      ? (prevFinRows as WeeklyKpi[])[0]
      : emptyKpi();

    previousKpi.visitors_count = 0;

    kpi.visitors_count = Number((visitorCount as bigint[] | null)?.[0] ?? 0);

    const [{ data: topRows }, { data: supplierRows }] = await Promise.all([
      admin.rpc("weekly_top_products_with_costs", {
        week_start: weekStartISO,
        week_end: weekEndISO,
      }),
      admin.rpc("supplier_week_aggregate", { week_start: weekStartISO }),
    ]);

    const topProducts = (topRows as TopProduct[] | null) ?? [];

    const suppliers = (supplierRows as TopProduct[] | null) ?? [];

    const memberOrdersCount = kpi.member_orders_count;
    const total = kpi.orders_count || 0;
    const memberRatio = {
      members: Number(memberOrdersCount),
      total,
      percent: total > 0 ? Math.round((Number(memberOrdersCount) / total) * 100) : 0,
    };

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