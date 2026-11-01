// "סופרים כסף מתאריך": the money, expenses and pay pages count only from this
// date, so the owners can start the numbers fresh without deleting orders
// (customers keep their order history and regular-customer discount).

import { sundayOf } from "@/lib/staff/pay-context";

/** The start date ("YYYY-MM-DD") or null when counting from the beginning. */
export function moneyStartDate(settings: { money_start_date?: string | null }): string | null {
  const v = (settings.money_start_date ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

/** The Sunday of the start date's business week, or null. */
export function moneyStartWeek(settings: { money_start_date?: string | null }): string | null {
  const d = moneyStartDate(settings);
  return d ? sundayOf(d) : null;
}

/** The later of two "YYYY-MM-DD" dates (either may be null). */
export function laterDate(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}
