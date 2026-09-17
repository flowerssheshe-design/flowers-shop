import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SUPABASE_CONFIGURED } from "@/lib/constants";
import { requireAdmin } from "@/lib/admin-auth";
import type {
  StatsPayloadExtended,
  BestSeller,
  SellThrough,
  AllTimeMetrics,
  CustomerSegments,
} from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const noStoreHeaders = {
  "Cache-Control": "no-store, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

function withNoStoreHeaders<T extends Response>(response: T) {
  Object.entries(noStoreHeaders).forEach(([key, value]) => {
    response.headers.set(key, value);
  });
  return response;
}

function jsonNoStore(body: unknown, init: ResponseInit = {}) {
  return withNoStoreHeaders(NextResponse.json(body, init));
}

function getRpcRow(data: unknown) {
  if (Array.isArray(data)) {
    const firstRow = data[0];
    return firstRow && typeof firstRow === "object"
      ? (firstRow as Record<string, unknown>)
      : null;
  }

  return data && typeof data === "object"
    ? (data as Record<string, unknown>)
    : null;
}

function toNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function parseAllTimeMetrics(data: unknown): AllTimeMetrics {
  const row = getRpcRow(data);

  return {
    cumulative_gross_profit: Number(row?.cumulative_gross_profit) || 0,
    total_expenses: Number(row?.total_expenses) || 0,
    true_net_profit: Number(row?.true_net_profit) || 0,
  };
}

function parseBestSeller(data: unknown): BestSeller | null {
  const row = getRpcRow(data);
  if (!row || typeof row.product_id !== "string" || typeof row.title !== "string") {
    return null;
  }

  return {
    product_id: row.product_id,
    title: row.title,
    total_units: toNumber(row.total_units),
    total_revenue: toNumber(row.total_revenue),
    total_profit: toNumber(row.total_profit),
  };
}

function parseSellThrough(data: unknown): SellThrough | null {
  const row = getRpcRow(data);
  if (!row || typeof row.product_id !== "string" || typeof row.title !== "string") {
    return null;
  }

  return {
    product_id: row.product_id,
    title: row.title,
    total_sold: toNumber(row.total_sold),
    initial_stock: toNumber(row.initial_stock),
    sell_through_pct: toNumber(row.sell_through_pct),
  };
}

function parseCustomerSegments(data: unknown): CustomerSegments {
  const row = getRpcRow(data);

  return {
    regular_customers: toNumber(row?.regular_customers),
    loyal_customers: toNumber(row?.loyal_customers),
  };
}

function logRpcError(name: string, error: unknown) {
  if (error) {
    console.error(`Stats API RPC Error (${name}):`, error);
  }
}

function getWeekBounds() {
  const since = new Date();
  const day = since.getUTCDay();
  const weekStart = new Date(since);
  weekStart.setUTCDate(since.getUTCDate() - day);
  weekStart.setUTCHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekStart.getUTCDate() + 7);
  return { weekStart: weekStart.toISOString(), weekEnd: weekEnd.toISOString() };
}

export async function GET() {
  try {
    const denied = requireAdmin();
    if (denied) return withNoStoreHeaders(denied);

    const { weekStart, weekEnd } = getWeekBounds();
    const emptyPayload = {
      weekStart,
      weekEnd,
      allTimeMetrics: {
        cumulative_gross_profit: 0,
        total_expenses: 0,
        true_net_profit: 0,
      },
      bestSellerPreorders: null,
      bestSellerStallSales: null,
      highestSellThrough: null,
      customerSegments: { regular_customers: 0, loyal_customers: 0 },
    };

    if (!SUPABASE_CONFIGURED) {
      return jsonNoStore(emptyPayload);
    }

    const admin = createAdminClient();
    const { data: allTimeMetricsData, error: allTimeMetricsRpcError } =
      await admin.rpc("all_time_metrics");
    if (allTimeMetricsRpcError) {
      throw allTimeMetricsRpcError;
    }

    type RpcResult = { data: unknown; error: unknown };
    const subsetResults = await Promise.allSettled([
      Promise.resolve().then(() => admin.rpc("best_seller_preorders")),
      Promise.resolve().then(() => admin.rpc("best_seller_stall_sales")),
      Promise.resolve().then(() => admin.rpc("highest_sell_through_rate_stall")),
      Promise.resolve().then(() => admin.rpc("customer_segment_counts")),
    ]);
    const [
      bestSellerPreorderResult,
      bestSellerStallResult,
      sellThroughResult,
      customerSegmentsResult,
    ] = subsetResults.map((result): RpcResult =>
      result.status === "fulfilled"
        ? { data: result.value.data, error: result.value.error }
        : { data: null, error: result.reason },
    );

    logRpcError("best_seller_preorders", bestSellerPreorderResult.error);
    logRpcError("best_seller_stall_sales", bestSellerStallResult.error);
    logRpcError("highest_sell_through_rate_stall", sellThroughResult.error);
    logRpcError("customer_segment_counts", customerSegmentsResult.error);

    return jsonNoStore({
      weekStart,
      weekEnd,
      allTimeMetrics: parseAllTimeMetrics(allTimeMetricsData),
      bestSellerPreorders: parseBestSeller(bestSellerPreorderResult.data),
      bestSellerStallSales: parseBestSeller(bestSellerStallResult.data),
      highestSellThrough: parseSellThrough(sellThroughResult.data),
      customerSegments: parseCustomerSegments(customerSegmentsResult.data),
    });
  } catch (error) {
    console.error("Stats API Error:", error);
    if (error instanceof Error) {
      console.error("Stats API Error Message:", error.message);
      console.error("Stats API Error Stack:", error.stack);
    }
    return jsonNoStore({ error: "שגיאת שרת" }, { status: 500 });
  }
}
