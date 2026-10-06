/**
 * Weekly expense aggregation.
 *
 * Two expense kinds are bucketed differently:
 *
 *  - one_time  (הוצאה חד-פעמית)
 *      Counts ONLY in the single week that contains its expense date. It never
 *      rolls forward into future weeks and never leaks into past weeks.
 *
 *  - recurring (הוצאה קבועה / חוזרת)
 *      A fixed cost that applies to every weekly calculation starting from the
 *      week containing its configured start date. The start date is user
 *      editable and may be backdated, so a monthly rent entered today can still
 *      be attributed to the weeks it actually belongs to. It is counted in
 *      every week whose end falls after that start date, as long as it is
 *      still active.
 *
 * The SQL twin of this logic is `public.expenses_for_week()` in
 * supabase/migrations/023_expenses_recurring_weekly.sql — keep the two in sync.
 */

export type ExpenseBucket = {
  amount: number | string | null | undefined;
  expense_type?: "one_time" | "recurring" | null;
  /** Start date for fixed expenses; the occurrence date for one-time ones. */
  expense_date?: string | null;
  /** When the row was actually entered (audit only; not the weekly gate). */
  creation_date?: string | null;
  created_at?: string | null;
  is_active?: boolean | null;
};

export type WeeklyExpenseBreakdown = {
  /** Fixed/recurring expenses charged to this week. */
  recurring: number;
  /** One-time expenses that fall inside this week. */
  oneTime: number;
  /** recurring + oneTime — the amount subtracted from gross profit. */
  total: number;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function toTime(value: string | null | undefined): number | null {
  if (!value) return null;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? null : t;
}

/** Midnight (UTC) of the day a date string falls on. */
function toDayStart(value: string | null | undefined): number | null {
  const t = toTime(value);
  if (t === null) return null;
  return Math.floor(t / MS_PER_DAY) * MS_PER_DAY;
}

function toAmount(value: number | string | null | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Sum the expenses that apply to the week [weekStart, weekEnd).
 *
 * @param weekStart Inclusive start of the selected week.
 * @param weekEnd   Exclusive end of the selected week (may be omitted, in
 *                  which case weekStart + 7 days is used).
 */
export function sumExpensesForWeek(
  expenses: ExpenseBucket[] | null | undefined,
  weekStart: string | Date,
  weekEnd?: string | Date | null,
): number {
  return expensesForWeek(expenses, weekStart, weekEnd).total;
}

export function expensesForWeek(
  expenses: ExpenseBucket[] | null | undefined,
  weekStart: string | Date,
  weekEnd?: string | Date | null,
): WeeklyExpenseBreakdown {
  const start = toDayStart(
    weekStart instanceof Date ? weekStart.toISOString() : weekStart,
  );
  const rawEnd = weekEnd ?? null;
  const end = toDayStart(rawEnd instanceof Date ? rawEnd.toISOString() : rawEnd);
  const endExclusive = end ?? (start === null ? null : start + 7 * MS_PER_DAY);

  const breakdown: WeeklyExpenseBreakdown = {
    recurring: 0,
    oneTime: 0,
    total: 0,
  };
  if (start === null || endExclusive === null) return breakdown;

  for (const expense of expenses ?? []) {
    const amount = toAmount(expense?.amount);
    if (amount === 0) continue;

    if (expense?.expense_type === "recurring") {
      // Deactivated fixed costs stop applying from now on.
      if (expense.is_active === false) continue;

      // The admin-configured start date wins; creation/created_at are only
      // fallbacks for rows that predate the column.
      const startDay =
        toDayStart(expense.expense_date) ??
        toDayStart(expense.creation_date) ??
        toDayStart(expense.created_at);
      // Charged in every week that ends after the start date, i.e. the week
      // containing it and every later week.
      if (startDay === null || startDay >= endExclusive) continue;

      breakdown.recurring += amount;
      continue;
    }

    // One-time: must fall inside the selected week only.
    const expenseDay =
      toDayStart(expense?.expense_date) ?? toDayStart(expense?.created_at);
    if (expenseDay === null) continue;
    if (expenseDay < start || expenseDay >= endExclusive) continue;

    breakdown.oneTime += amount;
  }

  breakdown.total = breakdown.recurring + breakdown.oneTime;
  return breakdown;
}