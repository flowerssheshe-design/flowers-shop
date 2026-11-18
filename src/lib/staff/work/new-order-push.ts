import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToEmployees } from "@/lib/staff/marketing/push";
import { israelDate, israelWeekday } from "@/lib/staff/week";
import { newOrderPushText, type NewOrderInfo } from "./new-order-text";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * A new website order whose bouquets come from a stall (pickup there, or the
 * courier takes them from there): on Friday, while that stall is open, the
 * sellers working there today get a phone notification to set it aside.
 */
export async function notifyStallOfNewOrder(admin: Admin, order: NewOrderInfo & { stallId: string | null }, now: Date = new Date()) {
  if (!order.stallId || israelWeekday(now) !== 5) return;
  const { data: stall } = await admin.from("stalls").select("id, name, is_open").eq("id", order.stallId).maybeSingle();
  const st = stall as { id: string; name: string; is_open: boolean | null } | null;
  if (!st?.is_open) return;
  const { data: shifts } = await admin
    .from("shifts")
    .select("employee_id")
    .eq("work_date", israelDate(now))
    .eq("stall_id", st.id)
    .eq("shift_type", "stall");
  const ids = Array.from(new Set(((shifts ?? []) as { employee_id: string }[]).map((s) => String(s.employee_id))));
  await sendPushToEmployees(admin, ids, { ...newOrderPushText(order, st.name), url: "/staff/stall" });
}
