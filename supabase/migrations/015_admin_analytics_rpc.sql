-- ============================================================
-- 015_admin_analytics_rpc.sql
-- Adds: Comprehensive RPC functions for admin analytics dashboard
--       All-time metrics, WoW growth, best seller, sell-through, ROI
-- ============================================================

-- -----------------------------
-- Helper: Get current week start (Sunday 00:00 UTC)
-- -----------------------------
create or replace function public.week_start_sunday(d timestamptz default now())
returns timestamptz language sql immutable as $$
  select (date_trunc('week', d at time zone 'utc') at time zone 'utc') - interval '1 day'
$$;

-- -----------------------------
-- 1. All-Time Cumulative Gross Profit
-- Sum of gross_profit from weekly_archives + current active week
-- -----------------------------
create or replace function public.all_time_gross_profit()
returns numeric language sql stable as $$
  select coalesce(
    (select sum(gross_profit) from public.weekly_archives), 0
  ) + coalesce((
    select gross_profit from public.weekly_financial_summary(public.week_start_sunday())
  ), 0);
$$;

-- -----------------------------
-- 2. Total Expenses Logged
-- Sum of all expenses (both one_time and recurring)
-- -----------------------------
create or replace function public.total_expenses_logged()
returns numeric language sql stable as $$
  select coalesce(sum(amount), 0) from public.expenses;
$$;

-- -----------------------------
-- 3. True All-Time Net Profit
-- All-time gross profit - total expenses
-- -----------------------------
create or replace function public.all_time_net_profit()
returns numeric language sql stable as $$
  select coalesce(public.all_time_gross_profit(), 0) - coalesce(public.total_expenses_logged(), 0);
$$;

-- -----------------------------
-- 4. Total Registered Users
-- Count of profiles (auth users with profiles)
-- -----------------------------
create or replace function public.total_registered_users()
returns bigint language sql stable as $$
  select count(*) from public.profiles;
$$;

-- -----------------------------
-- 5. WoW Growth Metrics
-- Returns current week and previous week metrics for comparison
-- -----------------------------
create or replace function public.wow_growth_metrics()
returns table (
  -- Current week
  curr_revenue numeric,
  curr_gross_profit numeric,
  curr_orders_count bigint,
  -- Previous week
  prev_revenue numeric,
  prev_gross_profit numeric,
  prev_orders_count bigint,
  -- Calculated growth percentages
  revenue_wow_pct numeric,
  profit_wow_pct numeric,
  orders_wow_pct numeric
) language sql stable as $$
  with curr as (
    select
      total_revenue,
      gross_profit,
      orders_count
    from public.weekly_financial_summary(public.week_start_sunday())
  ),
  prev as (
    select
      total_revenue,
      gross_profit,
      orders_count
    from public.weekly_financial_summary(public.week_start_sunday() - interval '7 days')
  )
  select
    coalesce(curr.total_revenue, 0) as curr_revenue,
    coalesce(curr.gross_profit, 0) as curr_gross_profit,
    coalesce(curr.orders_count, 0) as curr_orders_count,
    coalesce(prev.total_revenue, 0) as prev_revenue,
    coalesce(prev.gross_profit, 0) as prev_gross_profit,
    coalesce(prev.orders_count, 0) as prev_orders_count,
    case
      when coalesce(prev.total_revenue, 0) = 0 then null
      else round(((coalesce(curr.total_revenue, 0) - coalesce(prev.total_revenue, 0)) / coalesce(prev.total_revenue, 0)) * 100, 2)
    end as revenue_wow_pct,
    case
      when coalesce(prev.gross_profit, 0) = 0 then null
      else round(((coalesce(curr.gross_profit, 0) - coalesce(prev.gross_profit, 0)) / coalesce(prev.gross_profit, 0)) * 100, 2)
    end as profit_wow_pct,
    case
      when coalesce(prev.orders_count, 0) = 0 then null
      else round(((coalesce(curr.orders_count, 0)::numeric - coalesce(prev.orders_count, 0)::numeric) / coalesce(prev.orders_count, 0)::numeric) * 100, 2)
    end as orders_wow_pct
  from curr, prev;
$$;

-- -----------------------------
-- 6. Best Seller by Volume (All-Time)
-- Top product by total units sold across archives + active orders
-- -----------------------------
create or replace function public.best_seller_by_volume()
returns table (
  product_id uuid,
  title text,
  total_units bigint,
  total_revenue numeric,
  total_profit numeric
) language sql stable as $$
  with archived_sales as (
    select
      (p->>'product_id')::uuid as product_id,
      p->>'title' as title,
      (p->>'units')::bigint as units,
      (p->>'revenue')::numeric as revenue,
      (p->>'profit')::numeric as profit
    from public.weekly_archives,
         jsonb_array_elements(top_products) as p
  ),
  active_sales as (
    select
      (item->>'productId')::uuid as product_id,
      coalesce(nullif(item->>'title',''), 'מוצר') as title,
      (item->>'qty')::int as qty,
      coalesce((item->>'price')::numeric, 0) as unit_price,
      p.cost_price
    from public.orders o,
         jsonb_array_elements(o.items) as item
    join public.products p on p.id = (item->>'productId')::uuid
    where o.status <> 'cancelled'
      and o.status <> 'archived'
  ),
  combined as (
    select product_id, title, sum(units) as total_units, sum(revenue) as total_revenue, sum(profit) as total_profit
    from (
      select product_id, title, units, revenue, profit from archived_sales
      union all
      select product_id, title, qty as units, qty * unit_price as revenue, qty * unit_price - qty * cost_price as profit from active_sales
    ) s
    group by product_id, title
  )
  select product_id, title, total_units, total_revenue, total_profit
  from combined
  order by total_units desc
  limit 1;
$$;

-- -----------------------------
-- 7. Highest Sell-Through Rate
-- Per product: (Total Sold / Initial Stock Brought) * 100
-- Uses inventory.initial_stock_count as denominator
-- -----------------------------
create or replace function public.highest_sell_through_rate()
returns table (
  product_id uuid,
  title text,
  total_sold bigint,
  initial_stock bigint,
  sell_through_pct numeric
) language sql stable as $$
  with archived_sales as (
    select
      (p->>'product_id')::uuid as product_id,
      (p->>'units')::bigint as units
    from public.weekly_archives,
         jsonb_array_elements(top_products) as p
  ),
  active_sales as (
    select
      (item->>'productId')::uuid as product_id,
      (item->>'qty')::int as qty
    from public.orders o,
         jsonb_array_elements(o.items) as item
    where o.status <> 'cancelled'
      and o.status <> 'archived'
  ),
  combined_sales as (
    select product_id, sum(units) as total_sold
    from (
      select product_id, units from archived_sales
      union all
      select product_id, qty as units from active_sales
    ) s
    group by product_id
  ),
  with_inventory as (
    select
      cs.product_id,
      p.title,
      cs.total_sold,
      coalesce(i.initial_stock_count, 0) as initial_stock
    from combined_sales cs
    join public.products p on p.id = cs.product_id
    left join public.inventory i on i.product_id = cs.product_id
    where coalesce(i.initial_stock_count, 0) > 0
  )
  select
    product_id,
    title,
    total_sold,
    initial_stock,
    round((total_sold::numeric / initial_stock::numeric) * 100, 2) as sell_through_pct
  from with_inventory
  order by sell_through_pct desc
  limit 1;
$$;

-- -----------------------------
-- 8. Investment-to-Profit Efficiency Ratio (ROI)
-- Average weekly supplier cost vs average weekly net profit
-- Returns: avg_weekly_investment, avg_weekly_net_profit, avg_return_ratio
-- -----------------------------
create or replace function public.investment_efficiency_ratio()
returns table (
  avg_weekly_investment numeric,
  avg_weekly_net_profit numeric,
  avg_return_ratio numeric,
  cycle_count bigint
) language sql stable as $$
  with archived as (
    select
      total_supplier_cost as supplier_cost,
      total_net_profit as net_profit
    from public.weekly_archives
    where total_supplier_cost > 0
  ),
  current_week as (
    select
      total_cost as supplier_cost,
      gross_profit as net_profit
    from public.weekly_financial_summary(public.week_start_sunday())
    where total_cost > 0
  ),
  all_cycles as (
    select supplier_cost, net_profit from archived
    union all
    select supplier_cost, net_profit from current_week
  ),
  all_weeks as (
    select week_start, week_end from public.weekly_archives
    union all
    select public.week_start_sunday() as week_start, public.week_start_sunday() + interval '7 days' as week_end
  ),
  avg_expenses as (
    select coalesce(sum(amount), 0) / nullif(count(*), 0) as avg_weekly_expenses
    from public.expenses e
    cross join all_weeks aw
    where e.created_at >= aw.week_start
      and e.created_at < aw.week_end
  )
  select
    round(avg(supplier_cost)::numeric, 2) as avg_weekly_investment,
    round(avg(net_profit)::numeric, 2) as avg_weekly_net_profit,
    case
      when avg(supplier_cost) = 0 then 0
      else round((avg(net_profit) - (select avg_weekly_expenses from avg_expenses)) / avg(supplier_cost), 2)
    end as avg_return_ratio,
    count(*)::bigint as cycle_count
  from all_cycles;
$$;

-- -----------------------------
-- 9. Expenses CRUD helpers
-- -----------------------------
create or replace function public.add_expense(
  p_description text,
  p_amount numeric,
  p_category text,
  p_expense_type text
)
returns uuid language plpgsql as $$
declare
  v_id uuid;
begin
  insert into public.expenses (description, amount, category, expense_type)
  values (p_description, p_amount, p_category, p_expense_type)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.update_expense(
  p_id uuid,
  p_description text,
  p_amount numeric,
  p_category text,
  p_expense_type text
)
returns void language plpgsql as $$
begin
  update public.expenses
  set description = p_description,
      amount = p_amount,
      category = p_category,
      expense_type = p_expense_type
  where id = p_id;
end;
$$;

create or replace function public.delete_expense(p_id uuid)
returns void language plpgsql as $$
begin
  delete from public.expenses where id = p_id;
end;
$$;

create or replace function public.list_expenses()
returns table (
  id uuid,
  description text,
  amount numeric,
  category text,
  expense_type text,
  created_at timestamptz
) language sql stable as $$
  select id, description, amount, category, expense_type, created_at
  from public.expenses
  order by created_at desc;
$$;

-- -----------------------------
-- 10. Expenses Summary by Type
-- For dashboard cards
-- -----------------------------
create or replace function public.expenses_summary()
returns table (
  total_one_time numeric,
  total_recurring numeric,
  total_all numeric
) language sql stable as $$
  select
    coalesce(sum(amount) filter (where expense_type = 'one_time'), 0) as total_one_time,
    coalesce(sum(amount) filter (where expense_type = 'recurring'), 0) as total_recurring,
    coalesce(sum(amount), 0) as total_all
  from public.expenses;
$$;

-- -----------------------------
-- 11. All-Time Metrics Combined (for single RPC call)
-- Returns cumulative_gross_profit, total_expenses, true_net_profit
-- -----------------------------
create or replace function public.all_time_metrics()
returns table (
  cumulative_gross_profit numeric,
  total_expenses numeric,
  true_net_profit numeric
) language sql stable as $$
  select
    public.all_time_gross_profit() as cumulative_gross_profit,
    public.total_expenses_logged() as total_expenses,
    public.all_time_net_profit() as true_net_profit;
$$;
