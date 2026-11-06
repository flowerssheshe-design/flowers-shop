import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";
import { getServerSettings } from "@/lib/settings-server";
import { canManageTeam, hasRole, type StaffIdentity } from "@/lib/staff/access";
import { addDays, currentBusinessWeek, israelWeekday } from "@/lib/staff/week";
import { formatILS } from "@/lib/utils";
import { loadPaymentsView } from "@/lib/staff/owner/payments-server";
import { weekOrdersRange } from "@/lib/staff/work/ranges";
import { loadStallSplit } from "./stall-split-server";
import type { Task } from "./tasks";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * What is still open this week, worked out from the data (nothing is stored):
 * once a thing is done, its task disappears by itself. Only the current
 * business week counts: when the week closes, last week's tasks are gone and
 * the new week's tasks start.
 * Owners get the owner tasks; owners and shift managers get the shift and order tasks.
 */
export async function loadTasks(admin: Admin, who: StaffIdentity, now: Date = new Date()): Promise<Task[]> {
  const settings = await getServerSettings();
  const week = currentBusinessWeek(settings, now);
  const friday = addDays(week.weekStart, 5);
  const weekday = israelWeekday(now);
  const owner = canManageTeam(who);
  const ops = owner || hasRole(who, "ops_manager");
  const tasks: Task[] = [];
  const range = weekOrdersRange(week, settings);

  const [bwRes, budgetRes, stallsRes, shiftsRes, courierRes, allocRes, pendingRes] = await Promise.all([
    admin.from("business_weeks").select("supplier_ordered_at, closed_at").eq("week_start", week.weekStart).maybeSingle(),
    admin.from("weekly_budgets").select("amount").eq("week_start", week.weekStart).maybeSingle(),
    admin.from("stalls").select("id, name").eq("is_active", true).order("sort_order"),
    admin.from("shifts").select("stall_id, shift_type").eq("work_date", friday),
    admin.from("week_assignments").select("employee_id").eq("week_start", week.weekStart).eq("assignment", "courier").maybeSingle(),
    admin.from("weekly_pay_allocations").select("amount").eq("week_start", week.weekStart),
    admin
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending_payment")
      .neq("order_type", "stall")
      .gte("created_at", range.from)
      .lt("created_at", range.to),
  ]);

  // A week that was already closed has no tasks left.
  if ((bwRes.data as { closed_at?: string | null } | null)?.closed_at) return [];

  // ---------- Owner ----------
  if (owner) {
    const payments = await loadPaymentsView(admin, now).catch(() => null);
    if (payments) {
      // This week's pay only, from Friday (the stall day). Earlier weeks are on the pay page.
      const due = payments.weeks
        .filter((w) => w.isCurrent && weekday >= 5)
        .flatMap((w) => w.people.filter((p) => p.left > 0).map((p) => ({ ...p, week: w.weekStart })));
      if (due.length > 0) {
        const byPerson = new Map<string, { name: string; left: number }>();
        for (const p of due) {
          const cur = byPerson.get(p.employee_id) ?? { name: p.full_name, left: 0 };
          cur.left += p.left;
          byPerson.set(p.employee_id, cur);
        }
        tasks.push({
          id: "pay-employees",
          group: "owner",
          title: "לשלם לעובדים",
          detail: Array.from(byPerson.values())
            .map((p) => `${p.name}: ${formatILS(Math.round(p.left * 100) / 100)}`)
            .join(" · "),
          href: "/staff/payroll",
        });
      }
    }
    if (!budgetRes.error && !budgetRes.data) {
      tasks.push({ id: "set-budget", group: "owner", title: "לקבוע את תקציב השכר לשבוע", href: "/staff/stalls" });
    }
    const ordered = Boolean((bwRes.data as { supplier_ordered_at?: string | null } | null)?.supplier_ordered_at);
    if (!ordered) {
      tasks.push({
        id: "supplier-order",
        group: "owner",
        title: "לשלוח את ההזמנה לספק",
        detail: `עד ${week.supplierOrderAt.toLocaleString("he-IL", { timeZone: "Asia/Jerusalem", weekday: "long", hour: "2-digit", minute: "2-digit" })}`,
        href: "/staff/supplier",
      });
    }
  }

  // ---------- Shift manager (until the stall day is over) ----------
  if (ops && weekday <= 5) {
    const stalls = (stallsRes.data ?? []) as { id: string; name: string }[];
    const shifts = (shiftsRes.data ?? []) as { stall_id: string | null; shift_type: string }[];
    const empty = stalls.filter((s) => !shifts.some((sh) => sh.shift_type === "stall" && sh.stall_id === s.id));
    if (empty.length > 0) {
      tasks.push({ id: "staff-stalls", group: "ops", title: "לשבץ מוכרים לדוכנים", detail: empty.map((s) => s.name).join(", "), href: "/staff/stalls" });
    }
    if (!courierRes.error && !courierRes.data) {
      tasks.push({ id: "pick-courier", group: "ops", title: "לשבץ שליח לשבוע", href: "/staff/stalls" });
    }
    if (!shifts.some((sh) => sh.shift_type === "supply")) {
      tasks.push({ id: "supply-runner", group: "ops", title: "לשבץ מי מביא את הפרחים מהספק", href: "/staff/stalls" });
    }
    const budget = budgetRes.data ? Number((budgetRes.data as { amount: number | string }).amount) : null;
    const allocated = (allocRes.data ?? []).reduce((s, a) => s + (Number((a as { amount: number | string }).amount) || 0), 0);
    if (budget !== null && budget > 0 && allocated < budget) {
      tasks.push({
        id: "split-budget",
        group: "ops",
        title: "לחלק את תקציב השכר",
        detail: `חולק ${formatILS(allocated)} מתוך ${formatILS(budget)}`,
        href: "/staff/stalls",
      });
    }
    // The bouquet split matters once the website sells from stock, until Thursday evening's lock.
    try {
      const split = await loadStallSplit(admin, { autoLock: false, now });
      const configured = split.mode === "count" ? split.plan.size > 0 : Object.values(split.percents).some((v) => Number(v) > 0);
      if (!split.lockedAt && week.phase === "live" && !configured && split.stalls.length > 1) {
        tasks.push({
          id: "split-bouquets",
          group: "ops",
          title: "לחלק זרים בין הדוכנים",
          detail: "עוד לא נקבעה חלוקה (כרגע: חלוקה שווה). ננעל אוטומטית בחמישי ב-20:00.",
          href: "/staff/stalls",
        });
      }
    } catch {
      // before migration 043: no split task
    }
  }

  // ---------- Orders ----------
  if (ops && (pendingRes.count ?? 0) > 0) {
    tasks.push({
      id: "approve-payments",
      group: "orders",
      title: "לאשר תשלומים של הזמנות",
      detail: `${pendingRes.count} הזמנות מחכות לאישור תשלום (ביט / פייבוקס)`,
      href: "/staff/orders",
    });
  }

  return tasks;
}
