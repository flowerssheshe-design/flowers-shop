import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/staff/guard";
import { jsonError, workContext } from "@/lib/staff/work/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * "נמסר ללקוח": an approved pickup order was handed over at the stall.
 * Stock is not touched here: live orders took it when they were placed or
 * approved, and pre-orders were ordered from the supplier for the customer.
 */
export async function POST(_req: Request, ctx: { params: { id: string } }) {
  const guard = await requireStaff("stall");
  if (!guard.ok) return guard.response;
  const id = ctx.params.id;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return jsonError("ההזמנה לא נמצאה", 404);

  try {
    const { admin } = await workContext();
    const { data, error } = await admin
      .from("orders")
      .update({ status: "completed" })
      .eq("id", id)
      .eq("status", "approved")
      .eq("delivery_type", "pickup")
      .neq("order_type", "stall")
      .select("id");
    if (error) return jsonError("העדכון נכשל. נסו שוב.", 500);
    if (!data || data.length === 0) return jsonError("ההזמנה כבר נמסרה או שאינה מאושרת", 409);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("staff/stall/pickup failed:", e);
    return jsonError("שגיאת שרת. נסו שוב.", 500);
  }
}
