alter table if exists public.products
  add column if not exists cost_price numeric(10,2) not null default 0;
