import { NextResponse } from "next/server";
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

    const rows = (data ?? []) as unknown as Record<string, unknown>[];
    const approverIds = Array.from(new Set(rows.map((r) => r.approved_by).filter(Boolean).map(String)));
    const names = new Map<string, string>();
    if (approverIds.length) {
      const { data: emps } = await admin.from("employees").select("id, full_name").in("id", approverIds);
      for (const e of emps ?? []) names.set(String(e.id), String(e.full_name));
    }
    const orders = rows.map((r) => normalizeOrder(r, names));
    return NextResponse.json({
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
