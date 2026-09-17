import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SUPABASE_CONFIGURED } from "@/lib/constants";
import { requireAdmin } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function getPreviousWeekBounds() {
  const now = new Date();
  const day = now.getUTCDay();
  const diff = now.getUTCDay() === 0 ? 7 : now.getUTCDay();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  start.setUTCDate(start.getUTCDate() - diff);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
  return { start, end };
}

export async function POST() {
  const denied = requireAdmin();
  if (denied) return denied;
  if (!SUPABASE_CONFIGURED) {
    return NextResponse.json(
      { error: "המערכת אינה מוגדרת כרגע. נסו שוב מאוחר יותר." },
      { status: 503 },
    );
  }

  try {
    const admin = createAdminClient();
    const { start, end } = getPreviousWeekBounds();

    const [ordersRes, productsRes, inventoryRes, expensesRes] = await Promise.all([
      admin
        .from("orders")
        .select("*")
        .gte("created_at", start.toISOString())
        .lt("created_at", end.toISOString())
        .neq("status", "cancelled"),
      admin
        .from("products")
        .select("id, title, price_standard, cost_price")
        .eq("is_active", true),
      admin
        .from("inventory")
        .select("product_id, live_stock_count, initial_stock_count"),
      admin
        .from("expenses")
        .select("amount")
        .gte("created_at", start.toISOString())
        .lt("created_at", end.toISOString()),
    ]);

    if (ordersRes.error) {
      return NextResponse.json(
        { error: ordersRes.error.message || "שגיאה בטעינת הזמנות" },
        { status: 500 },
      );
    }

    if (expensesRes.error) {
      return NextResponse.json(
        { error: expensesRes.error.message || "שגיאה בטעינת הוצאות" },
        { status: 500 },
      );
    }

    const orders = ordersRes.data ?? [];
    const products = productsRes.data ?? [];
    const inventoryRows = inventoryRes.data ?? [];

    const totalExpenses = (expensesRes.data ?? []).reduce(
      (sum: number, e: { amount: number | string | null | undefined }) =>
        sum + Number(e?.amount || 0),
      0,
    );

    const productMap = new Map<string, { cost_price: number; title: string }>();
    products.forEach((p) => {
      productMap.set(p.id, {
        cost_price: Number(p.cost_price || 0),
        title: p.title,
      });
    });

    function extractItems(order: any) {
      const items = Array.isArray(order.items) ? order.items : [];
      return items.map((item: any) => ({
        product_id: String(item.productId || ""),
        title: item.title || "מוצר",
        qty: Number(item.qty || 0),
        price: Number(item.price || 0),
      }));
    }

    // --- Per-product pre-order units (to subtract from inventory-based stall sales) ---
    const preOrderUnitsById = new Map<string, number>();
    const activeOrdersForUnits = orders.filter((o) => o.status === "approved" || o.status === "completed");
    for (const order of activeOrdersForUnits) {
      // Only count actual pre-orders (real customer phone) toward pre-order stats.
      // Stall sales (empty customer_phone) are tracked via inventory deductions only.
      if (!order.customer_phone || order.customer_phone.trim() === '') continue;
      const items = extractItems(order);
      for (const item of items) {
        const pid = item.product_id;
        preOrderUnitsById.set(pid, (preOrderUnitsById.get(pid) ?? 0) + item.qty);
      }
    }

    // --- Per-product stall inventory breakdown (from inventory snapshot) ---
    // Subtract pre-order units from inventory-based sales to avoid double-counting
    // in Live Sale mode (online orders also deduct live_stock_count).
    const invMap = new Map<string, { live: number; initial: number }>();
    for (const row of inventoryRows ?? []) {
      invMap.set(String(row.product_id), {
        live: Number(row.live_stock_count ?? 0),
        initial: Number(row.initial_stock_count ?? 0),
      });
    }
    const stallByProduct = (products ?? []).map((p) => {
      const inv = invMap.get(String(p.id)) ?? { live: 0, initial: 0 };
      const initialStock = Math.max(0, inv.initial);
      const liveStock = Math.max(0, inv.live);
      const inventoryBasedSold = Math.max(0, initialStock - liveStock);
      const preOrderUnits = preOrderUnitsById.get(String(p.id)) ?? 0;
      const unitsSold = Math.max(0, inventoryBasedSold - preOrderUnits);
      const sellThrough = initialStock > 0 ? (unitsSold / initialStock) * 100 : 0;
      const revenue = unitsSold * Number(p.price_standard || 0);
      const profit = unitsSold * Math.max(0, Number(p.price_standard || 0) - Number(p.cost_price || 0));
      const supplierCost = unitsSold * Number(p.cost_price || 0);
      return {
        product_id: String(p.id),
        title: p.title,
        initial_stock_count: initialStock,
        live_stock_count: liveStock,
        units_sold: unitsSold,
        sell_through_percent: Number(sellThrough.toFixed(2)),
        revenue,
        supplier_cost: supplierCost,
        profit,
      };
    }).sort((a, b) => b.units_sold - a.units_sold);

    const stallTotals = stallByProduct.reduce(
      (acc, p) => ({
        initial_stock_count: acc.initial_stock_count + p.initial_stock_count,
        live_stock_count: acc.live_stock_count + p.live_stock_count,
        units_sold: acc.units_sold + p.units_sold,
        revenue: acc.revenue + p.revenue,
        supplier_cost: acc.supplier_cost + p.supplier_cost,
        profit: acc.profit + p.profit,
      }),
      { initial_stock_count: 0, live_stock_count: 0, units_sold: 0, revenue: 0, supplier_cost: 0, profit: 0 },
    );
    const stallOverallSellThrough =
      stallTotals.initial_stock_count > 0
        ? Number(((stallTotals.units_sold / stallTotals.initial_stock_count) * 100).toFixed(2))
        : 0;

    const stallInventoryRevenue = stallTotals.revenue;
    const stallInventorySupplierCost = stallTotals.supplier_cost;
    const stallInventoryProfit = stallTotals.profit;

    // --- Order-based breakdowns ---
    const activeOrders = orders.filter((o) => o.status === "approved" || o.status === "completed");
    // Pre-orders are orders with a real customer phone (not empty/stall sale).
    const preorders = activeOrders.filter((o) => o.customer_phone && o.customer_phone.trim() !== "");
    // NOTE: stall sales are tracked via inventory deduction (see /api/stall/deduct),
    // NOT via orders — so the stall count/revenue/profit below are inventory-based.

    // --- Pre-Orders Breakdown ---
    let preordersRevenue = 0;
    let preordersSupplierCost = 0;
    const preorderItems: any[] = [];

    preorders.forEach((order: any) => {
      preordersRevenue += Number(order.total_amount || 0);
      const items = extractItems(order);
      items.forEach((item: any) => {
        const cost = productMap.get(item.product_id)?.cost_price || 0;
        preordersSupplierCost += item.qty * cost;
        preorderItems.push({
          order_id: order.id,
          product_id: item.product_id,
          title: item.title,
          qty: item.qty,
          price: item.price,
          cost_price: cost,
          line_total: item.qty * item.price,
          line_cost: item.qty * cost,
        });
      });
    });

    const preordersProfit = preordersRevenue - preordersSupplierCost;

    // --- Overall product stats (from all non-archived orders, excluding stall sales) ---
    // Stall sales (empty customer_phone) are tracked via inventory deductions, not orders.
    const allActiveOrders = orders.filter((o) => o.status !== "archived" && o.customer_phone && o.customer_phone.trim() !== "");
    const allItems = allActiveOrders.flatMap(extractItems);

    const productStats = new Map<string, { units: number; revenue: number; cost: number }>();
    allItems.forEach((item) => {
      const existing = productStats.get(item.product_id) || { units: 0, revenue: 0, cost: 0 };
      const cost = productMap.get(item.product_id)?.cost_price || 0;
      productStats.set(item.product_id, {
        units: existing.units + item.qty,
        revenue: existing.revenue + item.qty * item.price,
        cost: existing.cost + item.qty * cost,
      });
    });

    const orderTopProducts = Array.from(productStats.entries())
      .map(([product_id, stats]) => ({
        product_id,
        title: productMap.get(product_id)?.title || "מוצר",
        units: stats.units,
        revenue: stats.revenue,
        cost: stats.cost,
        profit: stats.revenue - stats.cost,
      }))
      .sort((a, b) => b.units - a.units);

    // --- Merge top_products: inventory data takes priority (includes both channels) ---
    const stallProductMap = new Map<string, { product_id: string; title: string; units_sold: number; revenue: number; supplier_cost: number; profit: number }>();
    (stallByProduct || []).forEach((p) => {
      stallProductMap.set(p.product_id, p);
    });

    const mergedTopProducts = orderTopProducts.map((op) => {
      const stall = stallProductMap.get(op.product_id);
      if (stall) {
        return {
          product_id: op.product_id,
          title: stall.title,
          units: stall.units_sold,
          revenue: stall.revenue,
          cost: stall.supplier_cost,
          profit: stall.profit,
        };
      }
      return op;
    });
    stallProductMap.forEach((stall) => {
      if (!mergedTopProducts.find((p) => p.product_id === stall.product_id)) {
        mergedTopProducts.push({
          product_id: stall.product_id,
          title: stall.title,
          units: stall.units_sold,
          revenue: stall.revenue,
          cost: stall.supplier_cost,
          profit: stall.profit,
        });
      }
    });
    mergedTopProducts.sort((a, b) => b.units - a.units);

    const topProducts = mergedTopProducts;

    // --- Unified archival metrics (Pre-Orders + Stall Inventory) ---
    const unifiedTotalRevenue = preordersRevenue + stallInventoryRevenue;
    const unifiedTotalSupplierCost = preordersSupplierCost + stallInventorySupplierCost;
    const unifiedNetProfit = unifiedTotalRevenue - unifiedTotalSupplierCost;

    const productSales = [...topProducts].sort((a, b) => b.profit - a.profit);

    const totalCost = unifiedTotalSupplierCost;
    const grossProfit = unifiedNetProfit;
    const totalRevenue = unifiedTotalRevenue;
    const deliveryRevenue = 0;
    const productsRevenue = totalRevenue;
    const pickupCount = allActiveOrders.filter((o) => o.delivery_type === "pickup").length;
    const deliveryCount = allActiveOrders.filter((o) => o.delivery_type === "delivery").length;
    const memberOrdersCount = allActiveOrders.filter((o) => o.is_member).length;
    const customerPhones = new Set(allActiveOrders.map((o) => o.customer_phone).filter(Boolean));
    const newCustomersCount = customerPhones.size;
    const returningCustomersCount = 0;

    // --- Build JSON snapshot with itemized data ---
    const snapshot = {
      preorders: {
        count: preorders.length,
        revenue: preordersRevenue,
        supplier_cost: preordersSupplierCost,
        profit: preordersProfit,
        items: preorderItems,
      },
      stall_sales: {
        count: stallTotals.units_sold,
        revenue: stallInventoryRevenue,
        supplier_cost: stallTotals.supplier_cost,
        profit: stallInventoryProfit,
        items: stallByProduct,
      },
      stall_inventory: {
        totals: stallTotals,
        sell_through_percent: stallOverallSellThrough,
        products: stallByProduct,
      },
      supplier_cost: totalCost,
      gross_profit: grossProfit,
      expenses: totalExpenses,
      net_profit: grossProfit - totalExpenses,
      archived_at: new Date().toISOString(),
    };

    const weekLabel = `סבב - ${start.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" })}`;

    const fullPayload: Record<string, unknown> = {
      week_start: start.toISOString(),
      week_end: end.toISOString(),
      archived_at: new Date().toISOString(),
      week_label: weekLabel,
      total_revenue: totalRevenue,
      delivery_revenue: deliveryRevenue,
      products_revenue: productsRevenue,
      total_cost: totalCost,
      gross_profit: grossProfit,
      orders_count: allActiveOrders.length,
      pickup_count: pickupCount,
      delivery_count: deliveryCount,
      member_orders_count: memberOrdersCount,
      new_customers_count: newCustomersCount,
      returning_customers_count: returningCustomersCount,
      cancelled_orders_count: 0,
      cancelled_orders_value: 0,
      preorders_count: preorders.length,
      preorders_revenue: preordersRevenue,
      preorders_profit: preordersProfit,
      stall_sales_count: stallTotals.units_sold,
      stall_revenue: stallInventoryRevenue,
      stall_profit: stallInventoryProfit,
      total_supplier_cost: totalCost,
      total_expenses: totalExpenses,
      total_net_profit: grossProfit - totalExpenses,
      top_products: topProducts,
      product_sales: productSales,
      snapshot_data: snapshot,
    };

    let archive: { id: string } | null = null;
    let archiveError: { message?: string; details?: string } | null = null;
    let attemptPayload: Record<string, unknown> = { ...fullPayload };
    let attemptKeys = Object.keys(attemptPayload);

    while (attemptKeys.length > 0) {
      const { data, error } = await admin
        .from("weekly_archives")
        .insert(attemptPayload)
        .select("id")
        .single();

      if (!error && data) {
        archive = { id: data.id };
        break;
      }

      archiveError = (error as unknown as { message?: string; details?: string }) ?? null;
      const msg = `${error?.message ?? ""} ${error?.details ?? ""}`.toLowerCase();
      const missingColMatch = msg.match(/column\s+["']?([a-z_0-9]+)["']?\s\s+(?:of\s+relation|does not exist)/i);
      const unknownField = missingColMatch?.[1];
      if (unknownField && unknownField in attemptPayload) {
        delete attemptPayload[unknownField];
        attemptKeys = Object.keys(attemptPayload);
        archiveError = null;
        continue;
      }
      const dropped = attemptKeys.pop();
      if (dropped) delete attemptPayload[dropped];
    }

    if (!archive) {
      console.error("weekly_archives insert failed:", archiveError);
      return NextResponse.json(
        {
          error:
            archiveError?.message ||
            archiveError?.details ||
            "שגיאה בשמירת ארכיון",
        },
        { status: 500 },
      );
    }

    const finalArchive = archive;

    const archiveIds = allActiveOrders.map((o) => o.id);
    if (archiveIds.length > 0) {
      const { error: updateError } = await admin
        .from("orders")
        .update({ status: "archived" })
        .in("id", archiveIds);
      if (updateError) {
        return NextResponse.json(
          { error: updateError.message || "שגיאה בעדכון הזמנות" },
          { status: 500 },
        );
      }
    }

    const { data: activeProducts, error: productsError } = await admin
      .from("products")
      .select("id")
      .eq("is_active", true);

    if (!productsError && activeProducts && activeProducts.length > 0) {
      const productIds = activeProducts.map((p) => p.id);
      const { error: resetErr } = await admin
        .from("inventory")
        .update({
          live_stock_count: 0,
          initial_stock_count: 0,
          updated_at: new Date().toISOString(),
        })
        .in("product_id", productIds);
      if (resetErr) {
        console.error("Inventory reset error:", resetErr);
      }
    }

    return NextResponse.json({ archive_id: finalArchive!.id });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "שגיאת שרת פנימית" },
      { status: 500 },
    );
  }
}
