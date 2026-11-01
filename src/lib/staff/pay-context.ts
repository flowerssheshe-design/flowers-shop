// Pay settings over time, and one-off pay entries. Shared contract between the
// payroll page (which writes them) and the money/dashboard/week-close/my-area
// calculations (which read them through `computePayroll(..., ctx)`).
//
// A pay change never rewrites the past: each change is stored with the week it
// starts from (`effective_week`, a Sunday), and a week is paid with the latest
// setting whose effective_week <= that week.

import type { PayType } from "@/lib/staff/payroll";

export type PayRate = {
  /** Sunday "YYYY-MM-DD" from which this setting applies. */
  effective_week: string;
  pay_type: PayType | null;
  pay_rate: number | null;
  /** Fixed amount per week for the ops_manager / marketing responsibility. */
  responsibility_pay: number | null;
};

/** A one-off payment (bonus, or an old salary moved here from expenses). */
export type PayEntry = {
  id: string;
  week_start: string;
  /** null for old salary rows that were not tied to a specific employee. */
  employee_id: string | null;
  description: string;
  amount: number;
};

export type PayContext = {
  /** employee_id → settings, sorted by effective_week ascending. */
  history: Map<string, PayRate[]>;
  entries: PayEntry[];
};

/** The first week of the seeded history (migration 039): "always". */
export const HISTORY_SEED_WEEK = "2000-01-02";

/** The first week paid by the new pay system; old salary expenses cover the weeks before. */
export const PAY_SYSTEM_START_WEEK = "2026-11-01";

export function emptyPayContext(): PayContext {
  return { history: new Map(), entries: [] };
}

/** The setting that applies in a week, or null when there is no history for the employee. */
export function rateForWeek(ctx: PayContext | undefined, employeeId: string, weekStart: string): PayRate | null {
  const list = ctx?.history.get(employeeId);
  if (!list || list.length === 0) return null;
  let found: PayRate | null = null;
  for (const r of list) {
    if (r.effective_week <= weekStart) found = r;
    else break;
  }
  return found;
}

/** True when the employee has any pay history at all. */
export function hasPayHistory(ctx: PayContext | undefined, employeeId: string): boolean {
  return (ctx?.history.get(employeeId)?.length ?? 0) > 0;
}

// ---------- Dates ----------

function parseDate(date: string): Date {
  return new Date(`${date.slice(0, 10)}T00:00:00Z`);
}

/** The Sunday ("YYYY-MM-DD") of the week a calendar date falls in. */
export function sundayOf(date: string): string {
  const d = parseDate(date);
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return d.toISOString().slice(0, 10);
}

export function isSunday(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && parseDate(date).getUTCDay() === 0;
}

// ---------- Building a context ----------

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Builds a context from raw DB rows (numeric columns may arrive as strings). */
export function buildPayContext(
  historyRows: {
    employee_id: string;
    effective_week: string;
    pay_type: string | null;
    pay_rate: number | string | null;
    responsibility_pay: number | string | null;
  }[],
  entryRows: {
    id: string;
    week_start: string;
    employee_id: string | null;
    description: string | null;
    amount: number | string | null;
  }[],
): PayContext {
  const history = new Map<string, PayRate[]>();
  for (const r of historyRows) {
    const list = history.get(r.employee_id) ?? [];
    list.push({
      effective_week: String(r.effective_week).slice(0, 10),
      pay_type: r.pay_type === "hourly" || r.pay_type === "per_shift" ? r.pay_type : null,
      pay_rate: num(r.pay_rate),
      responsibility_pay: num(r.responsibility_pay),
    });
    history.set(r.employee_id, list);
  }
  history.forEach((list) => list.sort((a, b) => a.effective_week.localeCompare(b.effective_week)));
  const entries: PayEntry[] = entryRows.map((e) => ({
    id: String(e.id),
    week_start: String(e.week_start).slice(0, 10),
    employee_id: e.employee_id ?? null,
    description: String(e.description ?? ""),
    amount: num(e.amount) ?? 0,
  }));
  return { history, entries };
}

// ---------- Entries ----------

export function entriesForWeek(ctx: PayContext | undefined, weekStart: string): PayEntry[] {
  return (ctx?.entries ?? []).filter((e) => e.week_start === weekStart);
}

/** Total of the employee's one-off payments in the given weeks. */
export function entriesTotal(ctx: PayContext | undefined, employeeId: string, weekStarts: Iterable<string>): number {
  const weeks = new Set(weekStarts);
  let sum = 0;
  for (const e of ctx?.entries ?? []) {
    if (e.employee_id === employeeId && weeks.has(e.week_start)) sum += Number(e.amount) || 0;
  }
  return Math.round(sum * 100) / 100;
}

// ---------- TS twin of the SQL data move in migration 039 ----------

export type SalaryExpense = {
  description: string;
  amount: number | string;
  expense_type: "one_time" | "recurring" | string;
  expense_date: string;
  is_active?: boolean | null;
};

/**
 * Which payroll_entries migration 039 creates from old 'salaries' expenses:
 * a one-time row → its week; an active recurring row → every week from its
 * start week up to (not including) `cutoffWeek`.
 */
export function migratedSalaryEntries(
  expenses: SalaryExpense[],
  cutoffWeek: string = PAY_SYSTEM_START_WEEK,
): { week_start: string; description: string; amount: number }[] {
  const out: { week_start: string; description: string; amount: number }[] = [];
  for (const e of expenses) {
    const start = sundayOf(e.expense_date);
    const amount = Number(e.amount) || 0;
    if (e.expense_type === "one_time") {
      out.push({ week_start: start, description: e.description, amount });
    } else if (e.expense_type === "recurring" && e.is_active !== false) {
      for (let w = start; w < cutoffWeek; w = addWeek(w)) out.push({ week_start: w, description: e.description, amount });
    }
  }
  return out.sort((a, b) => a.week_start.localeCompare(b.week_start) || a.description.localeCompare(b.description, "he"));
}

function addWeek(date: string): string {
  const d = parseDate(date);
  d.setUTCDate(d.getUTCDate() + 7);
  return d.toISOString().slice(0, 10);
}
