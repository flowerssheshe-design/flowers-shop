import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/staff/guard";
import { weekOrdersRange } from "@/lib/staff/work/ranges";
import { deliveriesAccess } from "@/lib/staff/work/deliveries-server";
import { jsonError, workContext } from "@/lib/staff/work/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const FIELDS =
  "id, created_at, customer_name, customer_phone, delivery_address, items, total_amount, delivery_fee, payment_method, notes, greeting_note, status, order_type, delivered_at, delivered_by";

/**
 * The week's delivery orders for the courier of the week (and owner / ops):
 * approved ones still to deliver (including leftovers from earlier weeks),
 * and the ones delivered this week.
 */
export async function GET() {
  const guard = await requireStaff("deliveries");
  if (!guard.ok) return guard.response;
  const me = guard.session.employee;

  try {
    const { admin, settings, week } = await workContext();
    const access = await deliveriesAccess(admin, me, week.weekStart);
    const base = {
      week: { start: week.weekStart, end: week.weekEnd },
      courier: { id: access.courierId, name: access.courierName },
    };
    if (!access.allowed) return NextResponse.json({ ...base, allowed: false });

    const range = weekOrdersRange(week, settings);
    const [pendingRes, doneRes] = await Promise.all([
      admin
        .from("orders")
        .select(FIELDS)
        .eq("status", "approved")
        .eq("delivery_type", "delivery")
        .lt("created_at", range.to)
        .order("created_at", { ascending: true }),
      admin
        .from("orders")
        .select(FIELDS)
        .eq("status", "completed")
        .eq("delivery_type", "delivery")
        .gte("delivered_at", range.from)
        .lt("delivered_at", range.to)
        .order("delivered_at", { ascending: false }),
    ]);
    if (pendingRes.error || doneRes.error) {
      console.error("staff/deliveries GET:", pendingRes.error ?? doneRes.error);
      return jsonError("לא הצלחנו לטעון את המשלוחים. נסו לרענן.", 500);
    }

    const pending = (pendingRes.data ?? []).map((o) => ({
      ...o,
      from_earlier_week: String(o.created_at) < range.from,
    }));
    return NextResponse.json({
      ...base,
      allowed: true,
      pending,
      delivered: doneRes.data ?? [],
    });
  } catch (e) {
    console.error("staff/deliveries GET failed:", e);
    return jsonError("שגיאת שרת. נסו שוב.", 500);
  }
}
