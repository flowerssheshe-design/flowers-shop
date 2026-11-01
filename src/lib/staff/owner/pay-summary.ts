// Pure: the pay page (/staff/payroll) — the response shapes shared by the API
// and the screen, and the "how much did we pay each person" summary.
// No server imports, so it is unit-tested directly.

import { addDays } from "@/lib/staff/week";
import type { PayType, WeekBudget } from "@/lib/staff/payroll";
import type { PayContext, PayRate } from "@/lib/staff/pay-context";
import {
  BUDGET_REMAINDER_ROLE,
  PAY_ENTRY_ROLE,
  budgetRemainderLine,
  round2,
  snapshotPayrollLines,
  withPayEntries,
  type EmployeeRow,
  type PayrollLine,
  type PayrollSnapshotRow,
} from "./week-math";

// ---------- API shapes ----------

export type PayrollEmployeeView = {
  id: string;
  full_name: string;
  role: string;
  roles: string[];
  work_types: string[];
  /** What applies this week. */
  current: {
    pay_type: PayType | null;
    pay_rate: number | null;
    responsibility_pay: number | null;
    /** The week this setting started; null when it comes from before the pay history. */
    since: string | null;
  };
  /** Newest first. */
  history: PayRate[];
  /** Holds ops_manager / marketing, so a weekly responsibility pay applies. */
  paysResponsibility: boolean;
  /** Works at a stall / as courier: paid from the weekly budget. */
  budgetPaid: boolean;
};

export type PayrollEntryView = {
  id: string;
  week_start: string;
  employee_id: string | null;
  employee_name: string | null;
  description: string;
  amount: number;
  source: "manual" | "migrated_expense";
  created_at: string | null;
};

export type PaySummaryPerson = {
  /** employee id, "entry:<description>" or "budget". */
  key: string;
  employee_id: string | null;
  full_name: string;
  kind: "employee" | "entry" | "budget";
  total: number;
  /** The part of total from one-off payments. */
  fromEntries: number;
  /** week_start → amount, for weeks with pay. */
  byWeek: Record<string, number>;
};

export type PaySummaryWeek = {
  weekStart: string;
  total: number;
  isCurrent: boolean;
};

export type PaySummary = {
  people: PaySummaryPerson[];
  /** The last weeks, newest first. */
  weeks: PaySummaryWeek[];
  grandTotal: number;
};

export type PayrollResponse = {
  ready: boolean;
  week: { weekStart: string; weekEnd: string };
  budget: { amount: number | null; allocated: number; closed: boolean };
  employees: PayrollEmployeeView[];
  entries: PayrollEntryView[];
  summary: PaySummary;
};

// ---------- Summary ----------

function personKey(line: PayrollLine): { key: string; kind: PaySummaryPerson["kind"] } {
  if (line.role === BUDGET_REMAINDER_ROLE) return { key: "budget", kind: "budget" };
  if (line.role === PAY_ENTRY_ROLE || !line.employee_id) return { key: `entry:${line.full_name}`, kind: "entry" };
  return { key: line.employee_id, kind: "employee" };
}

/**
 * Pay lines of every week up to the current one:
 * - the current week: `currentLines` (computed live with the pay history);
 * - other weeks: payroll_weeks snapshots, plus that week's one-off payments,
 *   plus the budget the ops manager did not split (still paid by the owners).
 */
export function payLinesByWeek(input: {
  currentWeekStart: string;
  currentLines: PayrollLine[];
  snapshots: PayrollSnapshotRow[];
  ctx: PayContext;
  budgets: Map<string, WeekBudget>;
  employees: EmployeeRow[];
}): Map<string, PayrollLine[]> {
  const weeks = new Set<string>();
  for (const s of input.snapshots) weeks.add(String(s.week_start).slice(0, 10));
  for (const e of input.ctx.entries) weeks.add(e.week_start);
  input.budgets.forEach((_b, w) => weeks.add(w));
  weeks.add(input.currentWeekStart);

  const out = new Map<string, PayrollLine[]>();
  weeks.forEach((w) => {
    if (w > input.currentWeekStart) return;
    if (w === input.currentWeekStart) {
      out.set(w, input.currentLines);
      return;
    }
    const snaps = input.snapshots.filter((s) => String(s.week_start).slice(0, 10) === w);
    const lines = withPayEntries(snapshotPayrollLines(snaps, input.employees), input.ctx, w, input.employees);
    const remainder = budgetRemainderLine(input.budgets.get(w));
    out.set(w, remainder ? [...lines, remainder] : lines);
  });
  return out;
}

export function buildPaySummary(input: {
  currentWeekStart: string;
  linesByWeek: Map<string, PayrollLine[]>;
  /** How many recent weeks to list (default 8). */
  recentWeeks?: number;
  /** "סופרים כסף מתאריך": the Sunday before which nothing is counted. */
  startWeek?: string | null;
}): PaySummary {
  const people = new Map<string, PaySummaryPerson>();
  const weekTotals = new Map<string, number>();
  input.linesByWeek.forEach((lines, week) => {
    if (input.startWeek && week < input.startWeek) return;
    for (const l of lines) {
      const amount = Number(l.amount) || 0;
      if (amount === 0) continue;
      const { key, kind } = personKey(l);
      const p = people.get(key) ?? {
        key,
        employee_id: kind === "employee" ? l.employee_id : null,
        full_name: l.full_name,
        kind,
        total: 0,
        fromEntries: 0,
        byWeek: {},
      };
      p.total = round2(p.total + amount);
      p.fromEntries = round2(p.fromEntries + (Number(l.fromEntries) || 0));
      p.byWeek[week] = round2((p.byWeek[week] ?? 0) + amount);
      people.set(key, p);
      weekTotals.set(week, round2((weekTotals.get(week) ?? 0) + amount));
    }
  });

  const count = input.recentWeeks ?? 8;
  const weeks: PaySummaryWeek[] = [];
  for (let i = 0; i < count; i++) {
    const w = addDays(input.currentWeekStart, -7 * i);
    if (input.startWeek && w < input.startWeek) break;
    weeks.push({ weekStart: w, total: weekTotals.get(w) ?? 0, isCurrent: i === 0 });
  }

  const order = { employee: 0, entry: 1, budget: 2 } as const;
  const list = Array.from(people.values()).sort(
    (a, b) => order[a.kind] - order[b.kind] || b.total - a.total || a.full_name.localeCompare(b.full_name, "he"),
  );
  return {
    people: list,
    weeks,
    grandTotal: round2(list.reduce((s, p) => s + p.total, 0)),
  };
}
