import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/staff/guard";
import { israelDate } from "@/lib/staff/week";
import { qtyByProduct } from "@/lib/staff/work/sales";
import { checkStall, jsonError, NO_STALL_ACCESS, stallAdjust, workContext } from "@/lib/staff/work/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Undo a stall sale made today: cancel the order and put the flowers back in the stall's stock. */
export async function POST(_req: Request, ctx: { params: { id: string } }) {
  const guard = await requireStaff("stall");
  if (!guard.ok) return guard.response;
  const me = guard.session.employee;
  const id = ctx.params.id;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return jsonError("מכירה לא נמצאה", 404);

  try {
    const { admin, today } = await workContext();
    const { data: order, error } = await admin
      .from("orders")
      .select("id, order_type, stall_id, status, items, created_at")
      .eq("id", id)
      .maybeSingle();
    if (error) return jsonError("לא הצלחנו לטעון את המכירה", 500);
    if (!order || order.order_type !== "stall" || !order.stall_id) return jsonError("מכירה לא נמצאה", 404);
    if (order.status !== "completed") return jsonError("המכירה כבר בוטלה", 409);
    if (israelDate(new Date(order.created_at)) !== today) {
      return jsonError("אפשר לבטל רק מכירה של היום", 409);
    }
    const stall = await checkStall(admin, me, today, String(order.stall_id));
    if (!stall) return jsonError(NO_STALL_ACCESS, 403);

    // Flip the status first and only if it is still completed, so a double tap
    // cannot return the stock twice.
    const { data: updated, error: updErr } = await admin
      .from("orders")
      .update({ status: "cancelled" })
      .eq("id", id)
      .eq("status", "completed")
      .select("id");
    if (updErr) return jsonError("ביטול המכירה נכשל. נסו שוב.", 500);
    if (!updated || updated.length === 0) return jsonError("המכירה כבר בוטלה", 409);

    const items = (order.items ?? []) as { productId: string; qty: number }[];
    for (const [productId, qty] of Array.from(qtyByProduct(items).entries())) {
      try {
        await stallAdjust(admin, stall.id, productId, qty);
      } catch (e) {
        console.error("restoring stall stock failed:", { orderId: id, productId, qty, e });
      }
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("staff/stall cancel failed:", e);
    return jsonError("שגיאת שרת. נסו שוב.", 500);
  }
}
