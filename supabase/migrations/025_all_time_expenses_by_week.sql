-- ============================================================
-- 025_all_time_expenses_by_week.sql
-- The Statistics page deducted expenses with a flat `sum(amount)`, which
-- treats every fixed cost as a one-off: a monthly rent entered once was only
-- ever subtracted once, no matter how many weeks it actually covered.
--
-- Expenses are now aggregated over the same set of weeks that gross profit is:
--   weekly_archives  UNION  the current week (week_start_sunday())
-- That mirrors all_time_gross_profit() exactly, so a week counted for revenue
-- is also counted for expenses and net profit stays coherent.
--
-- Per week the split is the one already implemented in expenses_for_week():
--   one_time  -> only the week containing its expense_date
--   recurring -> every week from the week containing its expense_date onward
--
-- Definition order matters: language sql bodies are validated at CREATE time,
-- so every function is declared before it is referenced.
-- ============================================================

-- Every week that carries revenue/profit, i.e. every archived week plus the
-- week currently in progress.
create or replace function public.expense_reporting_weeks()
returns setof timestamptz
language sql
stable
as $$
  select wa.week_start from public.weekly_archives wa
  union
  select public.week_start_sunday()
$$;

-- -----------------------------
-- One-time-only half of a week's total
-- -----------------------------
create or replace function public.one_time_expenses_for_week(p_week_start timestamptz)
returns numeric
language sql
stable
as $$
  select coalesce(sum(e.amount), 0)
  from public.expenses e
  where e.expense_type = 'one_time'
    and e.expense_date >= (p_week_start at time zone 'utc')::date
    and e.expense_date < ((p_week_start at time zone 'utc')::date + 7);
$$;

-- -----------------------------
-- All-time expenses, replicated per week
-- -----------------------------
create or replace function public.all_time_expenses()
returns numeric
language sql
stable
as $$
  select coalesce(sum(public.expenses_for_week(w)), 0)
  from public.expense_reporting_weeks() w;
$$;

-- -----------------------------
-- All-time split, for the Statistics page breakdown
-- -----------------------------
create or replace function public.all_time_expenses_breakdown()
returns table (
  total_recurring numeric,
  total_one_time numeric,
  total_expenses numeric
)
language sql
stable
as $$
  select
    coalesce(sum(public.expenses_for_week(w) - public.one_time_expenses_for_week(w)), 0) as total_recurring,
    coalesce(sum(public.one_time_expenses_for_week(w)), 0) as total_one_time,
    coalesce(sum(public.expenses_for_week(w)), 0) as total_expenses
  from public.expense_reporting_weeks() w;
$$;

-- -----------------------------
-- Re-point the metric at the weekly-replicated figure
-- Signature and return type unchanged, so CREATE OR REPLACE is safe.
-- -----------------------------
create or replace function public.total_expenses_logged()
returns numeric
language sql
stable
as $$
  select public.all_time_expenses();
$$;

create or replace function public.all_time_net_profit()
returns numeric
language sql
stable
as $$
  select coalesce(public.all_time_gross_profit(), 0) - coalesce(public.all_time_expenses(), 0);
$$;

-- -----------------------------
-- Re-reconcile archived weeks
-- -----------------------------
update public.weekly_archives wa
set
  total_expenses = public.expenses_for_week(wa.week_start),
  total_net_profit = (
    case
      when coalesce(wa.preorders_profit, 0) + coalesce(wa.stall_profit, 0) <> 0
        then coalesce(wa.preorders_profit, 0) + coalesce(wa.stall_profit, 0)
      when coalesce(wa.gross_profit, 0) <> 0 then wa.gross_profit
      when coalesce(wa.total_revenue, 0) > 0
        then coalesce(wa.total_revenue, 0) - coalesce(wa.total_cost, 0)
      else 0
    end
  ) - public.expenses_for_week(wa.week_start);