import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SUPABASE_CONFIGURED, CLUB_DISCOUNT_THRESHOLD } from "@/lib/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

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

  // Guest or logged-in checkout. user_id is null for guests; orders are
  // tracked by customer_name + customer_phone instead.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Verify member status server-side from orders count (>= 3 → qualifies)
  // only for logged-in users. Guests never qualify (no history).
  let qualifies = false;
  if (user) {
    try {
      const admin = createAdminClient();
      const { data: count } = await admin.rpc("user_completed_order_count", {
        uid: user.id,
      });
      qualifies = Number(count ?? 0) >= CLUB_DISCOUNT_THRESHOLD;
    } catch {
      qualifies = false;
    }
  }

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("orders")
      .insert({
        user_id: user?.id ?? null,
        customer_name: body.customer_name,
        customer_phone: body.customer_phone,
        delivery_address: body.delivery_address ?? null,
        items: body.items,
        total_amount: body.total_amount,
        delivery_type: body.delivery_type,
        delivery_fee: body.delivery_fee,
        is_member: qualifies,
        notes: body.notes ?? null,
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

    // Best-effort: update profile with latest contact info if logged in.
    if (user) {
      try {
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

    return NextResponse.json({ order: data }, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "שגיאת שרת פנימית" },
      { status: 500 },
    );
  }
}