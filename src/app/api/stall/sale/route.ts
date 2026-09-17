import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { SUPABASE_CONFIGURED } from "@/lib/constants";
import { requireAdmin } from "@/lib/admin-auth";
import { getStoreMode, isRealtimeMode } from "@/lib/storeMode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const SaleSchema = z.object({
  product_id: z.string().uuid(),
  qty: z.number().int().min(1),
  payment_method: z.enum(["cash", "bit"]),
});

export async function POST(req: Request) {
  const denied = requireAdmin();
  if (denied) return denied;
  if (!SUPABASE_CONFIGURED) {
    return NextResponse.json(
      { error: "המערכת אינה מוגדרת כרגע. נסו שוב מאוחר יותר." },
      { status: 503 },
    );
  }

  const storeMode = await getStoreMode();
  if (!isRealtimeMode(storeMode)) {
    return NextResponse.json(
      { error: "מכירת דוכן זמינה רק במצב מכירה חיה (Real-Time Mode)" },
      { status: 400 },
    );
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "גוף הבקשה אינו תקין" }, { status: 400 });
  }

  const parsed = SaleSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "נתוני המכירה אינם תקינים", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { product_id, qty, payment_method } = parsed.data;

  try {
    const admin = createAdminClient();

    const { data: product, error: productError } = await admin
      .from("products")
      .select("*")
      .eq("id", product_id)
      .single();

    if (productError || !product) {
      return NextResponse.json(
        { error: "מוצר לא נמצא" },
        { status: 404 },
      );
    }

    // Check current stock for better error messages
    const { data: currentStock, error: stockErr } = await admin
      .from("inventory")
      .select("live_stock_count")
      .eq("product_id", product_id)
      .single();

    if (stockErr || currentStock === null) {
      return NextResponse.json(
        { error: "מוצר לא נמצא במלאי" },
        { status: 404 },
      );
    }

    const available = currentStock.live_stock_count ?? 0;

    if (available <= 0) {
      return NextResponse.json(
        { error: "המלאי נגמר" },
        { status: 409 },
      );
    }

    if (qty > available) {
      return NextResponse.json(
        { error: `הכמות המבוקשת (${qty}) גדולה מהמלאי הזמין (${available})` },
        { status: 409 },
      );
    }

    // Atomic check-and-decrement; returns NULL when stock is insufficient.
    const { data: after, error: decErr } = await admin.rpc("decrement_inventory", {
      p_product_id: product_id,
      p_qty: qty,
    });
    if (decErr || after === null || after === undefined) {
      return NextResponse.json(
        { error: "אין מספיק מלאי לביצוע המכירה" },
        { status: 409 },
      );
    }

    const orderItems = [
      {
        productId: product.id,
        title: product.title,
        qty,
        price: product.price_standard,
        image_url: product.image_url,
      },
    ];

    const { data: order, error: orderError } = await admin
      .from("orders")
      .insert({
        customer_name: "לקוח דוכן",
        customer_phone: "",
        delivery_address: null,
        items: orderItems,
        total_amount: product.price_standard * qty,
        delivery_type: "pickup",
        delivery_fee: 0,
        is_member: false,
        notes: "מכירה בדוכן",
        status: "approved",
        fulfillment_type: "pickup",
        payment_method,
        inventory_deducted: true,
      })
      .select("*")
      .single();

    if (orderError || !order) {
      return NextResponse.json(
        { error: "שגיאה בשמירת ההזמנה" },
        { status: 500 },
      );
    }

    return NextResponse.json({ order }, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "שגיאת שרת" }, { status: 500 });
  }
}
