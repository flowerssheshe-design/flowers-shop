with parsed_archives as (
  select
    wa.id,
    coalesce(wa.total_revenue, 0) as total_revenue,
    coalesce(wa.total_cost, 0) as total_cost,
    coalesce(wa.total_expenses, 0) as total_expenses,
    nullif(wa.snapshot_data ->> 'gross_profit', '')::numeric as snapshot_gross_profit,
    nullif(wa.snapshot_data ->> 'supplier_cost', '')::numeric as snapshot_supplier_cost,
    (wa.snapshot_data ? 'supplier_cost') as has_snapshot_supplier_cost
  from public.weekly_archives wa
  where coalesce(wa.gross_profit, 0) = 0
    and coalesce(wa.total_revenue, 0) > 0
),
repairs as (
  select
    id,
    case
      when snapshot_gross_profit is not null and snapshot_gross_profit <> 0 then snapshot_gross_profit
      when has_snapshot_supplier_cost then total_revenue - coalesce(snapshot_supplier_cost, 0)
      else total_revenue - total_cost
    end as gross_profit,
    case
      when has_snapshot_supplier_cost then coalesce(snapshot_supplier_cost, 0)
      else total_cost
    end as total_cost
  from parsed_archives
)
update public.weekly_archives wa
set
  gross_profit = repairs.gross_profit,
  total_cost = repairs.total_cost,
  total_supplier_cost = repairs.total_cost,
  total_net_profit = repairs.gross_profit - coalesce(wa.total_expenses, 0)
from repairs
where wa.id = repairs.id;

insert into public.expenses (
  description,
  amount,
  category,
  expense_type,
  created_at
)
select
  'Weekly archive expense total - ' || to_char(wa.week_start at time zone 'utc', 'YYYY-MM-DD'),
  wa.total_expenses,
  'weekly_archive',
  'one_time',
  wa.week_start
from public.weekly_archives wa
where coalesce(wa.total_expenses, 0) > 0
  and not exists (
    select 1
    from public.expenses e
    where e.created_at >= wa.week_start
      and e.created_at < wa.week_end
      and e.amount > 0
  );

create or replace function public.sync_weekly_archive_expenses()
returns trigger
language plpgsql
as $$
declare
  v_week_end timestamptz;
begin
  if coalesce(new.total_expenses, 0) > 0 then
    v_week_end := coalesce(new.week_end, new.week_start + interval '7 days');

    if not exists (
      select 1
      from public.expenses e
      where e.created_at >= new.week_start
        and e.created_at < v_week_end
        and e.amount > 0
    ) then
      insert into public.expenses (
        description,
        amount,
        category,
        expense_type,
        created_at
      )
      values (
        'Weekly archive expense total - ' || to_char(new.week_start at time zone 'utc', 'YYYY-MM-DD'),
        new.total_expenses,
        'weekly_archive',
        'one_time',
        new.week_start
      );
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_weekly_archives_expenses on public.weekly_archives;

create trigger trg_weekly_archives_expenses
after insert or update on public.weekly_archives
for each row execute function public.sync_weekly_archive_expenses();

create or replace function public.all_time_gross_profit()
returns numeric
language sql stable
as $$
  select coalesce(
    (
      select sum(
        case
          when coalesce(gross_profit, 0) <> 0 then gross_profit
          when coalesce(total_revenue, 0) > 0 then coalesce(total_revenue, 0) - coalesce(total_cost, 0)
          else coalesce(gross_profit, 0)
        end
      )
      from public.weekly_archives
    ),
    0
  ) + coalesce((
    select coalesce(gross_profit, 0)
    from public.weekly_financial_summary(public.week_start_sunday())
  ), 0);
$$;

create or replace function public.total_expenses_logged()
returns numeric
language sql stable
as $$
  select case
    when exists (select 1 from public.expenses where amount > 0) then
      coalesce((select sum(amount) from public.expenses), 0)
    else
      coalesce((select sum(total_expenses) from public.weekly_archives), 0)
  end;
$$;

create or replace function public.all_time_net_profit()
returns numeric
language sql stable
as $$
  select coalesce(public.all_time_gross_profit(), 0) - coalesce(public.total_expenses_logged(), 0);
$$;
