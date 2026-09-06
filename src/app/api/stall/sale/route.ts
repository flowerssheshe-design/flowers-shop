import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { SUPABASE_CONFIGURED } from "@/lib/constants";
import { requireAdmin } from "@/lib/admin-auth";

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
      { error: "?????? ???? ?????? ????. ??? ??? ????? ????." },
      { status: 503 },
    );
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "??? ????? ???? ????" }, { status: 400 });
  }

  const parsed = SaleSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "????? ?????? ???? ??????", details: parsed.error.flatten() },
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
        { error: "???? ?? ????" },
        { status: 404 },
      );
    }

    // Atomic check-and-decrement; returns NULL when stock is insufficient.
    const { data: after, error: decErr } = await admin.rpc("decrement_inventory", {
      p_product_id: product_id,
      p_qty: qty,
    });
    if (decErr || after === null || after === undefined) {
      return NextResponse.json(
        { error: "??? ????? ???? ?????" },
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
        customer_name: "????? ?????",
        customer_phone: "",
        delivery_address: null,
        items: orderItems,
        total_amount: product.price_standard * qty,
        delivery_type: "pickup",
        delivery_fee: 0,
        is_member: false,
        notes: "????? ????? ?????",
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
    return NextResponse.json({ error: "????? ???" }, { status: 500 });
  }
}
