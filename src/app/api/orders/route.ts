import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SUPABASE_CONFIGURED } from "@/lib/constants";
import { getUserOrderStats } from "@/lib/auth";
import { getServerSettings } from "@/lib/settings-server";
import { priceCart, type PricingProduct } from "@/lib/pricing";
import { cookies } from "next/headers";
import { sendOrderThanks } from "@/lib/staff/marketing/order-thanks";
import { getStoreMode, isRealtimeMode } from "@/lib/storeMode";
import { autoMarkSupplierOrderIfDue } from "@/lib/staff/owner/supplier-server";
import { orderTypeForMode } from "@/lib/staff/owner/store-mode";
import { TRACKING_COOKIE, resolveTrackingLinkId } from "@/lib/staff/owner/tracking";
import type { Order } from "@/types";

function readCookie(name: string): string | undefined {
  try {
    return cookies().get(name)?.value;
  } catch {
    return undefined;
  }
}

/** True when an insert failed only because a staff-system column is missing (migration 031 not run yet). */
function isMissingStaffColumn(error: unknown): boolean {
  const e = error as { message?: string; details?: string } | null;
  const text = `${e?.message ?? ""} ${e?.details ?? ""}`;
  return /order_type|tracking_link_id/.test(text);
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// Client-sent `price`, `total_amount`, `delivery_fee` and `is_member` are
// accepted for backward compatibility but never trusted: the server re-prices
// the cart from the DB. `total_amount` is only used to detect a stale cart.
const PRICE_TOLERANCE = 0.5;

const CartItemSchema = z.object({
  productId: z.string().uuid(),
  title: z.string().min(1).max(200),
  qty: z.number().int().min(1).max(999),
  price: z.number().min(0).max(100000),
  image_url: z.string().url().nullish(),
});

const BodySchema = z.object({
  customer_name: z.string().min(2).max(100),
  customer_phone: z.string().min(8).max(30),
  delivery_address: z.string().max(300).nullish(),
  items: z.array(CartItemSchema).min(1).max(50),
  total_amount: z.number().min(0).max(1000000),
  delivery_type: z.enum(["pickup", "delivery"]),
  delivery_fee: z.number().min(0).max(10000),
  is_member: z.boolean(),
  notes: z.string().max(500).nullish(),
  fulfillment_type: z.enum(["delivery", "pickup"]).optional(),
  payment_method: z.enum(["bit", "paybox", "cash"]).optional(),
  greeting_note: z.string().max(1000).nullish(),
});

export async function POST(req: Request) {
  if (!SUPABASE_CONFIGURED) {
    return NextResponse.json(
      { error: "המערכת אינה מוגדרת כרגע. נסו שוב מאוחר יותר." },
      { status: 503 },
    );
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "גוף הבקשה אינו תקין" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "נתוני ההזמנה אינם תקינים", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const body = parsed.data;
  if (body.delivery_type === "delivery" && !body.delivery_address) {
    return NextResponse.json(
      { error: "יש להזין כתובת למשלוח" },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let status: Order["status"] = "pending_payment";
  if (body.payment_method === "cash" && (body.fulfillment_type ?? body.delivery_type) === "pickup") {
    status = "approved";
  }

  // Server-side pricing: products from the DB, discount from the logged-in
  // user, delivery fee from system settings.
  let products: (PricingProduct & { is_active: boolean })[];
  try {
    const admin = createAdminClient();
    const ids = Array.from(new Set(body.items.map((it) => it.productId)));
    const { data, error } = await admin
      .from("products")
      .select("id, title, price_standard, image_url, is_active")
      .in("id", ids);
    if (error) {
      console.error("Order products lookup error:", error);
      return NextResponse.json(
        { error: "שגיאת שרת פנימית" },
        { status: 500 },
      );
    }
    products = ((data ?? []) as (PricingProduct & { is_active: boolean })[])
      .filter((p) => p.is_active);
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "שגיאת שרת פנימית" },
      { status: 500 },
    );
  }

  let discountPercent = 0;
  if (user) {
    try {
      const stats = await getUserOrderStats(user.id);
      discountPercent = stats.discountPercent;
    } catch {
      discountPercent = 0;
    }
  }

  const settings = await getServerSettings();
  const deliveryFee =
    body.delivery_type === "delivery" ? Number(settings.delivery_fee) || 0 : 0;

  const priced = priceCart(products, body.items, discountPercent, deliveryFee);
  if (priced.missing.length > 0) {
    return NextResponse.json(
      { error: "אחד המוצרים אינו זמין יותר" },
      { status: 400 },
    );
  }
  if (Math.abs(body.total_amount - priced.total) > PRICE_TOLERANCE) {
    return NextResponse.json(
      { error: "המחירים התעדכנו. רעננו את הדף ונסו שוב." },
      { status: 409 },
    );
  }
  const qualifies = discountPercent > 0;

  // The week phase (or the owner's override) decides the order type:
  // pre-orders feed the supplier order, live orders come out of stock.
  // Live stock exists only once the supplier order is marked; do it if due.
  await autoMarkSupplierOrderIfDue(createAdminClient());
  const storeMode = await getStoreMode();
  const isRealtime = isRealtimeMode(storeMode);
  const orderType = orderTypeForMode(storeMode);

  // Marketing attribution: only an existing, active tracking link is stored.
  let trackingLinkId: string | null = null;
  const refCookie = readCookie(TRACKING_COOKIE);
  if (refCookie) {
    trackingLinkId = await resolveTrackingLinkId(createAdminClient(), refCookie);
  }

  // Step 1: Create the order first (without deducting stock).
  // Stock is only deducted for orders that are already confirmed (approved),
  // i.e. cash pickup orders. For pending_payment (bit/paybox), stock is
  // deducted later when the admin confirms payment (status → approved).
  let orderData: Order;
  try {
    const admin = createAdminClient();
    const baseRow = {
      user_id: user?.id ?? null,
      customer_name: body.customer_name,
      customer_phone: body.customer_phone,
      delivery_address: body.delivery_address ?? null,
      items: priced.items,
      total_amount: priced.total,
      delivery_type: body.delivery_type,
      delivery_fee: priced.deliveryFee,
      is_member: qualifies,
      notes: body.notes ?? null,
      status,
      fulfillment_type: body.fulfillment_type ?? body.delivery_type,
      payment_method: body.payment_method ?? null,
      greeting_note: body.greeting_note ?? null,
      inventory_deducted: false,
    };
    let { data, error } = await admin
      .from("orders")
      .insert({ ...baseRow, order_type: orderType, tracking_link_id: trackingLinkId })
      .select("*")
      .single();
    if (error && isMissingStaffColumn(error)) {
      // DB not migrated yet: still take the order.
      ({ data, error } = await admin.from("orders").insert(baseRow).select("*").single());
    }

    if (error || !data) {
      console.error("Order insert error:", error);
      return NextResponse.json(
        { error: "שמירת ההזמנה נכשלה. נסו שוב." },
        { status: 500 },
      );
    }
    orderData = data as Order;
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "שגיאת שרת פנימית" },
      { status: 500 },
    );
  }

  // Step 2: Deduct stock at creation for all orders in realtime mode.
  // This reserves the stock immediately (prevents overselling) and ensures
  // the stall staff see reduced stock right away.
  // In pre-order mode, stock is not tracked — no deduction.
  const shouldDeductAtCreation =
    isRealtime && priced.items.length > 0;

  if (shouldDeductAtCreation) {
    const admin = createAdminClient();
    const deductedItems: { productId: string; qty: number }[] = [];
    for (const item of priced.items) {
      const { data: after, error: decErr } = await admin.rpc("decrement_inventory", {
        p_product_id: item.productId,
        p_qty: item.qty,
      });
      if (decErr || after === null || after === undefined) {
        for (const di of deductedItems) {
          await admin.rpc("increment_inventory", {
            p_product_id: di.productId,
            p_qty: di.qty,
          });
        }
        await admin.from("orders").delete().eq("id", orderData.id);
        return NextResponse.json(
          { error: `המוצר "${item.title}" אזל מהמלאי` },
          { status: 409 },
        );
      }
      deductedItems.push({ productId: item.productId, qty: item.qty });
    }
    await admin
      .from("orders")
      .update({ inventory_deducted: true })
      .eq("id", orderData.id);
    orderData.inventory_deducted = true;
  }

  // Step 3: Update user profile (non-fatal)
  if (user) {
    try {
      const admin = createAdminClient();
      await admin
        .from("profiles")
        .update({
          full_name: body.customer_name,
          phone: body.customer_phone,
          address:
            body.delivery_type === "delivery"
              ? body.delivery_address ?? null
              : undefined,
        })
        .eq("id", user.id);
    } catch {
      // non-fatal
    }
  }

  // Fire-and-forget; the automations cron catches anything this misses.
  void sendOrderThanks(orderData.id);

  return NextResponse.json({ order: orderData }, { status: 201 });
}
