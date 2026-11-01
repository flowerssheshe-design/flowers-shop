import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/staff/guard";
import { deliveriesAccess } from "@/lib/staff/work/deliveries-server";
import { jsonError, workContext } from "@/lib/staff/work/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * "נמסר": the order was delivered. Sets completed, delivered_by = me and
 * delivered_at = now. Stock is not touched (live orders took it when placed
 * or approved; pre-orders were bought from the supplier for the customer).
 */
export async function POST(_req: Request, ctx: { params: { id: string } }) {
  const guard = await requireStaff("deliveries");
  if (!guard.ok) return guard.response;
  const me = guard.session.employee;
  const id = ctx.params.id;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return jsonError("ההזמנה לא נמצאה", 404);

  try {
    const { admin, week, now } = await workContext();
    const access = await deliveriesAccess(admin, me, week.weekStart);
    if (!access.allowed) return jsonError("השבוע לא שובצת כשליח", 403);

    const { data, error } = await admin
      .from("orders")
      .update({ status: "completed", delivered_by: me.id, delivered_at: now.toISOString() })
      .eq("id", id)
      .eq("status", "approved")
      .eq("delivery_type", "delivery")
      .select("id, delivered_at");
    if (error) return jsonError("העדכון נכשל. נסו שוב.", 500);
    if (!data || data.length === 0) return jsonError("המשלוח כבר סומן כנמסר או שאינו מאושר", 409);
    return NextResponse.json({ ok: true, order: data[0] });
  } catch (e) {
    console.error("staff/deliveries deliver failed:", e);
    return jsonError("שגיאת שרת. נסו שוב.", 500);
  }
}
