-- ============================================================
-- 017_admin_analytics_refactor.sql
-- Refactors admin analytics RPCs for the new dashboard layout:
--   * Splits best_seller_by_volume into pre-orders vs stall sales
--   * Replaces highest_sell_through_rate with stall-exclusive version
--   * Adds customer_segment_counts (regular vs loyal)
--   * Drops superseded WoW growth, investment ROI, and registered-users RPCs
--   * Fixes all_time_gross_profit, total_expenses_logged, all_time_net_profit with COALESCE safety
-- ============================================================

-- Fix: Cumulative Gross Profit with explicit COALESCE on both terms
create or replace function public.all_time_gross_profit()
returns numeric language sql stable as $$
  select coalesce(
    (select coalesce(sum(gross_profit), 0) from public.weekly_archives), 0
  ) + coalesce((
    select coalesce(gross_profit, 0) from public.weekly_financial_summary(public.week_start_sunday())
  ), 0);
$$;

-- Fix: Total Expenses with explicit COALESCE on sum
create or replace function public.total_expenses_logged()
returns numeric language sql stable as $$
  select coalesce(sum(amount), 0) from public.expenses;
$$;

-- Fix: True Net Profit with COALESCE on both operands
create or replace function public.all_time_net_profit()
returns numeric language sql stable as $$
  select coalesce(public.all_time_gross_profit(), 0) - coalesce(public.total_expenses_logged(), 0);
$$;

-- -----------------------------
-- 1. Best Seller — Pre-Orders
-- Top product by total units sold from website pre-orders
-- (orders with a non-empty customer_phone)
-- -----------------------------
create or replace function public.best_seller_preorders()
returns table (
  product_id uuid,
  title text,
  total_units bigint,
  total_revenue numeric,
  total_profit numeric
) language sql stable as $$
  with archived_preorder_sales as (
    select
      (p->>'product_id')::uuid as product_id,
      p->>'title' as title,
      (p->>'qty')::int as units,
      coalesce((p->>'line_total')::numeric, 0) as revenue,
      (coalesce((p->>'line_total')::numeric, 0) - coalesce((p->>'line_cost')::numeric, 0)) as profit
    from public.weekly_archives wa,
         jsonb_array_elements(coalesce(wa.snapshot_data -> 'preorders' -> 'items', '[]'::jsonb)) as p
  ),
  active_preorder_sales as (
    select
      (item->>'productId')::uuid as product_id,
      coalesce(nullif(item->>'title',''), 'מוצר') as title,
      (item->>'qty')::int as qty,
      coalesce((item->>'price')::numeric, 0) as unit_price,
      p.cost_price
    from public.orders o,
         jsonb_array_elements(o.items) as item
    join public.products p on p.id = (item->>'productId')::uuid
    where o.customer_phone <> ''
      and o.status <> 'cancelled'
      and o.status <> 'archived'
  ),
  combined as (
    select product_id, title, sum(units) as total_units, sum(revenue) as total_revenue, sum(profit) as total_profit
    from (
      select product_id, title, units, revenue, profit from archived_preorder_sales
      union all
      select product_id, title, qty as units, qty * unit_price as revenue, qty * unit_price - qty * cost_price as profit from active_preorder_sales
    ) s
    group by product_id, title
  )
  select product_id, title, total_units, total_revenue, total_profit
  from combined
  order by total_units desc
  limit 1;
$$;

-- -----------------------------
-- 2. Best Seller — Stall Sales
-- Top product by total units sold from stall sales
-- (orders with an empty customer_phone)
-- -----------------------------
create or replace function public.best_seller_stall_sales()
returns table (
  product_id uuid,
  title text,
  total_units bigint,
  total_revenue numeric,
  total_profit numeric
) language sql stable as $$
  with archived_stall_sales as (
    select
      (p->>'product_id')::uuid as product_id,
      p->>'title' as title,
      (p->>'units_sold')::bigint as units,
      coalesce((p->>'revenue')::numeric, 0) as revenue,
      coalesce((p->>'profit')::numeric, 0) as profit
    from public.weekly_archives wa,
         jsonb_array_elements(coalesce(wa.snapshot_data -> 'stall_inventory' -> 'products', '[]'::jsonb)) as p
  ),
  active_stall_sales as (
    select
      (item->>'productId')::uuid as product_id,
      coalesce(nullif(item->>'title',''), 'מוצר') as title,
      (item->>'qty')::int as qty,
      coalesce((item->>'price')::numeric, 0) as unit_price,
      p.cost_price
    from public.orders o,
         jsonb_array_elements(o.items) as item
    join public.products p on p.id = (item->>'productId')::uuid
    where o.customer_phone = ''
      and o.status <> 'cancelled'
      and o.status <> 'archived'
  ),
  combined as (
    select product_id, title, sum(units) as total_units, sum(revenue) as total_revenue, sum(profit) as total_profit
    from (
      select product_id, title, units, revenue, profit from archived_stall_sales
      union all
      select product_id, title, qty as units, qty * unit_price as revenue, qty * unit_price - qty * cost_price as profit from active_stall_sales
    ) s
    group by product_id, title
  )
  select product_id, title, total_units, total_revenue, total_profit
  from combined
  order by total_units desc
  limit 1;
$$;

-- -----------------------------
-- 3. Highest Sell-Through Rate (Stall-Exclusive)
-- Per product: (Total Stall Sold / Initial Stock) * 100
-- Total sold counted exclusively from stall sales data
-- (archived snapshot + active orders with empty customer_phone)
-- Safeguards against division by zero.
-- -----------------------------
create or replace function public.highest_sell_through_rate_stall()
returns table (
  product_id uuid,
  title text,
  total_sold bigint,
  initial_stock bigint,
  sell_through_pct numeric
) language sql stable as $$
  with archived_stall_sales as (
    select
      (p->>'product_id')::uuid as product_id,
      (p->>'units_sold')::bigint as units
    from public.weekly_archives wa,
         jsonb_array_elements(coalesce(wa.snapshot_data -> 'stall_inventory' -> 'products', '[]'::jsonb)) as p
  ),
  active_stall_sales as (
    select
      (item->>'productId')::uuid as product_id,
      (item->>'qty')::int as qty
    from public.orders o,
         jsonb_array_elements(o.items) as item
    where o.customer_phone = ''
      and o.status <> 'cancelled'
      and o.status <> 'archived'
  ),
  combined_sales as (
    select product_id, sum(units) as total_sold
    from (
      select product_id, units from archived_stall_sales
      union all
      select product_id, qty as units from active_stall_sales
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
-- 4. Customer Segment Counts
-- Regular: unique customer phones with 1–3 orders
-- Loyal: unique customer phones with >3 orders
-- -----------------------------
create or replace function public.customer_segment_counts()
returns table (
  regular_customers bigint,
  loyal_customers bigint
) language sql stable as $$
  with order_counts as (
    select
      customer_phone,
      count(*) as order_count
    from public.orders o
    where o.customer_phone <> ''
      and o.status <> 'cancelled'
    group by customer_phone
  )
  select
    count(*) filter (where order_count between 1 and 3) as regular_customers,
    count(*) filter (where order_count > 3) as loyal_customers
  from order_counts;
$$;

-- -----------------------------
-- 5. Drop superseded RPCs (no longer used by the refactored dashboard)
-- -----------------------------
drop function if exists public.wow_growth_metrics();
drop function if exists public.best_seller_by_volume();
drop function if exists public.highest_sell_through_rate();
drop function if exists public.investment_efficiency_ratio();
drop function if exists public.total_registered_users();
