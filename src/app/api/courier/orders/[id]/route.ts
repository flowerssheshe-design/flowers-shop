import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cookies } from "next/headers";
import { getStoreMode, isRealtimeMode } from "@/lib/storeMode";
import type { CartItem, Order } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type RouteParams = { params: Promise<{ id: string }> };

export async function PATCH(
  _req: Request,
  ctx: RouteParams,
) {
  const store = cookies();
  if (store.get("flowers_courier_auth")?.value !== "1") {
    return NextResponse.json(
      { error: "נדרש זיהוי שליח" },
      { status: 401 },
    );
  }

  const { id } = await ctx.params;

  try {
    const admin = createAdminClient();

    // Fetch current order state to check if stock was already deducted
    const { data: before, error: fetchErr } = await admin
      .from("orders")
      .select("status, items, inventory_deducted")
      .eq("id", id)
      .single();

    if (fetchErr || !before) {
      return NextResponse.json(
        { error: "הזמנה לא נמצאה" },
        { status: 404 },
      );
    }

    const existingItems = (before.items ?? []) as CartItem[];
    const wasDeducted = before.inventory_deducted === true;

    // If stock was not yet deducted, deduct it now upon completion (realtime mode only)
    const storeMode = await getStoreMode();
    if (!wasDeducted && isRealtimeMode(storeMode) && existingItems.length > 0) {
      const deductedItems: { productId: string; qty: number }[] = [];
      for (const item of existingItems) {
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
          return NextResponse.json(
            { error: `המוצר "${item.title}" אזל מהמלאי` },
            { status: 409 },
          );
        }
        deductedItems.push({ productId: item.productId, qty: item.qty });
      }
    }

    const { data, error } = await admin
      .from("orders")
      .update({
        status: "completed",
        inventory_deducted: wasDeducted || isRealtimeMode(storeMode),
      })
      .eq("id", id)
      .select("*")
      .single();
    if (error || !data) {
      return NextResponse.json(
        { error: "הזמנה לא נמצאה" },
        { status: 500 },
      );
    }
    return NextResponse.json({ order: data as Order });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "שגיאת שרת" }, { status: 500 });
  }
}
