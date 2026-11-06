// Pure: "how much do I owe each employee, and what was really paid".
// Due amounts come from the weekly pay lines (pay-summary.payLinesByWeek);
// paid amounts are the "שולם" rows (payroll_payments). No server imports.

import { BUDGET_REMAINDER_ROLE, PAY_ENTRY_ROLE, round2, type PayrollLine } from "./week-math";

export type PaymentRow = {
  id: string;
  week_start: string;
  employee_id: string;
  amount: number;
  note: string | null;
  paid_at: string;
};

export type EntryRow = { id: string; week_start: string; employee_id: string | null; description: string; amount: number };

export type DuePart = {
  label: string;
  amount: number;
  /** "base", "responsibility" or "entry:<id>": what ✓/✗ refers to. */
  key: string;
  /** ✗: not paid this week, so not counted in `due`. */
  excluded: boolean;
  entryId?: string;
};

/** "week|employee|part" for a skipped (✗) part. */
export function exclusionKey(week: string, employeeId: string, part: string): string {
  return `${week}|${employeeId}|${part}`;
}

export type DuePerson = {
  employee_id: string;
  full_name: string;
  /** What the week's pay comes to (pay + one-off items). */
  due: number;
  paid: number;
  /** due − paid, never below 0. */
  left: number;
  parts: DuePart[];
  payments: PaymentRow[];
};

export type DueWeek = { weekStart: string; isCurrent: boolean; total: number; left: number; people: DuePerson[] };

export type PaidSummaryRow = {
  employee_id: string;
  full_name: string;
  paidLast30: number;
  paidAll: number;
  /** Everything due so far (from the money start week) minus everything paid. */
  owed: number;
};

export type PaymentsView = {
  weeks: DueWeek[];
  summary: PaidSummaryRow[];
  totals: { paidLast30: number; paidAll: number; owed: number };
};

const DAY_MS = 24 * 60 * 60 * 1000;

function baseLabel(l: PayrollLine): string {
  const bits: string[] = [];
  if (l.shifts > 0) bits.push(`${l.shifts} משמרות`);
  if (l.hours > 0) bits.push(`${l.hours} שעות`);
  return bits.length ? `שכר השבוע (${bits.join(", ")})` : "שכר השבוע";
}

/**
 * Builds the payments screen: per week (newest first, only weeks with pay or
 * payments) who is owed what, with the parts it is made of, and per employee
 * how much was paid in the last 30 days, ever, and what is still owed.
 */
export function buildPaymentsView(input: {
  currentWeekStart: string;
  linesByWeek: Map<string, PayrollLine[]>;
  entries: EntryRow[];
  payments: PaymentRow[];
  names: Map<string, string>;
  /** Skipped parts (exclusionKey). */
  exclusions?: Set<string>;
  now: Date;
  /** Weeks before this Sunday are not counted ("סופרים כסף מתאריך"). */
  startWeek?: string | null;
  /** How many weeks to list (default 8). */
  recentWeeks?: number;
}): PaymentsView {
  const counted = (w: string) => !input.startWeek || w >= input.startWeek;
  const weeks = new Set<string>();
  input.linesByWeek.forEach((_l, w) => weeks.add(w));
  for (const p of input.payments) weeks.add(p.week_start);

  const dueAll = new Map<string, number>();
  const nameOf = (id: string, fallback?: string) => input.names.get(id) ?? fallback ?? "עובד";
  const skipped = input.exclusions ?? new Set<string>();
  const out: DueWeek[] = [];

  Array.from(weeks)
    .filter((w) => w <= input.currentWeekStart && counted(w))
    .sort((a, b) => b.localeCompare(a))
    .forEach((w) => {
      const people = new Map<string, DuePerson>();
      const get = (id: string, name?: string) => {
        let p = people.get(id);
        if (!p) {
          p = { employee_id: id, full_name: nameOf(id, name), due: 0, paid: 0, left: 0, parts: [], payments: [] };
          people.set(id, p);
        }
        return p;
      };
      for (const l of input.linesByWeek.get(w) ?? []) {
        if (!l.employee_id || l.role === BUDGET_REMAINDER_ROLE || l.role === PAY_ENTRY_ROLE) continue;
        const p = get(l.employee_id, l.full_name);
        const entries = Number(l.fromEntries) || 0;
        const resp = Number(l.fromResponsibility) || 0;
        const base = round2((Number(l.amount) || 0) - entries - resp);
        const add = (key: string, label: string, amount: number) => {
          const excluded = skipped.has(exclusionKey(w, l.employee_id, key));
          p.parts.push({ label, amount, key, excluded });
          if (!excluded) p.due = round2(p.due + amount);
        };
        if (base > 0) add("base", baseLabel(l), base);
        if (resp > 0) add("responsibility", "תוספת אחריות", round2(resp));
      }
      // One-off items are listed one by one (they may be added to closed weeks too).
      for (const e of input.entries) {
        if (e.week_start !== w || !e.employee_id) continue;
        const p = get(e.employee_id);
        const key = `entry:${e.id}`;
        const excluded = skipped.has(exclusionKey(w, e.employee_id, key));
        p.parts.push({ label: e.description, amount: round2(e.amount), key, excluded, entryId: e.id });
        if (!excluded) p.due = round2(p.due + e.amount);
      }
      for (const pay of input.payments) {
        if (pay.week_start !== w) continue;
        const p = get(pay.employee_id);
        p.payments.push(pay);
        p.paid = round2(p.paid + pay.amount);
      }
      const list = Array.from(people.values())
        .filter((p) => p.parts.length > 0 || p.paid > 0)
        .map((p) => ({ ...p, left: Math.max(0, round2(p.due - p.paid)) }))
        .sort((a, b) => b.left - a.left || a.full_name.localeCompare(b.full_name, "he"));
      for (const p of list) dueAll.set(p.employee_id, round2((dueAll.get(p.employee_id) ?? 0) + p.due));
      out.push({
        weekStart: w,
        isCurrent: w === input.currentWeekStart,
        total: round2(list.reduce((s, p) => s + p.due, 0)),
        left: round2(list.reduce((s, p) => s + p.left, 0)),
        people: list,
      });
    });

  const since = input.now.getTime() - 30 * DAY_MS;
  const summary = new Map<string, PaidSummaryRow>();
  const row = (id: string) => {
    let r = summary.get(id);
    if (!r) {
      r = { employee_id: id, full_name: nameOf(id), paidLast30: 0, paidAll: 0, owed: 0 };
      summary.set(id, r);
    }
    return r;
  };
  for (const p of input.payments) {
    const r = row(p.employee_id);
    r.paidAll = round2(r.paidAll + p.amount);
    if (new Date(p.paid_at).getTime() >= since) r.paidLast30 = round2(r.paidLast30 + p.amount);
  }
  const paidCounted = new Map<string, number>();
  for (const p of input.payments) {
    if (!counted(p.week_start) || p.week_start > input.currentWeekStart) continue;
    paidCounted.set(p.employee_id, round2((paidCounted.get(p.employee_id) ?? 0) + p.amount));
  }
  dueAll.forEach((due, id) => {
    const r = row(id);
    r.owed = Math.max(0, round2(due - (paidCounted.get(id) ?? 0)));
  });

  const rows = Array.from(summary.values()).sort((a, b) => b.owed - a.owed || a.full_name.localeCompare(b.full_name, "he"));
  return {
    weeks: out.slice(0, input.recentWeeks ?? 8),
    summary: rows,
    totals: {
      paidLast30: round2(rows.reduce((s, r) => s + r.paidLast30, 0)),
      paidAll: round2(rows.reduce((s, r) => s + r.paidAll, 0)),
      owed: round2(rows.reduce((s, r) => s + r.owed, 0)),
    },
  };
}
