// Pure order helpers for the staff orders screen: allowed status actions,
// the stock plan (mirrors PATCH /api/admin/orders/[id]), normalisation and
// the weekly summary. No server-only imports (tested in vitest).

import type { OrderItem, OrderStatus, OrderType, OrdersSummary, StaffOrder } from "./types";

/** Columns the staff orders API reads. */
// "*": the later columns (pickup_stall_id, refund_due / refunded_at of migration 050)
// come along when they exist, and the page still works before the migration.
export const ORDER_COLUMNS = "*";

export type OrderAction = "approve" | "unapprove" | "complete" | "cancel";

export const ORDER_STATUSES: OrderStatus[] = ["pending_payment", "approved", "completed", "cancelled", "archived"];
export const ORDER_TYPES: OrderType[] = ["preorder", "live", "stall", "manual"];

const ACTION_TARGET: Record<OrderAction, OrderStatus> = {
  approve: "approved",
  // "ביטול אישור": an approval pressed by mistake goes back to waiting for payment.
  unapprove: "pending_payment",
  complete: "completed",
  cancel: "cancelled",
};

const ACTION_FROM: Record<OrderAction, OrderStatus[]> = {
  approve: ["pending_payment"],
  unapprove: ["approved"],
  complete: ["pending_payment", "approved"],
  cancel: ["pending_payment", "approved", "completed"],
};

export function targetStatus(action: OrderAction): OrderStatus {
  return ACTION_TARGET[action];
}

export function canApplyAction(action: OrderAction, from: string): boolean {
  return (ACTION_FROM[action] as string[]).includes(from);
}

export function actionsFor(status: string): OrderAction[] {
  return (Object.keys(ACTION_FROM) as OrderAction[]).filter((a) => canApplyAction(a, status));
}

/**
 * What to do with the global stock when an order's status changes.
 * Same rules as the admin PATCH route:
 * - deduct when moving to approved/completed in realtime (live) mode and stock wasn't deducted yet
 * - restore when moving to cancelled/pending_payment from a non-cancelled status and stock was deducted
 */
export function planStockChange(args: {
  oldStatus: string;
  newStatus: OrderStatus;
  wasDeducted: boolean;
  isRealtime: boolean;
  itemCount: number;
}): { deduct: boolean; restore: boolean } {
  const { oldStatus, newStatus, wasDeducted, isRealtime, itemCount } = args;
  const deduct =
    isRealtime && (newStatus === "approved" || newStatus === "completed") && !wasDeducted && itemCount > 0;
  const restore =
    oldStatus !== "cancelled" &&
    (newStatus === "cancelled" || newStatus === "pending_payment") &&
    wasDeducted &&
    itemCount > 0;
  return { deduct, restore };
}

export function normalizeItems(raw: unknown): OrderItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((it) => {
      const o = (it ?? {}) as Record<string, unknown>;
      return {
        productId: String(o.productId ?? ""),
        title: String(o.title ?? ""),
        qty: Number(o.qty ?? 0) || 0,
        price: Number(o.price ?? 0) || 0,
      };
    })
    .filter((it) => it.productId && it.qty > 0);
}

/** Delivery vs pickup — fulfillment_type wins, older orders only have delivery_type. */
export function isDelivery(order: Pick<StaffOrder, "fulfillment_type" | "delivery_type">): boolean {
  return (order.fulfillment_type ?? order.delivery_type) === "delivery";
}

export function normalizeOrder(row: Record<string, unknown>, names: Map<string, string>): StaffOrder {
  const approvedBy = row.approved_by ? String(row.approved_by) : null;
  const orderType = String(row.order_type ?? "preorder");
  return {
    id: String(row.id),
    created_at: String(row.created_at ?? ""),
    status: String(row.status ?? "pending_payment") as OrderStatus,
    order_type: ((ORDER_TYPES as string[]).includes(orderType) ? orderType : "preorder") as OrderType,
    customer_name: String(row.customer_name ?? ""),
    customer_phone: String(row.customer_phone ?? ""),
    delivery_address: (row.delivery_address as string | null) ?? null,
    delivery_type: row.delivery_type === "delivery" ? "delivery" : "pickup",
    fulfillment_type:
      row.fulfillment_type === "delivery" || row.fulfillment_type === "pickup" ? row.fulfillment_type : null,
    delivery_fee: Number(row.delivery_fee ?? 0) || 0,
    total_amount: Number(row.total_amount ?? 0) || 0,
    items: normalizeItems(row.items),
    notes: (row.notes as string | null) ?? null,
    greeting_note: (row.greeting_note as string | null) ?? null,
    payment_method:
      row.payment_method === "bit" || row.payment_method === "paybox" || row.payment_method === "cash"
        ? row.payment_method
        : null,
    is_member: row.is_member === true,
    stall_id: row.stall_id ? String(row.stall_id) : null,
    approved_by: approvedBy,
    approved_by_name: approvedBy ? names.get(approvedBy) ?? null : null,
    inventory_deducted: row.inventory_deducted === true,
    pickup_stall_id: row.pickup_stall_id ? String(row.pickup_stall_id) : null,
    refund_due: row.refund_due === null || row.refund_due === undefined ? null : Number(row.refund_due) || 0,
    refunded_at: (row.refunded_at as string | null | undefined) ?? null,
  };
}

export function summarizeOrders(orders: StaffOrder[]): OrdersSummary {
  const byStatus: Record<string, number> = {};
  const byType: Record<string, number> = {};
  let delivery = 0;
  let pickup = 0;
  for (const o of orders) {
    byStatus[o.status] = (byStatus[o.status] ?? 0) + 1;
    byType[o.order_type] = (byType[o.order_type] ?? 0) + 1;
    if (isDelivery(o)) delivery++;
    else pickup++;
  }
  return { total: orders.length, byStatus, byType, delivery, pickup };
}

export type OrderFilters = {
  status: string; // "all" or a status
  type: string; // "all" or an order type
  fulfillment: string; // "all" | "delivery" | "pickup"
  query: string;
};

export function filterOrders(orders: StaffOrder[], f: OrderFilters): StaffOrder[] {
  const q = f.query.trim().toLowerCase();
  const qDigits = q.replace(/\D/g, "");
  return orders.filter((o) => {
    if (f.status !== "all" && o.status !== f.status) return false;
    if (f.type !== "all" && o.order_type !== f.type) return false;
    if (f.fulfillment === "delivery" && !isDelivery(o)) return false;
    if (f.fulfillment === "pickup" && isDelivery(o)) return false;
    if (q) {
      const byName = o.customer_name.toLowerCase().includes(q);
      const byPhone = qDigits.length >= 3 && o.customer_phone.replace(/\D/g, "").includes(qDigits);
      if (!byName && !byPhone) return false;
    }
    return true;
  });
}

/**
 * A bouquet the supplier didn't have: the order gets another bouquet instead,
 * same quantity and same price (the customer already paid).
 */
export function swapItems(items: OrderItem[], fromId: string, to: { id: string; title: string }): OrderItem[] {
  return items.map((it) => (it.productId === fromId ? { ...it, productId: to.id, title: to.title } : it));
}

/**
 * A cancelled order that was paid by Bit / PayBox: the amount to send back by
 * hand. Cash, or not paid yet: nothing (null).
 */
export function refundDueFor(o: { status: string; payment_method: string | null; total_amount: number }): number | null {
  const paid = o.status === "approved" || o.status === "completed";
  if (!paid || (o.payment_method !== "bit" && o.payment_method !== "paybox")) return null;
  return o.total_amount > 0 ? Math.round(o.total_amount * 100) / 100 : null;
}

/**
 * Does the order hold its bouquets in the stock? A live order once deducted;
 * a pre-order once the supplier order went out (the stock was set without it).
 */
export function orderHoldsStock(o: { inventory_deducted: boolean; order_type: string }, supplierOrdered: boolean): boolean {
  return o.inventory_deducted || (o.order_type === "preorder" && supplierOrdered);
}
