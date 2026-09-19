import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { SUPABASE_CONFIGURED } from "@/lib/constants";
import { requireAdmin } from "@/lib/admin-auth";
import { getStoreMode, isRealtimeMode } from "@/lib/storeMode";
import type { CartItem, Order } from "@/types";

const CartItemSchema = z.object({
  productId: z.string().uuid(),
  title: z.string().min(1).max(200),
  qty: z.number().int().min(1).max(999),
  price: z.number().min(0).max(100000),
  image_url: z.string().url().nullish(),
});

const CreateOrderSchema = z.object({
  customer_name: z.string().min(2).max(100),
  customer_phone: z.string().min(8).max(30),
  delivery_address: z.string().max(300).nullish(),
  items: z.array(CartItemSchema).min(1).max(50),
  total_amount: z.number().min(0).max(1000000),
  delivery_type: z.enum(["pickup", "delivery"]),
  delivery_fee: z.number().min(0).max(10000),
  is_member: z.boolean().optional().default(false),
  notes: z.string().max(500).nullish(),
  fulfillment_type: z.enum(["delivery", "pickup"]).optional(),
  payment_method: z.enum(["bit", "paybox", "cash"]).optional(),
  greeting_note: z.string().max(1000).nullish(),
  status: z.enum(["pending_payment", "approved", "completed", "cancelled"]).optional(),
  user_id: z.string().nullish(),
});

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  const denied = requireAdmin();
  if (denied) return denied;
  if (!SUPABASE_CONFIGURED) {
    return NextResponse.json({ orders: [] });
  }
  try {
    const admin = createAdminClient();
    const url = new URL(req.url);
    const includeArchived = url.searchParams.get("includeArchived") === "1";

    let query = admin
      .from("orders")
      .select("*")
      .order("created_at", { ascending: false });

    if (!includeArchived) {
      query = query.neq("status", "archived");
    }

    const { data, error } = await query.limit(1000);
    if (error) {
      return NextResponse.json(
        { error: "טעינת הזמנות נכשלה" },
        { status: 500 },
      );
    }
    return NextResponse.json({ orders: (data as Order[]) ?? [] });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "שגיאת שרת" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const denied = requireAdmin();
  if (denied) return denied;
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

  const parsed = CreateOrderSchema.safeParse(payload);
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

  const userId = body.user_id ?? null;

  let status: Order["status"] = body.status ?? "pending_payment";

  // Step 1: Create the order first (without deducting stock).
  let orderData: Order;
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("orders")
      .insert({
        user_id: userId,
        customer_name: body.customer_name,
        customer_phone: body.customer_phone,
        delivery_address: body.delivery_address ?? null,
        items: body.items,
        total_amount: body.total_amount,
        delivery_type: body.delivery_type,
        delivery_fee: body.delivery_fee,
        is_member: body.is_member,
        notes: body.notes ?? null,
        status,
        fulfillment_type: body.fulfillment_type ?? body.delivery_type,
        payment_method: body.payment_method ?? null,
        greeting_note: body.greeting_note ?? null,
        inventory_deducted: false,
      })
      .select("*")
      .single();

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
      { error: "שגיאת שרת פנימי" },
      { status: 500 },
    );
  }

  // Step 2: Deduct stock at creation for all orders in realtime mode.
  // For cancelled orders, no stock is deducted.
  const storeMode = await getStoreMode();
  const isRealtime = isRealtimeMode(storeMode);
  const confirmedStatuses = ["approved", "completed", "pending_payment"];
  const shouldDeductAtCreation =
    isRealtime &&
    confirmedStatuses.includes(status) &&
    body.items.length > 0;

  if (shouldDeductAtCreation) {
    const admin = createAdminClient();
    const deductedItems: { productId: string; qty: number }[] = [];
    for (const item of body.items) {
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
          { error: `המוצר "${item.title}" אינו זמין במלאי` },
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

  return NextResponse.json({ order: orderData as Order }, { status: 201 });
}
