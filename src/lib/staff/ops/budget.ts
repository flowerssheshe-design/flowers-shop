// Weekly pay budget for stall sellers and the courier. The owners set the
// amount; the ops manager splits it (himself included). Pure rules, shared by
// the API and its tests.

import { BUDGET_WORK_TYPES } from "@/lib/staff/payroll";

export type BudgetCandidate = {
  id: string;
  role: string;
  work_types: string[];
  is_active: boolean;
};

/**
 * Who may receive money from the budget: the ops manager and anyone with stall
 * or courier work (whatever their other responsibilities). Never owners.
 */
export function canReceiveBudget(e: BudgetCandidate): boolean {
  if (!e.is_active || e.role === "owner") return false;
  if (e.role === "ops_manager") return true;
  return e.work_types.some((w) => BUDGET_WORK_TYPES.includes(w));
}

export type AllocationInput = { employee_id: string; amount: number };

export type AllocationCheck =
  | { ok: true; total: number }
  | { ok: false; error: string };

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Validates a full split of the week's budget before it is saved. */
export function checkAllocations(
  budget: number | null,
  allocations: AllocationInput[],
  employees: Map<string, BudgetCandidate>,
): AllocationCheck {
  if (budget === null) return { ok: false, error: "עוד לא נקבע תקציב לשבוע הזה. בקשו מהמנהלים לקבוע אותו." };
  const seen = new Set<string>();
  let total = 0;
  for (const a of allocations) {
    if (seen.has(a.employee_id)) return { ok: false, error: "אותו עובד מופיע פעמיים" };
    seen.add(a.employee_id);
    const emp = employees.get(a.employee_id);
    if (!emp || !canReceiveBudget(emp)) {
      return { ok: false, error: "אפשר לחלק רק למוכרי דוכן, לשליחים ולמנהל המשמרות" };
    }
    if (!Number.isFinite(a.amount) || a.amount < 0) return { ok: false, error: "סכום לא תקין" };
    total += a.amount;
  }
  total = round2(total);
  if (total > round2(budget)) {
    return { ok: false, error: `חילקתם ${total} ₪ אבל התקציב הוא ${round2(budget)} ₪` };
  }
  return { ok: true, total };
}
