-- ============================================================
-- 009_add_financial_stats.sql
-- Adds: weekly financial summary with costs, profit, and losses
--       supplier_week_aggregate accepts optional week_start
--       top products with cost/profit breakdown
--       Fixes week_start_sunday to return Sunday 00:00 UTC
-- ============================================================

-- -----------------------------
-- Fix week_start_sunday to return Sunday 00:00 UTC (not Monday)
-- -----------------------------
create or replace function public.week_start_sunday(d timestamptz default now())
returns timestamptz language sql immutable as $$
  select (date_trunc('week', d at time zone 'utc') at time zone 'utc') - interval '1 day'
$$;

-- -----------------------------
-- Fix supplier_week_aggregate to accept explicit week_start
-- -----------------------------
create or replace function public.supplier_week_aggregate(week_start timestamptz default public.week_start_sunday())
returns table (product_id uuid, title text, total_qty bigint)
language sql stable as $$
  with exploded as (
    select
      (item->>'productId')::uuid as product_id,
      (item->>'qty')::int as qty,
      (item->>'title') as title
    from public.orders o,
         jsonb_array_elements(o.items) as item
    where o.created_at >= week_start
      and o.created_at <  week_start + interval '7 days'
      and o.status = 'approved'
  )
  select
    p.id as product_id,
    p.title as title,
    coalesce(sum(e.qty), 0)::bigint as total_qty
  from public.products p
  left join exploded e on e.product_id = p.id
  group by p.id, p.title
  order by total_qty desc;
$$;

-- -----------------------------
-- Weekly financial summary
-- Returns revenue, cost, profit, and cancelled order losses
-- -----------------------------
create or replace function public.weekly_financial_summary(week_start timestamptz default public.week_start_sunday())
returns table (
  total_revenue numeric,
  delivery_revenue numeric,
  products_revenue numeric,
  total_cost numeric,
  gross_profit numeric,
  orders_count bigint,
  pickup_count bigint,
  delivery_count bigint,
  member_orders_count bigint,
  new_customers_count bigint,
  returning_customers_count bigint,
  avg_order_value numeric,
  cancelled_orders_count bigint,
  cancelled_orders_value numeric
)
language sql stable as $$
  with wk as (
    select *
    from public.orders o
    where o.created_at >= week_start
      and o.created_at <  week_start + interval '7 days'
  ),
  active as (
    select * from wk where status <> 'cancelled' and status <> 'archived'
  ),
  cancelled as (
    select total_amount from wk where status = 'cancelled'
  ),
  exploded as (
    select
      (item->>'productId')::uuid as product_id,
      (item->>'qty')::int as qty
    from active, jsonb_array_elements(active.items) as item
  ),
  cost_calc as (
    select
      coalesce(sum(e.qty * p.cost_price), 0)::numeric as total_cost
    from exploded e
    join public.products p on p.id = e.product_id
  ),
  cancelled_calc as (
    select
      count(*)::bigint as cancelled_orders_count,
      coalesce(sum(total_amount), 0)::numeric as cancelled_orders_value
    from cancelled
  )
  select
    coalesce(sum(active.total_amount), 0)::numeric as total_revenue,
    coalesce(sum(active.delivery_fee), 0)::numeric as delivery_revenue,
    coalesce(sum(active.total_amount - active.delivery_fee), 0)::numeric as products_revenue,
    coalesce((select total_cost from cost_calc), 0)::numeric as total_cost,
    coalesce(sum(active.total_amount), 0)::numeric - coalesce((select total_cost from cost_calc), 0)::numeric as gross_profit,
    count(active.*)::bigint as orders_count,
    count(active.*) filter (where active.delivery_type = 'pickup')::bigint as pickup_count,
    count(active.*) filter (where active.delivery_type = 'delivery')::bigint as delivery_count,
    count(active.*) filter (where active.is_member)::bigint as member_orders_count,
    count(distinct active.customer_phone) filter (
      where not exists (
        select 1 from public.orders prior
        where prior.customer_phone = active.customer_phone
          and prior.created_at < week_start
          and prior.status in ('approved', 'completed')
      )
    )::bigint as new_customers_count,
    count(distinct active.customer_phone) filter (
      where exists (
        select 1 from public.orders prior
        where prior.customer_phone = active.customer_phone
          and prior.created_at < week_start
          and prior.status in ('approved', 'completed')
      )
    )::bigint as returning_customers_count,
    case
      when count(active.*) = 0 then 0::numeric
      else round(coalesce(sum(active.total_amount),0)::numeric / count(active.*), 2)
    end as avg_order_value,
    coalesce((select cancelled_orders_count from cancelled_calc), 0)::bigint as cancelled_orders_count,
    coalesce((select cancelled_orders_value from cancelled_calc), 0)::numeric as cancelled_orders_value
  from active;
$$;

-- -----------------------------
-- Top products with cost and profit breakdown
-- -----------------------------
create or replace function public.weekly_top_products_with_costs(
  week_start timestamptz,
  week_end timestamptz
)
returns table (
  product_id uuid,
  title text,
  units bigint,
  revenue numeric,
  cost numeric,
  profit numeric
)
language sql stable as $$
  with exploded as (
    select
      (item->>'productId')::uuid as product_id,
      coalesce(nullif(item->>'title',''), 'מוצר') as title,
      (item->>'qty')::int as qty,
      coalesce((item->>'price')::numeric, 0) as unit_price
    from public.orders o,
         jsonb_array_elements(o.items) as item
    where o.created_at >= week_start
      and o.created_at < week_end
      and o.status <> 'cancelled'
      and o.status <> 'archived'
  )
  select
    product_id,
    p.title as title,
    sum(qty)::bigint as units,
    sum(qty * unit_price)::numeric as revenue,
    coalesce(sum(qty * p.cost_price), 0)::numeric as cost,
    sum(qty * unit_price)::numeric - coalesce(sum(qty * p.cost_price), 0)::numeric as profit
  from exploded
  join public.products p on p.id = product_id
  group by product_id, p.title
  order by units desc
  limit 50;
$$;

-- -----------------------------
-- Extend weekly_archives with financial summary columns
-- -----------------------------
alter table public.weekly_archives
  add column if not exists total_cost numeric(12,2) default 0,
  add column if not exists gross_profit numeric(12,2) default 0,
  add column if not exists cancelled_orders_count integer default 0,
  add column if not exists cancelled_orders_value numeric(12,2) default 0;

-- -----------------------------
-- Fix weekly_reset to archive the previous week (not current/future week)
-- -----------------------------
create or replace function public.weekly_reset()
returns uuid
language plpgsql
as $$
declare
  ws timestamptz := public.week_start_sunday() - interval '7 days';
  we timestamptz := ws + interval '7 days';
  archive_id uuid;
  v_total      numeric;
  v_delivery   numeric;
  v_products   numeric;
  v_cost       numeric;
  v_profit     numeric;
  v_count      bigint;
  v_pickup     bigint;
  v_deliver    bigint;
  v_members    bigint;
  v_newcust    bigint;
  v_returncust bigint;
  v_cancelled_count bigint;
  v_cancelled_value numeric;
  v_top        jsonb;
  v_sales      jsonb;
begin
  select
    total_revenue, delivery_revenue, products_revenue,
    total_cost, gross_profit,
    orders_count, pickup_count, delivery_count,
    member_orders_count, new_customers_count, returning_customers_count,
    cancelled_orders_count, cancelled_orders_value
  into
    v_total, v_delivery, v_products,
    v_cost, v_profit,
    v_count, v_pickup, v_deliver,
    v_members, v_newcust, v_returncust,
    v_cancelled_count, v_cancelled_value
  from public.weekly_financial_summary(ws);

  select coalesce(jsonb_agg(jsonb_build_object(
           'product_id', t.product_id,
           'title', t.title,
           'units', t.units,
           'revenue', t.revenue,
           'cost', t.cost,
           'profit', t.profit
         )), '[]'::jsonb)
    into v_top
  from public.weekly_top_products_with_costs(ws, we) t;

  select coalesce(jsonb_agg(jsonb_build_object(
           'product_id', t.product_id,
           'title', t.title,
           'units', t.units,
           'revenue', t.revenue,
           'cost', t.cost,
           'profit', t.profit
         )), '[]'::jsonb)
    into v_sales
  from public.weekly_top_products_with_costs(ws, we) t
   order by t.profit desc;

  insert into public.weekly_archives (
    week_start, week_end,
    total_revenue, delivery_revenue, products_revenue,
    total_cost, gross_profit,
    orders_count, pickup_count, delivery_count,
    member_orders_count, new_customers_count, returning_customers_count,
    cancelled_orders_count, cancelled_orders_value,
    top_products, product_sales, snapshot
  ) values (
    ws, we,
    coalesce(v_total,0), coalesce(v_delivery,0), coalesce(v_products,0),
    coalesce(v_cost,0), coalesce(v_profit,0),
    coalesce(v_count,0)::int, coalesce(v_pickup,0)::int, coalesce(v_deliver,0)::int,
    coalesce(v_members,0)::int, coalesce(v_newcust,0)::int, coalesce(v_returncust,0)::int,
    coalesce(v_cancelled_count,0)::int, coalesce(v_cancelled_value,0),
    coalesce(v_top, '[]'::jsonb), coalesce(v_sales, '[]'::jsonb),
    jsonb_build_object('source','weekly_reset')
  )
  returning id into archive_id;

  update public.orders
     set status = 'archived'
   where created_at >= ws
     and created_at <  we
     and status <> 'archived'
     and status <> 'cancelled';

  -- No-op safety: re-enable all products for the new cycle.
  update public.products set is_active = true where is_active is null;

  return archive_id;
end;
$$;
