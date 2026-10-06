-- ============================================================
-- 023_expenses_recurring_weekly.sql
-- Fixes expense bucketing for the weekly report:
--   * one_time  -> counted ONLY in the week containing its expense_date
--   * recurring -> counted in EVERY week from the week containing its
--                  configured start date (expense_date) onward
--                  (while is_active = true)
-- Adds the columns the weekly aggregation needs and removes the
-- archive -> expenses feedback trigger that double-counted totals.
-- ============================================================

-- -----------------------------
-- 1. Columns
-- -----------------------------
alter table public.expenses
  add column if not exists expense_date date,
  add column if not exists creation_date timestamptz,
  add column if not exists is_active boolean,
  add column if not exists updated_at timestamptz;

update public.expenses
set expense_date = coalesce(expense_date, (created_at at time zone 'utc')::date);

update public.expenses
set creation_date = coalesce(creation_date, created_at);

update public.expenses
set is_active = coalesce(is_active, true);

update public.expenses
set updated_at = coalesce(updated_at, created_at);

alter table public.expenses
  alter column expense_date set default ((now() at time zone 'utc')::date),
  alter column creation_date set default now(),
  alter column is_active set default true,
  alter column updated_at set default now();

-- expense_date is required by the aggregation, so make it not-null.
alter table public.expenses
  alter column expense_date set not null;

-- -----------------------------
-- 2. Indexes
-- -----------------------------
drop index if exists public.idx_expenses_type_created;
create index if not exists idx_expenses_type_created
  on public.expenses(expense_type, created_at desc);

create index if not exists idx_expenses_expense_date
  on public.expenses(expense_date, expense_type);

create index if not exists idx_expenses_recurring_active
  on public.expenses(creation_date)
  where expense_type = 'recurring' and is_active;

-- -----------------------------
-- 3. Fix the broken updated_at trigger
-- public.set_updated_at() assigns new.updated_at, but the table had no such
-- column, so every update on expenses raised an error.
-- -----------------------------
drop trigger if exists trg_expenses_updated_at on public.expenses;
create trigger trg_expenses_updated_at
  before update on public.expenses
  for each row execute function public.set_updated_at();

-- -----------------------------
-- 4. Remove the archive -> expenses feedback loop
-- 019 installed a trigger that inserted a synthetic one_time expense row
-- (category 'weekly_archive') into the very week that had just been
-- archived. The next read of that week then counted the archive total
-- *plus* the original expenses, inflating both the weekly report and
-- total_expenses_logged().
-- -----------------------------
drop trigger if exists trg_weekly_archives_expenses on public.weekly_archives;
drop function if exists public.sync_weekly_archive_expenses();

-- Delete the synthetic rows that the loop already created.
delete from public.expenses where category = 'weekly_archive';

-- -----------------------------
-- 5. Canonical weekly aggregation
-- -----------------------------
-- Returns the expense total for the week that starts at p_week_start.
-- Mirrors src/lib/expenses.ts (sumExpensesForWeek) exactly.
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
      -- its configured start date onward (expense_date is user-settable and
      -- may be backdated past the row's created_at).
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
-- 6. CRUD RPCs with the new fields
-- -----------------------------
-- create or replace cannot change a function's row type (OUT parameters) and
-- would leave the previous signatures behind as silent overloads, so drop the
-- old and new variants explicitly first. Both arg lists are listed because a
-- partially applied run may already have created the new ones.
drop function if exists public.add_expense(text, numeric, text, text);
drop function if exists public.add_expense(text, numeric, text, text, date, boolean);

drop function if exists public.update_expense(uuid, text, numeric, text, text);
drop function if exists public.update_expense(uuid, text, numeric, text, text, date, boolean);

drop function if exists public.list_expenses();

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

create or replace function public.update_expense(
  p_id uuid,
  p_description text,
  p_amount numeric,
  p_category text,
  p_expense_type text,
  p_expense_date date default null,
  p_is_active boolean default null
)
returns void
language plpgsql
as $$
begin
  if p_expense_type not in ('one_time', 'recurring') then
    raise exception 'invalid expense_type: %', p_expense_type;
  end if;

  update public.expenses
  set description = p_description,
      amount = p_amount,
      category = p_category,
      expense_type = p_expense_type,
      expense_date = coalesce(p_expense_date, expense_date),
      is_active = coalesce(p_is_active, is_active)
  where id = p_id;
end;
$$;

create or replace function public.delete_expense(p_id uuid)
returns void
language sql
as $$
  delete from public.expenses where id = p_id;
$$;

create or replace function public.list_expenses()
returns table (
  id uuid,
  description text,
  amount numeric,
  category text,
  expense_type text,
  expense_date date,
  creation_date timestamptz,
  is_active boolean,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
as $$
  select
    e.id, e.description, e.amount, e.category, e.expense_type,
    e.expense_date, e.creation_date, coalesce(e.is_active, true),
    e.created_at, e.updated_at
  from public.expenses e
  order by e.created_at desc;
$$;

-- -----------------------------
-- 7. Summary (active expenses only; inactive fixed costs no longer count)
-- -----------------------------
create or replace function public.expenses_summary()
returns table (
  total_one_time numeric,
  total_recurring numeric,
  total_all numeric
)
language sql
stable
as $$
  select
    coalesce(sum(e.amount) filter (where e.expense_type = 'one_time'), 0) as total_one_time,
    coalesce(sum(e.amount) filter (where e.expense_type = 'recurring'), 0) as total_recurring,
    coalesce(sum(e.amount), 0) as total_all
  from public.expenses e
  where coalesce(e.is_active, true);
$$;

-- -----------------------------
-- 8. All-time metrics
-- total_expenses_logged() stays a "what was entered" figure (one-time +
-- active recurring definitions counted once each) so it never exceeds what
-- the weekly archives already deducted. The fallback to archive totals is
-- removed: the synthetic expense rows it relied on no longer exist.
-- -----------------------------
create or replace function public.total_expenses_logged()
returns numeric
language sql
stable
as $$
  select coalesce(sum(e.amount), 0)
  from public.expenses e
  where coalesce(e.is_active, true);
$$;

create or replace function public.all_time_net_profit()
returns numeric
language sql
stable
as $$
  select coalesce(public.all_time_gross_profit(), 0) - coalesce(public.total_expenses_logged(), 0);
$$;

-- -----------------------------
-- 9. Recompute archived weeks with the corrected rules
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