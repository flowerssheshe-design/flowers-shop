import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { SUPABASE_CONFIGURED } from "@/lib/constants";
import { requireAdmin } from "@/lib/admin-auth";
import type { CartItem, Order } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const PatchSchema = z.object({
  status: z.enum(["pending_payment", "approved", "completed", "cancelled"]).optional(),
  is_member: z.boolean().optional(),
  customer_name: z.string().min(2).max(100).optional(),
  customer_phone: z.string().min(8).max(30).optional(),
  delivery_address: z.string().max(300).nullish(),
  notes: z.string().max(500).nullish(),
});

async function restoreStockForOrder(
  admin: ReturnType<typeof createAdminClient>,
  items: { productId: string; qty: number }[],
) {
  for (const item of items ?? []) {
    await admin.rpc("increment_inventory", {
      p_product_id: item.productId,
      p_qty: item.qty,
    });
  }
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const denied = requireAdmin();
  if (denied) return denied;
  if (!SUPABASE_CONFIGURED) {
    return NextResponse.json({ error: "המערכת אינה מוגדרת" }, { status: 503 });
  }
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("orders")
      .select("*")
      .eq("id", id)
      .single();
    if (error || !data) {
      return NextResponse.json({ error: "הזמנה לא נמצאה" }, { status: 404 });
    }
    return NextResponse.json({ order: data as Order });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "שגיאת שרת" }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const denied = requireAdmin();
  if (denied) return denied;
  if (!SUPABASE_CONFIGURED) {
    return NextResponse.json({ error: "המערכת אינה מוגדרת" }, { status: 503 });
  }
  try {
    const admin = createAdminClient();

    const { data: before } = await admin
      .from("orders")
      .select("items, inventory_deducted")
      .eq("id", id)
      .single();
    const beforeItems = (before?.items ?? []) as CartItem[];
    if (before?.inventory_deducted && beforeItems.length > 0) {
      await restoreStockForOrder(admin, beforeItems);
    }

    const { error } = await admin.from("orders").delete().eq("id", id);
    if (error) {
      return NextResponse.json(
        { error: "מחיקת ההזמנה נכשלה" },
        { status: 500 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "שגיאת שרת" }, { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const denied = requireAdmin();
  if (denied) return denied;
  if (!SUPABASE_CONFIGURED) {
    return NextResponse.json({ error: "המערכת אינה מוגדרת" }, { status: 503 });
  }
  const body = await req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "נתונים לא תקינים" }, { status: 400 });
  }

  try {
    const admin = createAdminClient();

    if (parsed.data.status === "cancelled") {
      const { data: before } = await admin
        .from("orders")
        .select("items, inventory_deducted")
        .eq("id", id)
        .single();
      const beforeItems = (before?.items ?? []) as CartItem[];
      if (before?.inventory_deducted && beforeItems.length > 0) {
        await restoreStockForOrder(admin, beforeItems);
      }
    }

    const { data, error } = await admin
      .from("orders")
      .update(parsed.data)
      .eq("id", id)
      .select("*")
      .single();
    if (error || !data) {
      return NextResponse.json(
        { error: "עדכון ההזמנה נכשל" },
        { status: 500 },
      );
    }
    return NextResponse.json({ order: data as Order });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "שגיאת שרת" }, { status: 500 });
  }
}
