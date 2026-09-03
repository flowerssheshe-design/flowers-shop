-- ============================================================
-- 003_stats_history_users.sql
-- Adds: stats helpers, weekly_archives, weekly reset job support,
--       supplier aggregation keyed off status, and user deletion helper.
-- ============================================================

-- -----------------------------
-- Extend orders.status with 'archived'
-- -----------------------------
alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders
  add constraint orders_status_check
  check (status in ('pending','confirmed','completed','cancelled','archived'));

create index if not exists idx_orders_status_created
  on public.orders(status, created_at desc);

create index if not exists idx_orders_is_member
  on public.orders(is_member);

create index if not exists idx_orders_delivery_type
  on public.orders(delivery_type);

-- -----------------------------
-- weekly_archives table
-- -----------------------------
create table if not exists public.weekly_archives (
  id uuid default gen_random_uuid() primary key,
  week_start timestamptz not null,
  week_end timestamptz not null,
  total_revenue numeric(12,2) default 0,
  delivery_revenue numeric(12,2) default 0,
  products_revenue numeric(12,2) default 0,
  orders_count integer default 0,
  pickup_count integer default 0,
  delivery_count integer default 0,
  member_orders_count integer default 0,
  new_customers_count integer default 0,
  returning_customers_count integer default 0,
  top_products jsonb default '[]'::jsonb,
  product_sales jsonb default '[]'::jsonb,
  snapshot jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create unique index if not exists idx_weekly_archives_week_start
  on public.weekly_archives(week_start);

-- -----------------------------
-- Helper: current week start (Sunday 00:00 UTC)
-- -----------------------------
create or replace function public.week_start_sunday(d timestamptz default now())
returns timestamptz language sql immutable as $$
  select date_trunc('week', d at time zone 'utc') at time zone 'utc'
$$;

-- -----------------------------
-- Supplier aggregation: ignore archived
-- -----------------------------
create or replace function public.supplier_week_aggregate()
returns table (product_id uuid, title text, total_qty bigint)
language sql stable as $$
  with exploded as (
    select
      (item->>'productId')::uuid as product_id,
      (item->>'qty')::int as qty,
      (item->>'title') as title
    from public.orders o,
         jsonb_array_elements(o.items) as item
    where o.created_at >= public.week_start_sunday()
      and o.status <> 'cancelled'
      and o.status <> 'archived'
  )
  select
    p.id as product_id,
    coalesce(max(e.title), p.title) as title,
    coalesce(sum(e.qty), 0)::bigint as total_qty
  from public.products p
  left join exploded e on e.product_id = p.id
  group by p.id, p.title
  having coalesce(sum(e.qty), 0) > 0
  order by total_qty desc;
$$;

-- -----------------------------
-- Weekly stats aggregator (current week)
-- Returns: total_revenue, delivery_revenue, products_revenue,
--          orders_count, pickup_count, delivery_count,
--          member_orders_count, new_customers_count, returning_customers_count
-- -----------------------------
create or replace function public.weekly_stats(week_start timestamptz default public.week_start_sunday())
returns table (
  total_revenue numeric,
  delivery_revenue numeric,
  products_revenue numeric,
  orders_count bigint,
  pickup_count bigint,
  delivery_count bigint,
  member_orders_count bigint,
  new_customers_count bigint,
  returning_customers_count bigint,
  avg_order_value numeric
)
language sql stable as $$
  with wk as (
    select *
    from public.orders o
    where o.created_at >= week_start
      and o.created_at <  week_start + interval '7 days'
      and o.status <> 'cancelled'
      and o.status <> 'archived'
  )
  select
    coalesce(sum(wk.total_amount), 0)::numeric as total_revenue,
    coalesce(sum(wk.delivery_fee), 0)::numeric   as delivery_revenue,
    coalesce(sum(wk.total_amount - wk.delivery_fee), 0)::numeric as products_revenue,
    count(*)::bigint                              as orders_count,
    count(*) filter (where wk.delivery_type = 'pickup')::bigint    as pickup_count,
    count(*) filter (where wk.delivery_type = 'delivery')::bigint  as delivery_count,
    count(*) filter (where wk.is_member)::bigint   as member_orders_count,
    -- "new" = customer with no completed/confirmed order prior to week_start
    count(distinct wk.customer_phone) filter (
      where not exists (
        select 1 from public.orders prior
        where prior.customer_phone = wk.customer_phone
          and prior.created_at < week_start
          and prior.status in ('confirmed','completed')
      )
    )::bigint as new_customers_count,
    count(distinct wk.customer_phone) filter (
      where exists (
        select 1 from public.orders prior
        where prior.customer_phone = wk.customer_phone
          and prior.created_at < week_start
          and prior.status in ('confirmed','completed')
      )
    )::bigint as returning_customers_count,
    case
      when count(*) = 0 then 0::numeric
      else round(coalesce(sum(wk.total_amount),0)::numeric / count(*), 2)
    end as avg_order_value
  from wk;
$$;

-- -----------------------------
-- Top-selling products in a week range
-- -----------------------------
create or replace function public.weekly_top_products(
  week_start timestamptz,
  week_end timestamptz
)
returns table (
  product_id uuid,
  title text,
  units bigint,
  revenue numeric
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
      and o.created_at <  week_end
      and o.status <> 'cancelled'
      and o.status <> 'archived'
  )
  select
    product_id,
    max(title) as title,
    sum(qty)::bigint as units,
    sum(qty * unit_price)::numeric as revenue
  from exploded
  group by product_id
  order by units desc
  limit 50;
$$;

-- -----------------------------
-- Weekly reset function
--   1) snapshot current week into weekly_archives
--   2) mark orders as archived
--   3) clear active carts (we don't use them but keep for safety)
--   4) reactivate all products (in case admin disabled any)
-- Returns the archive row id.
-- -----------------------------
create or replace function public.weekly_reset()
returns uuid
language plpgsql
as $$
declare
  ws timestamptz := public.week_start_sunday();
  we timestamptz := ws + interval '7 days';
  archive_id uuid;
  v_total      numeric;
  v_delivery   numeric;
  v_products   numeric;
  v_count      bigint;
  v_pickup     bigint;
  v_deliver    bigint;
  v_members    bigint;
  v_newcust    bigint;
  v_returncust bigint;
  v_top        jsonb;
  v_sales      jsonb;
begin
  select
    total_revenue, delivery_revenue, products_revenue,
    orders_count, pickup_count, delivery_count,
    member_orders_count, new_customers_count, returning_customers_count
  into
    v_total, v_delivery, v_products,
    v_count, v_pickup, v_deliver,
    v_members, v_newcust, v_returncust
  from public.weekly_stats(ws);

  select coalesce(jsonb_agg(jsonb_build_object(
           'product_id', t.product_id,
           'title', t.title,
           'units', t.units,
           'revenue', t.revenue
         )), '[]'::jsonb)
    into v_top
  from public.weekly_top_products(ws, we) t;

  select coalesce(jsonb_agg(jsonb_build_object(
           'product_id', t.product_id,
           'title', t.title,
           'units', t.units,
           'revenue', t.revenue
         )), '[]'::jsonb)
    into v_sales
  from public.weekly_top_products(ws, we) t
  order by t.revenue desc;

  insert into public.weekly_archives (
    week_start, week_end,
    total_revenue, delivery_revenue, products_revenue,
    orders_count, pickup_count, delivery_count,
    member_orders_count, new_customers_count, returning_customers_count,
    top_products, product_sales, snapshot
  ) values (
    ws, we,
    coalesce(v_total,0), coalesce(v_delivery,0), coalesce(v_products,0),
    coalesce(v_count,0)::int, coalesce(v_pickup,0)::int, coalesce(v_deliver,0)::int,
    coalesce(v_members,0)::int, coalesce(v_newcust,0)::int, coalesce(v_returncust,0)::int,
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

-- -----------------------------
-- Ensure a profile row exists for an auth user
-- -----------------------------
create or replace function public.ensure_profile(uid uuid)
returns void language sql as $$
  insert into public.profiles (id, full_name, phone, address)
  values (uid, '', null, null)
  on conflict (id) do nothing;
$$;

-- -----------------------------
-- RLS for weekly_archives: admin only
-- -----------------------------
alter table public.weekly_archives enable row level security;

drop policy if exists "weekly_archives_admin_all" on public.weekly_archives;
create policy "weekly_archives_admin_all"
  on public.weekly_archives for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');