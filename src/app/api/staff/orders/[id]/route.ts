import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaff } from "@/lib/staff/guard";
import { canManageTeam } from "@/lib/staff/access";
import { getStoreMode, isRealtimeMode } from "@/lib/storeMode";
import { T } from "@/lib/staff/labels";
import { OrderActionSchema } from "@/lib/staff/ops/schemas";
import { ORDER_COLUMNS, canApplyAction, normalizeItems, normalizeOrder, planStockChange, targetStatus } from "@/lib/staff/ops/orders";
import { deductStockForItems, restoreStockForItems } from "@/lib/staff/ops/order-stock";
import { UUID_RE, jsonError, notConfigured, parseBody, serverError } from "@/lib/staff/ops/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Status actions only: approve payment, mark completed, cancel.
 * Prices and items are never editable here. Stock moves follow the admin
 * orders route (see planStockChange).
 */
export async function PATCH(req: Request, ctx: { params: { id: string } }) {
  const guard = await requireStaff("orders");
  if (!guard.ok) return guard.response;
  const nc = notConfigured();
  if (nc) return nc;
  const id = ctx.params.id;
  if (!UUID_RE.test(id)) return jsonError("ההזמנה לא נמצאה", 404);
  const body = await parseBody(req, OrderActionSchema);
  if (!body.ok) return body.response;
  const { action } = body.data;
  const me = guard.session.employee;

  try {
    const admin = createAdminClient();
    const { data: before, error: fetchErr } = await admin
      .from("orders")
      .select("status, items, inventory_deducted, approved_by")
      .eq("id", id)
      .maybeSingle();
    if (fetchErr) return serverError(fetchErr, "order PATCH load");
    if (!before) return jsonError("ההזמנה לא נמצאה", 404);

    const oldStatus = String(before.status);
    if (!canApplyAction(action, oldStatus)) {
      const current = T.status[oldStatus] ?? oldStatus;
      return jsonError(`אי אפשר לבצע את הפעולה הזאת על הזמנה במצב "${current}". רעננו את הרשימה.`, 409);
    }

    const newStatus = targetStatus(action);
    const items = normalizeItems(before.items);
    const wasDeducted = before.inventory_deducted === true;
    const isRealtime = isRealtimeMode(await getStoreMode());
    const plan = planStockChange({ oldStatus, newStatus, wasDeducted, isRealtime, itemCount: items.length });

    const update: Record<string, unknown> = { status: newStatus };
    if (newStatus === "approved" || (newStatus === "completed" && !before.approved_by)) {
      update.approved_by = me.id;
    }

    if (plan.deduct) {
      const result = await deductStockForItems(admin, items);
      if (!result.success) return jsonError(`המוצר "${result.title}" אזל מהמלאי`, 409);
      update.inventory_deducted = true;
    }
    if (plan.restore) update.inventory_deducted = false;

    // Only update if nobody changed the status meanwhile.
    const { data, error } = await admin
      .from("orders")
      .update(update)
      .eq("id", id)
      .eq("status", oldStatus)
      .select(ORDER_COLUMNS)
      .maybeSingle();
    if (error || !data) {
      if (plan.deduct) await restoreStockForItems(admin, items);
      if (error) return serverError(error, "order PATCH update");
      return jsonError("ההזמנה השתנתה בינתיים. רעננו ונסו שוב.", 409);
    }

    // The status change won, so this request is the one that gives the stock back.
    if (plan.restore) await restoreStockForItems(admin, items);

    const names = new Map<string, string>();
    const approver = (data as Record<string, unknown>).approved_by;
    if (approver === me.id) names.set(me.id, me.full_name);
    else if (approver) {
      const { data: emp } = await admin.from("employees").select("id, full_name").eq("id", String(approver)).maybeSingle();
      if (emp) names.set(String(emp.id), String(emp.full_name));
    }
    return NextResponse.json({ order: normalizeOrder(data as Record<string, unknown>, names) });
  } catch (e) {
    return serverError(e, "order PATCH");
  }
}

/**
 * Delete an order completely (main managers only), e.g. a test order or a
 * duplicate. Stock taken for it goes back. A stall sale's stall stock is not
 * touched here: undo it from the stall screen instead.
 */
export async function DELETE(_req: Request, ctx: { params: { id: string } }) {
  const guard = await requireStaff("orders", canManageTeam);
  if (!guard.ok) return guard.response;
  const nc = notConfigured();
  if (nc) return nc;
  const id = ctx.params.id;
  if (!UUID_RE.test(id)) return jsonError("ההזמנה לא נמצאה", 404);

  try {
    const admin = createAdminClient();
    const { data: order, error: fetchErr } = await admin
      .from("orders")
      .select("id, items, inventory_deducted, order_type")
      .eq("id", id)
      .maybeSingle();
    if (fetchErr) return serverError(fetchErr, "order DELETE load");
    if (!order) return jsonError("ההזמנה לא נמצאה", 404);
    if (order.order_type === "stall") {
      return jsonError("מכירה בדוכן מבטלים ממסך הדוכן, כדי שהזרים יחזרו למלאי של הדוכן.", 409);
    }

    const { error } = await admin.from("orders").delete().eq("id", id);
    if (error) return serverError(error, "order DELETE");
    if (order.inventory_deducted) await restoreStockForItems(admin, normalizeItems(order.items));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return serverError(e, "order DELETE");
  }
}
