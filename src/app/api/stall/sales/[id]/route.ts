import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SUPABASE_CONFIGURED } from "@/lib/constants";
import { requireAdminOrStall } from "@/lib/admin-auth";
import { isStallSaleOrder } from "@/lib/utils";
import type { CartItem, Order } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

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

export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const denied = requireAdminOrStall();
  if (denied) return denied;
  if (!SUPABASE_CONFIGURED) {
    return NextResponse.json(
      { error: "המערכת אינה מוגדרת כרגע. נסו שוב מאוחר יותר." },
      { status: 503 },
    );
  }
  const { id } = await ctx.params;
  try {
    const admin = createAdminClient();

    const { data: before, error: fetchErr } = await admin
      .from("orders")
      .select("id, items, inventory_deducted, notes, customer_name")
      .eq("id", id)
      .single();

    if (fetchErr || !before) {
      return NextResponse.json({ error: "המכירה לא נמצאה" }, { status: 404 });
    }

    // Safety: this endpoint only handles direct stall sales.
    if (!isStallSaleOrder(before as Order)) {
      return NextResponse.json(
        { error: "פעולה נתמכת רק למכירות דוכן ישירות" },
        { status: 403 },
      );
    }

    const items = (before.items ?? []) as CartItem[];

    // Restore stock if it was deducted when the sale was recorded.
    if (before.inventory_deducted === true && items.length > 0) {
      await restoreStockForOrder(admin, items);
    }

    const { error } = await admin.from("orders").delete().eq("id", id);
    if (error) {
      return NextResponse.json(
        { error: "מחיקת המכירה נכשלה" },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "שגיאת שרת" }, { status: 500 });
  }
}
