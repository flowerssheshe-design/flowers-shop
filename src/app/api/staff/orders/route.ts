import { NextResponse } from "next/server";
import { isStallSaleOrder } from "@/lib/utils";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaff } from "@/lib/staff/guard";
import { getServerSettings } from "@/lib/settings-server";
import { resolveWeek } from "@/lib/staff/ops/week-range";
import { ORDER_COLUMNS, normalizeOrder, summarizeOrders } from "@/lib/staff/ops/orders";
import { notConfigured, serverError } from "@/lib/staff/ops/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Orders of one business week (default: the current one) with a summary. */
export async function GET(req: Request) {
  const guard = await requireStaff("orders");
  if (!guard.ok) return guard.response;
  const nc = notConfigured();
  if (nc) return nc;

  try {
    const settings = await getServerSettings();
    const week = resolveWeek(new URL(req.url).searchParams.get("week"), settings);
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("orders")
      .select(ORDER_COLUMNS)
      .gte("created_at", week.from.toISOString())
      .lt("created_at", week.to.toISOString())
      .order("created_at", { ascending: false })
      .limit(2000);
    if (error) return serverError(error, "orders GET");

    // Stall sales are not customer orders: they show on the stall screen and in the money pages.
    const rows = ((data ?? []) as unknown as Record<string, unknown>[]).filter(
      (r) => !(r.order_type === "stall" || isStallSaleOrder(r as { notes?: string | null; customer_name?: string | null })),
    );
    const approverIds = Array.from(new Set(rows.map((r) => r.approved_by).filter(Boolean).map(String)));
    const names = new Map<string, string>();
    if (approverIds.length) {
      const { data: emps } = await admin.from("employees").select("id, full_name").in("id", approverIds);
      for (const e of emps ?? []) names.set(String(e.id), String(e.full_name));
    }
    const orders = rows.map((r) => normalizeOrder(r, names));
    // For moving an order to another stall ("*": the point flags exist only after migrations 043 / 045).
    const { data: stallRows } = await admin.from("stalls").select("*").eq("is_active", true).order("sort_order");
    const stalls = ((stallRows ?? []) as Record<string, unknown>[]).map((s) => ({
      id: String(s.id),
      name: String(s.name),
      is_pickup_point: s.is_pickup_point === true,
      is_delivery_point: s.is_delivery_point === true,
    }));
    return NextResponse.json({
      stalls,
      weekStart: week.weekStart,
      weekEnd: week.weekEnd,
      isCurrentWeek: week.isCurrentWeek,
      orders,
      summary: summarizeOrders(orders),
    });
  } catch (e) {
    return serverError(e, "orders GET");
  }
}
