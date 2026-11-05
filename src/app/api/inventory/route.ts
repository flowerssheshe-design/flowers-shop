import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SUPABASE_CONFIGURED } from "@/lib/constants";
import { requireAdminOrStall } from "@/lib/admin-auth";
import { loadStallSplit } from "@/lib/staff/ops/stall-split-server";
import type { Inventory } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  if (!SUPABASE_CONFIGURED) {
    return NextResponse.json({ inventory: [] });
  }
  try {
    const supabase = await createAdminClient();
    const since = new Date();
    const day = since.getDay();
    since.setDate(since.getDate() - day);
    since.setHours(0, 0, 0, 0);

    const [{ data, error }, { data: orders }] = await Promise.all([
      supabase
        .from("inventory")
        .select("*")
        .order("product_id", { ascending: true }),
      supabase
        .from("orders")
        .select("items")
        .gte("created_at", since.toISOString())
        .in("status", ["approved", "pending_payment"]),
    ]);

    if (error) {
      return NextResponse.json(
        { error: "טעינת מלאי נכשלה" },
        { status: 500 },
      );
    }

    const counts = new Map<string, number>();
    for (const o of orders ?? []) {
      const items = Array.isArray(o.items) ? o.items : [];
      for (const it of items) {
        const pid = String(it.productId);
        const qty = Number(it.qty ?? 0);
        counts.set(pid, (counts.get(pid) ?? 0) + qty);
      }
    }

    // Pickup points and what each still has. Without them (or before migration
    // 043) the storefront works with the general stock and one pickup address.
    let pickupPoints: { id: string; name: string; location: string | null; stock: Record<string, number> }[] = [];
    let deliveryStock: Record<string, number> | null = null;
    let orderable: Map<string, number> | null = null;
    // Friday: closed stalls take no orders; with every stall closed nothing can be ordered.
    let pickupClosed = false;
    let orderingClosed = false;
    try {
      const split = await loadStallSplit(supabase);
      orderingClosed = split.noOrders;
      const configured = split.stalls.filter((s) => s.is_pickup_point);
      pickupClosed = configured.length > 0 && configured.every((s) => split.closedForOrders.has(s.id));
      pickupPoints = configured
        .filter((s) => !split.closedForOrders.has(s.id))
        .map((s) => ({
          id: s.id,
          name: s.name,
          location: s.location,
          stock: Object.fromEntries(Array.from(split.split.entries()).map(([pid, p]) => [pid, p.stallFree[s.id] ?? 0])),
        }));
      deliveryStock = Object.fromEntries(Array.from(split.split.entries()).map(([pid, p]) => [pid, p.deliveryFree]));
      orderable = new Map(Array.from(split.split.entries()).map(([pid, p]) => [pid, p.orderable]));
    } catch (e) {
      console.error("inventory GET stall split:", e);
    }

    const inventory = (data ?? []).map((row) => ({
      ...row,
      reserved_orders: counts.get(row.product_id) ?? 0,
      // What can still be ordered somewhere (best pickup point, or delivery).
      orderable: orderable?.get(row.product_id) ?? row.live_stock_count ?? 0,
    }));

    return NextResponse.json({
      inventory,
      pickup_points: pickupPoints,
      delivery_stock: deliveryStock,
      pickup_closed: pickupClosed,
      ordering_closed: orderingClosed,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "שגיאת שרת" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const denied = requireAdminOrStall();
  if (denied) return denied;
  if (!SUPABASE_CONFIGURED) {
    return NextResponse.json({ error: "המערכת אינה מוגדרת" }, { status: 503 });
  }
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json(
      { error: "נתונים לא תקינים" },
      { status: 400 },
    );
  }
  const product_id = String(body.product_id ?? "");
  const live_stock_count = typeof body.live_stock_count === "number" ? body.live_stock_count : undefined;
  const initial_stock_count = typeof body.initial_stock_count === "number" ? body.initial_stock_count : undefined;
  const delta = typeof body.delta === "number" ? body.delta : undefined;
  if (!product_id || (live_stock_count === undefined && delta === undefined && initial_stock_count === undefined)) {
    return NextResponse.json({ error: "יש לציין כמות או דלתא" }, { status: 400 });
  }
  try {
    const admin = createAdminClient();
    let current = live_stock_count;
    if (current === undefined && delta !== undefined) {
      const { data: inv } = await admin
        .from("inventory")
        .select("live_stock_count")
        .eq("product_id", product_id)
        .single();
      current = (inv?.live_stock_count ?? 0) + delta;
    }
    if (typeof current !== "number" || current < 0) {
      return NextResponse.json(
        { error: "כמות לא תקינה" },
        { status: 400 },
      );
    }

    const upsertPayload: Record<string, any> = { product_id, live_stock_count: current };
    if (initial_stock_count !== undefined) {
      upsertPayload.initial_stock_count = initial_stock_count;
    } else {
      const { data: existing } = await admin
        .from("inventory")
        .select("initial_stock_count")
        .eq("product_id", product_id)
        .single();
      if (existing?.initial_stock_count == null) {
        upsertPayload.initial_stock_count = current;
      }
    }

    const { data, error } = await admin
      .from("inventory")
      .upsert(upsertPayload, { onConflict: 'product_id' })
      .select("*")
      .single();
    if (error || !data) {
      console.error("Inventory upsert error:", error);
      return NextResponse.json(
        { error: "שגיאה בעדכון מלאי", details: error?.message },
        { status: 500 },
      );
    }
    return NextResponse.json({ inventory: data as Inventory });
  } catch (e) {
    console.error("Inventory patch exception:", e);
    return NextResponse.json({ error: "שגיאת שרת" }, { status: 500 });
  }
}
