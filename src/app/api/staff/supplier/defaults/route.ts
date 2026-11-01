import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaff } from "@/lib/staff/guard";
import { badRequest, notConfigured, readJson, serverError } from "@/lib/staff/owner/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Schema = z.object({
  items: z
    .array(
      z.object({
        product_id: z.string().uuid(),
        default_order_qty: z.number().int().min(0).max(100000),
        // "extra" (pre-orders + this number) or "total" (this number in all).
        order_mode: z.enum(["extra", "total"]).optional(),
      }),
    )
    .min(1)
    .max(500),
});

/** Sets products.default_order_qty and order_mode (the admin product API does not accept these). */
export async function PATCH(req: Request) {
  const guard = await requireStaff(["supplier", "products"]);
  if (!guard.ok) return guard.response;
  const nc = notConfigured();
  if (nc) return nc;
  const parsed = Schema.safeParse(await readJson(req));
  if (!parsed.success) return badRequest("כמות ברירת המחדל חייבת להיות מספר שלם מ-0 ומעלה.");
  try {
    const admin = createAdminClient();
    for (const item of parsed.data.items) {
      const update: Record<string, unknown> = { default_order_qty: item.default_order_qty };
      if (item.order_mode) update.order_mode = item.order_mode;
      let { error } = await admin.from("products").update(update).eq("id", item.product_id);
      if (error && item.order_mode && /order_mode/.test(error.message)) {
        // Before migration 042: save the number only.
        ({ error } = await admin
          .from("products")
          .update({ default_order_qty: item.default_order_qty })
          .eq("id", item.product_id));
      }
      if (error) throw new Error(`products: ${error.message}`);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return serverError("supplier/defaults", e);
  }
}
