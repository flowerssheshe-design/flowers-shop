import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStaff } from "@/lib/staff/guard";
import { jsonError, parseBody, workContext } from "@/lib/staff/work/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const Body = z.object({
  product_id: z.string().uuid(),
  picked_up: z.boolean(),
});

/** Marks a supplier order line of the current week as picked up (or not). */
export async function PATCH(req: Request) {
  const guard = await requireStaff("supply");
  if (!guard.ok) return guard.response;

  const body = await parseBody(req, Body);
  if (!body.ok) return body.response;

  try {
    const { admin, week } = await workContext();
    const { data, error } = await admin
      .from("supplier_order_lines")
      .update({ picked_up: body.data.picked_up, updated_at: new Date().toISOString() })
      .eq("week_start", week.weekStart)
      .eq("product_id", body.data.product_id)
      .select("product_id, picked_up");
    if (error) return jsonError("השמירה נכשלה. נסו שוב.", 500);
    if (!data || data.length === 0) return jsonError("הזר לא נמצא בהזמנה מהספק של השבוע", 404);
    return NextResponse.json({ line: data[0] });
  } catch (e) {
    console.error("staff/supply/lines failed:", e);
    return jsonError("שגיאת שרת. נסו שוב.", 500);
  }
}
