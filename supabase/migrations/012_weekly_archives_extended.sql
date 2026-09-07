-- ============================================================
-- 012_weekly_archives_extended.sql
-- Extends weekly_archives with detailed cycle metrics,
-- replaces weekly_reset() with inventory-aware version.
-- ============================================================

-- -----------------------------
-- Extend weekly_archives table
-- -----------------------------
alter table public.weekly_archives
  add column if not exists archived_at timestamptz default now(),
  add column if not exists week_label text,
  add column if not exists preorders_count integer default 0,
  add column if not exists preorders_revenue numeric(12,2) default 0,
  add column if not exists preorders_profit numeric(12,2) default 0,
  add column if not exists stall_sales_count integer default 0,
  add column if not exists stall_revenue numeric(12,2) default 0,
  add column if not exists stall_profit numeric(12,2) default 0,
  add column if not exists total_supplier_cost numeric(12,2) default 0,
  add column if not exists total_net_profit numeric(12,2) default 0,
  add column if not exists snapshot_data jsonb default '{}'::jsonb;

-- -----------------------------
-- Updated weekly_reset function
-- Archives previous week, archives orders, resets inventory live stock,
-- and records detailed pre-order / stall-sale breakdown.
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

  v_preorder_count bigint;
  v_preorder_revenue numeric;
  v_preorder_cost numeric;
  v_preorder_profit numeric;

  v_stall_count bigint;
  v_stall_revenue numeric;
  v_stall_cost numeric;
  v_stall_profit numeric;

  v_top jsonb;
  v_sales jsonb;
  v_snapshot jsonb;
begin
  -- Overall financial summary
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

  -- Pre-order count and revenue
  select count(*), coalesce(sum(total_amount), 0)
  into v_preorder_count, v_preorder_revenue
  from public.orders o
  where o.created_at >= ws
    and o.created_at < we
    and o.status <> 'cancelled'
    and o.status <> 'archived'
    and o.customer_phone <> '';

  -- Pre-order cost
  select coalesce(sum((item->>'qty')::int * p.cost_price), 0)
  into v_preorder_cost
  from public.orders o,
       jsonb_array_elements(o.items) as item
  join public.products p on p.id = (item->>'productId')::uuid
  where o.created_at >= ws
    and o.created_at < we
    and o.status <> 'cancelled'
    and o.status <> 'archived'
    and o.customer_phone <> '';

  v_preorder_profit := coalesce(v_preorder_revenue, 0) - coalesce(v_preorder_cost, 0);

  -- Stall sale count and revenue
  select count(*), coalesce(sum(total_amount), 0)
  into v_stall_count, v_stall_revenue
  from public.orders o
  where o.created_at >= ws
    and o.created_at < we
    and o.status <> 'cancelled'
    and o.status <> 'archived'
    and o.customer_phone = '';

  -- Stall sale cost
  select coalesce(sum((item->>'qty')::int * p.cost_price), 0)
  into v_stall_cost
  from public.orders o,
       jsonb_array_elements(o.items) as item
  join public.products p on p.id = (item->>'productId')::uuid
  where o.created_at >= ws
    and o.created_at < we
    and o.status <> 'cancelled'
    and o.status <> 'archived'
    and o.customer_phone = '';

  v_stall_profit := coalesce(v_stall_revenue, 0) - coalesce(v_stall_cost, 0);

  -- Top products by units
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

  -- Top products by profit
  select coalesce(jsonb_agg(jsonb_build_object(
           'product_id', t.product_id,
           'title', t.title,
           'units', t.units,
           'revenue', t.revenue,
           'cost', t.cost,
           'profit', t.profit
         )), '[]'::jsonb)
    into v_sales
  from public.weekly_top_products_with_costs(ws, we) t;

  -- Build detailed snapshot data
  v_snapshot := jsonb_build_object(
    'preorders', jsonb_build_object(
      'count', coalesce(v_preorder_count, 0),
      'revenue', coalesce(v_preorder_revenue, 0),
      'profit', coalesce(v_preorder_profit, 0)
    ),
    'stall_sales', jsonb_build_object(
      'count', coalesce(v_stall_count, 0),
      'revenue', coalesce(v_stall_revenue, 0),
      'profit', coalesce(v_stall_profit, 0)
    ),
    'supplier_cost', coalesce(v_cost, 0),
    'net_profit', coalesce(v_profit, 0),
    'archived_at', now()
  );

  -- Insert archive row
  insert into public.weekly_archives (
    week_start, week_end, archived_at, week_label,
    total_revenue, delivery_revenue, products_revenue,
    total_cost, gross_profit,
    orders_count, pickup_count, delivery_count,
    member_orders_count, new_customers_count, returning_customers_count,
    cancelled_orders_count, cancelled_orders_value,
    preorders_count, preorders_revenue, preorders_profit,
    stall_sales_count, stall_revenue, stall_profit,
    total_supplier_cost, total_net_profit,
    top_products, product_sales, snapshot_data
  ) values (
    ws, we, now(), 'סבב - ' || to_char(ws, 'DD/MM/YYYY'),
    coalesce(v_total,0), coalesce(v_delivery,0), coalesce(v_products,0),
    coalesce(v_cost,0), coalesce(v_profit,0),
    coalesce(v_count,0)::int, coalesce(v_pickup,0)::int, coalesce(v_deliver,0)::int,
    coalesce(v_members,0)::int, coalesce(v_newcust,0)::int, coalesce(v_returncust,0)::int,
    coalesce(v_cancelled_count,0)::int, coalesce(v_cancelled_value,0),
    coalesce(v_preorder_count,0)::int, coalesce(v_preorder_revenue,0), coalesce(v_preorder_profit,0),
    coalesce(v_stall_count,0)::int, coalesce(v_stall_revenue,0), coalesce(v_stall_profit,0),
    coalesce(v_cost,0), coalesce(v_profit,0),
    coalesce(v_top, '[]'::jsonb), coalesce(v_sales, '[]'::jsonb),
    coalesce(v_snapshot, '{}'::jsonb)
  )
  returning id into archive_id;

  -- Archive orders from the completed week
  update public.orders
     set status = 'archived'
   where created_at >= ws
     and created_at <  we
     and status <> 'archived'
     and status <> 'cancelled';

  -- Reset live stock to 0 for the new cycle
  update public.inventory i
     set live_stock_count = 0,
         updated_at = now()
   where exists (
     select 1 from public.products p
      where p.id = i.product_id
        and p.is_active = true
   );

  -- Re-enable all products
  update public.products set is_active = true where is_active is null;

  return archive_id;
end;
$$;
