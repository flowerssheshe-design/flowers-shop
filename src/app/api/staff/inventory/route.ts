import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaff } from "@/lib/staff/guard";
import { canManageTeam } from "@/lib/staff/access";
import { getServerSettings } from "@/lib/settings-server";
import { resolveWeek } from "@/lib/staff/ops/week-range";
import { addDays, currentBusinessWeek } from "@/lib/staff/week";
import { normalizeItems } from "@/lib/staff/ops/orders";
import { InventoryUpdateSchema } from "@/lib/staff/ops/schemas";
import { jsonError, notConfigured, parseBody, serverError } from "@/lib/staff/ops/http";
import type { InventoryRow } from "@/lib/staff/ops/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Global live stock per product + stock per stall.
 * "reserved" = qty in this business week's pending/approved orders (same rule as /api/inventory).
 */
export async function GET() {
  const guard = await requireStaff("inventory");
  if (!guard.ok) return guard.response;
  const nc = notConfigured();
  if (nc) return nc;

  try {
    const settings = await getServerSettings();
    const week = resolveWeek(null, settings);
    const admin = createAdminClient();
    const [productsRes, invRes, ordersRes, stallsRes, stallInvRes] = await Promise.all([
      admin.from("products").select("id, title, is_active, sort_order").order("sort_order").order("title"),
      admin.from("inventory").select("product_id, live_stock_count, initial_stock_count"),
      admin
        .from("orders")
        .select("items")
        .gte("created_at", week.from.toISOString())
        .lt("created_at", week.to.toISOString())
        .in("status", ["pending_payment", "approved"]),
      admin.from("stalls").select("id, name, is_active, sort_order").eq("is_active", true).order("sort_order").order("name"),
      admin.from("stall_inventory").select("stall_id, product_id, stock"),
    ]);
    const err = productsRes.error ?? invRes.error ?? ordersRes.error ?? stallsRes.error ?? stallInvRes.error;
    if (err) return serverError(err, "inventory GET");

    const inv = new Map(
      (invRes.data ?? []).map((r) => [
        String(r.product_id),
        { live: Number(r.live_stock_count) || 0, initial: r.initial_stock_count == null ? null : Number(r.initial_stock_count) },
      ]),
    );
    const reserved = new Map<string, number>();
    for (const o of ordersRes.data ?? []) {
      for (const it of normalizeItems(o.items)) reserved.set(it.productId, (reserved.get(it.productId) ?? 0) + it.qty);
    }
    const stallStock = new Map<string, Record<string, number>>();
    for (const r of stallInvRes.data ?? []) {
      const pid = String(r.product_id);
      const rec = stallStock.get(pid) ?? {};
      rec[String(r.stall_id)] = Number(r.stock) || 0;
      stallStock.set(pid, rec);
    }

    const rows: InventoryRow[] = (productsRes.data ?? [])
      .filter((p) => p.is_active || inv.has(String(p.id)))
      .map((p) => {
        const id = String(p.id);
        const i = inv.get(id);
        const live = i?.live ?? 0;
        return {
          product_id: id,
          title: String(p.title),
          is_active: p.is_active === true,
          live_stock_count: live,
          initial_stock_count: i?.initial ?? live,
          reserved: reserved.get(id) ?? 0,
          stalls: stallStock.get(id) ?? {},
        };
      });

    return NextResponse.json({
      rows,
      stalls: (stallsRes.data ?? []).map((s) => ({ id: String(s.id), name: String(s.name) })),
      canEdit: canManageTeam(guard.session.employee),
      // Stalls work on Friday only; the split in the stall columns is for this Friday.
      friday: addDays(currentBusinessWeek(settings).weekStart, 5),
    });
  } catch (e) {
    return serverError(e, "inventory GET");
  }
}

/** Owners only: set the global live / initial count of a product. */
export async function PATCH(req: Request) {
  const guard = await requireStaff("inventory", canManageTeam);
  if (!guard.ok) return guard.response;
  const nc = notConfigured();
  if (nc) return nc;
  const body = await parseBody(req, InventoryUpdateSchema);
  if (!body.ok) return body.response;
  const v = body.data;
  if (v.live_stock_count === undefined && v.initial_stock_count === undefined) {
    return jsonError("לא נשלח שום שינוי", 400);
  }

  try {
    const admin = createAdminClient();
    const { data: product } = await admin.from("products").select("id").eq("id", v.product_id).maybeSingle();
    if (!product) return jsonError("המוצר לא נמצא", 404);

    const { data: existing } = await admin
      .from("inventory")
      .select("live_stock_count, initial_stock_count")
      .eq("product_id", v.product_id)
      .maybeSingle();
    const live = v.live_stock_count ?? Number(existing?.live_stock_count ?? 0);
    const payload: Record<string, unknown> = { product_id: v.product_id, live_stock_count: live };
    if (v.initial_stock_count !== undefined) payload.initial_stock_count = v.initial_stock_count;
    else if (existing?.initial_stock_count == null) payload.initial_stock_count = live;

    const { data, error } = await admin
      .from("inventory")
      .upsert(payload, { onConflict: "product_id" })
      .select("product_id, live_stock_count, initial_stock_count")
      .single();
    if (error) return serverError(error, "inventory PATCH");
    return NextResponse.json({
      product_id: String(data.product_id),
      live_stock_count: Number(data.live_stock_count) || 0,
      initial_stock_count: data.initial_stock_count == null ? live : Number(data.initial_stock_count),
    });
  } catch (e) {
    return serverError(e, "inventory PATCH");
  }
}
