-- ============================================================
-- 024_expenses_recurring_start_date.sql
-- Fixed/recurring expenses now respect their *configured* start date.
--
-- 023 gated recurring expenses on `creation_date` (the timestamp the row was
-- entered), which made it impossible to backdate a fixed cost - a monthly rent
-- created today would never apply to the weeks it actually belongs to.
-- The gate moves to `expense_date`, which the admin form now exposes as an
-- editable "start date" for fixed expenses.
--
-- One-time expenses are unchanged: still counted only in the week that
-- contains their expense_date.
-- ============================================================

-- -----------------------------
-- 1. Every row must carry a start date before it can be gated on one.
-- -----------------------------
-- Guard for installs where 023 did not run, then make sure every row carries
-- a start date before it can be gated on one.
-- -----------------------------
alter table public.expenses
  add column if not exists expense_date date;

update public.expenses
set expense_date = (created_at at time zone 'utc')::date
where expense_date is null;

alter table public.expenses
  alter column expense_date set not null;

-- -----------------------------
-- 2. Recreate the canonical weekly aggregator
-- Signature and return type are unchanged, so CREATE OR REPLACE is safe.
-- Mirrors src/lib/expenses.ts (expensesForWeek) exactly.
-- -----------------------------
create or replace function public.expenses_for_week(p_week_start timestamptz)
returns numeric
language sql
stable
as $$
  select coalesce(sum(
    case
      -- One-time: only the week the expense actually happened in.
      when e.expense_type = 'one_time' then
        case
          when e.expense_date >= (p_week_start at time zone 'utc')::date
           and e.expense_date < ((p_week_start at time zone 'utc')::date + 7)
          then e.amount
          else 0
        end

      -- Fixed / recurring: charged in every week from the week containing
      -- its configured start date onward.
      when e.expense_type = 'recurring' then
        case
          when coalesce(e.is_active, true)
           and e.expense_date < ((p_week_start at time zone 'utc')::date + 7)
          then e.amount
          else 0
        end

      else 0
    end
  ), 0)
  from public.expenses e;
$$;

-- -----------------------------
-- 3. add_expense already accepts p_expense_date; nothing to change there.
-- Kept explicit so the start date can never silently fall back to "today".
-- -----------------------------
drop function if exists public.add_expense(text, numeric, text, text);
drop function if exists public.add_expense(text, numeric, text, text, date, boolean);

create or replace function public.add_expense(
  p_description text,
  p_amount numeric,
  p_category text,
  p_expense_type text,
  p_expense_date date default null,
  p_is_active boolean default true
)
returns uuid
language plpgsql
as $$
declare
  v_id uuid;
  v_date date;
begin
  if p_expense_type not in ('one_time', 'recurring') then
    raise exception 'invalid expense_type: %', p_expense_type;
  end if;

  v_date := coalesce(p_expense_date, (now() at time zone 'utc')::date);

  insert into public.expenses (
    description, amount, category, expense_type, expense_date, creation_date, is_active
  )
  values (
    p_description, p_amount, p_category, p_expense_type, v_date, now(), coalesce(p_is_active, true)
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- -----------------------------
-- 4. Recompute archived weeks with the corrected start dates
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