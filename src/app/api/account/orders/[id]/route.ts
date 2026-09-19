import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SUPABASE_CONFIGURED } from "@/lib/constants";
import type { CartItem } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const PatchSchema = z.object({
  status: z
    .enum(["pending_payment", "approved", "completed", "cancelled"])
    .optional(),
  customer_name: z.string().min(2).max(100).optional(),
  customer_phone: z.string().min(8).max(30).optional(),
  delivery_address: z.string().max(300).nullish(),
  notes: z.string().max(500).nullish(),
});

async function restoreStockForOrder(
  items: { productId: string; qty: number }[],
) {
  const admin = createAdminClient();
  for (const item of items ?? []) {
    await admin.rpc("increment_inventory", {
      p_product_id: item.productId,
      p_qty: item.qty,
    });
  }
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  if (!SUPABASE_CONFIGURED) {
    return NextResponse.json(
      { error: "המערכת אינה מוגדרת" },
      { status: 503 },
    );
  }
  const { id } = await ctx.params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "יש להתחבר תחילה" },
      { status: 401 },
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "נתונים לא תקינים" }, { status: 400 });
  }

  const canEditStatuses: Array<string> = ["pending_payment", "approved"];
  if (
    parsed.data.status &&
    parsed.data.status !== "cancelled" &&
    !canEditStatuses.includes(parsed.data.status)
  ) {
    return NextResponse.json(
      { error: "לא ניתן לשנות סטטוס ההזמנה זו" },
      { status: 403 },
    );
  }

  try {
    const { data: existing, error: fetchErr } = await supabase
      .from("orders")
      .select("status, items, inventory_deducted")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (fetchErr || !existing) {
      return NextResponse.json(
        { error: "הזמנה לא נמצאה או שאינך בעל ההזמנה" },
        { status: 404 },
      );
    }

    const existingItems = (existing.items ?? []) as CartItem[];
    const isCancelling = parsed.data.status === "cancelled";
    const shouldRestore = isCancelling && existing.inventory_deducted === true;

    if (shouldRestore && existingItems.length > 0) {
      await restoreStockForOrder(existingItems);
    }

    const updatePayload: Record<string, unknown> = { ...parsed.data };
    if (shouldRestore) {
      updatePayload.inventory_deducted = false;
    }

    const { data, error } = await supabase
      .from("orders")
      .update(updatePayload)
      .eq("id", id)
      .eq("user_id", user.id)
      .select("*")
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: "עדכון ההזמנה נכשל או שאינך בעל ההזמנה" },
        { status: 404 },
      );
    }

    return NextResponse.json({ order: data });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "שגיאת שרת" }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  if (!SUPABASE_CONFIGURED) {
    return NextResponse.json(
      { error: "המערכת אינה מוגדרת" },
      { status: 503 },
    );
  }
  const { id } = await ctx.params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "יש להתחבר קודם" },
      { status: 401 },
    );
  }

  try {
    const { data: existing, error: fetchErr } = await supabase
      .from("orders")
      .select("status, items, inventory_deducted")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (fetchErr || !existing) {
      return NextResponse.json(
        { error: "הזמנה לא נמצאה או שאינך בעל ההזמנה" },
        { status: 404 },
      );
    }

    const existingItems = (existing.items ?? []) as CartItem[];
    if (existing.inventory_deducted === true && existingItems.length > 0) {
      await restoreStockForOrder(existingItems);
    }

    const { error } = await supabase
      .from("orders")
      .update({ status: "cancelled", inventory_deducted: false })
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) {
      return NextResponse.json(
        { error: "ביטול ההזמנה נכשל" },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "שגיאת שרת" }, { status: 500 });
  }
}
