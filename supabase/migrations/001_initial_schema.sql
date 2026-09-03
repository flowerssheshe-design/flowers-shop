-- ============================================================
-- 001_initial_schema.sql — Flower Shop MVP
-- ============================================================

create extension if not exists "pgcrypto";

-- -----------------------------
-- Tables
-- -----------------------------

create table if not exists public.products (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  description text,
  price_standard numeric(10,2) not null,
  price_member numeric(10,2) not null,
  image_url text,
  is_active boolean default true,
  sort_order integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.orders (
  id uuid default gen_random_uuid() primary key,
  customer_name text not null,
  customer_phone text not null,
  delivery_address text,
  items jsonb not null,
  total_amount numeric(10,2) not null,
  delivery_type text not null check (delivery_type in ('pickup','delivery')),
  delivery_fee numeric(10,2) default 0,
  is_member boolean default false,
  notes text,
  status text default 'pending' check (status in ('pending','confirmed','completed','cancelled')),
  created_at timestamptz default now()
);

create table if not exists public.site_config (
  key text primary key,
  value text not null
);

-- -----------------------------
-- Indexes
-- -----------------------------

create index if not exists idx_products_active_sort
  on public.products(is_active, sort_order);

create index if not exists idx_orders_created
  on public.orders(created_at desc);

-- -----------------------------
-- updated_at trigger for products
-- -----------------------------

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_products_updated_at on public.products;
create trigger trg_products_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

-- -----------------------------
-- Row Level Security
-- -----------------------------

alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.site_config enable row level security;

-- products: anyone can read active rows; admin can do anything
drop policy if exists "products_public_read" on public.products;
create policy "products_public_read"
  on public.products for select
  using (true);

drop policy if exists "products_admin_write" on public.products;
create policy "products_admin_write"
  on public.products for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- orders: anyone can insert; admin can read/update
drop policy if exists "orders_public_insert" on public.orders;
create policy "orders_public_insert"
  on public.orders for insert
  with check (true);

drop policy if exists "orders_admin_read" on public.orders;
create policy "orders_admin_read"
  on public.orders for select
  using (auth.role() = 'authenticated');

drop policy if exists "orders_admin_update" on public.orders;
create policy "orders_admin_update"
  on public.orders for update
  using (auth.role() = 'authenticated');

-- site_config: anyone can read (admin pin lookup)
drop policy if exists "site_config_public_read" on public.site_config;
create policy "site_config_public_read"
  on public.site_config for select
  using (true);

drop policy if exists "site_config_admin_write" on public.site_config;
create policy "site_config_admin_write"
  on public.site_config for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- -----------------------------
-- Seed: admin PIN placeholder
-- Change value to your real PIN before going to production.
-- -----------------------------
insert into public.site_config (key, value) values ('admin_pin', '1234')
  on conflict (key) do nothing;

-- -----------------------------
-- Storage: product-images bucket (public read)
-- Run separately in Supabase SQL editor if you prefer UI:
--   create bucket 'product-images' with public = true
-- -----------------------------

-- -----------------------------
-- Supplier weekly aggregation (used by admin dashboard)
-- Aggregates qty per product across non-cancelled orders since Sunday 00:00.
-- -----------------------------
create or replace function public.supplier_week_aggregate()
returns table (product_id uuid, title text, total_qty bigint)
language sql
stable
as $$
  with exploded as (
    select
      (item->>'productId')::uuid as product_id,
      (item->>'qty')::int as qty,
      (item->>'title') as title
    from public.orders o,
         jsonb_array_elements(o.items) as item
    where o.created_at >= date_trunc('week', now())
      and o.status <> 'cancelled'
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