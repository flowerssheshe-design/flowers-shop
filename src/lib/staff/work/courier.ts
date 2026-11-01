// Who may use the deliveries screen: the courier of the current week, and
// owners / ops managers (who see everything).

export type CourierWho = { id: string; role: string };

export type WeekAssignmentRow = {
  week_start: string;
  assignment: string;
  employee_id: string;
};

export function weekCourierId(rows: WeekAssignmentRow[], weekStart: string): string | null {
  const row = rows.find((r) => r.week_start === weekStart && r.assignment === "courier");
  return row ? row.employee_id : null;
}

export function isWeekCourier(who: CourierWho, rows: WeekAssignmentRow[], weekStart: string): boolean {
  return weekCourierId(rows, weekStart) === who.id;
}

export function canSeeDeliveries(who: CourierWho, rows: WeekAssignmentRow[], weekStart: string): boolean {
  if (who.role === "owner" || who.role === "ops_manager") return true;
  return isWeekCourier(who, rows, weekStart);
}

/** How the courier should treat payment for an approved delivery order. */
export function paymentStatus(order: {
  payment_method?: string | null;
  total_amount: number | string;
}): { kind: "collect"; amount: number } | { kind: "paid"; method: string } | { kind: "unknown" } {
  const amount = Number(order.total_amount) || 0;
  if (order.payment_method === "cash") return { kind: "collect", amount };
  if (order.payment_method === "bit" || order.payment_method === "paybox") {
    return { kind: "paid", method: order.payment_method };
  }
  return { kind: "unknown" };
}
