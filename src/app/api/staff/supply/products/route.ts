import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStaff } from "@/lib/staff/guard";
import { jsonError, parseBody, workContext } from "@/lib/staff/work/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const Body = z.object({
  title: z.string().trim().min(2, "כתבו שם לזר").max(200),
  description: z.string().trim().max(2000).optional(),
  price_standard: z.number().min(0).max(100_000),
  cost_price: z.number().min(0).max(100_000),
  /** How many came this week (added to the stock). */
  received_qty: z.number().int().min(0).max(10_000).optional(),
});

/**
 * The supply runner adds a new bouquet that came from the supplier. It sells
 * at the stalls right away but stays off the website until a manager turns it
 * on (and adds a picture) on the products page.
 */
export async function POST(req: Request) {
  const guard = await requireStaff("supply");
  if (!guard.ok) return guard.response;
  const body = await parseBody(req, Body);
  if (!body.ok) return body.response;
  const v = body.data;

  try {
    const { admin, week } = await workContext();
    const { data: last } = await admin.from("products").select("sort_order").order("sort_order", { ascending: false }).limit(1);
    const sort = (Number(last?.[0]?.sort_order) || 0) + 1;
    const { data: product, error } = await admin
      .from("products")
      .insert({
        title: v.title,
        description: v.description || null,
        price_standard: v.price_standard,
        price_member: v.price_standard,
        cost_price: v.cost_price,
        image_url: null,
        image_urls: [],
        is_active: true,
        show_on_site: false,
        sort_order: sort,
      })
      .select("id, title")
      .single();
    if (error || !product) {
      const missing = /show_on_site/.test(error?.message ?? "");
      return jsonError(
        missing ? "צריך להריץ את מיגרציה 046 לפני שמוסיפים זרים מכאן." : "יצירת הזר נכשלה. נסו שוב.",
        missing ? 409 : 500,
      );
    }

    const qty = v.received_qty ?? 0;
    if (qty > 0) {
      await admin.rpc("increment_inventory", { p_product_id: product.id, p_qty: qty });
      await admin.from("supplier_order_lines").upsert(
        {
          week_start: week.weekStart,
          product_id: product.id,
          preorder_qty: 0,
          extra_qty: 0,
          final_qty: 0,
          received_qty: qty,
          unit_cost: v.cost_price,
          picked_up: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "week_start,product_id" },
      );
    }
    return NextResponse.json({ product }, { status: 201 });
  } catch (e) {
    console.error("staff/supply/products failed:", e);
    return jsonError("שגיאת שרת. נסו שוב.", 500);
  }
}
