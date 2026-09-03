-- ============================================================
-- 002_profiles_and_auth.sql — User accounts & per-user orders
-- ============================================================

-- -----------------------------
-- profiles: 1-to-1 with auth.users
-- -----------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  address text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- -----------------------------
-- orders: add user_id (nullable for guest checkouts)
-- -----------------------------
alter table public.orders
  add column if not exists user_id uuid references public.profiles(id) on delete set null;

create index if not exists idx_orders_user
  on public.orders(user_id, created_at desc);

-- -----------------------------
-- Auto-create profile on signup
-- -----------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------
-- RLS
-- -----------------------------
alter table public.profiles enable row level security;

-- Users can read/update their own profile only.
drop policy if exists "profiles_self_read" on public.profiles;
create policy "profiles_self_read"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "profiles_self_update" on public.profiles;
create policy "profiles_self_update"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Allow insert from service-role / signup trigger (already bypasses RLS).

-- Orders: extend so logged-in users can read their own orders.
drop policy if exists "orders_self_read" on public.orders;
create policy "orders_self_read"
  on public.orders for select
  using (auth.uid() = user_id);

-- -----------------------------
-- Helpers
-- -----------------------------
create or replace function public.user_completed_order_count(uid uuid)
returns bigint
language sql
stable
as $$
  select count(*)::bigint
  from public.orders
  where user_id = uid
    and status in ('confirmed', 'completed');
$$;

create or replace function public.user_qualifies_for_member_price(uid uuid)
returns boolean
language sql
stable
as $$
  select public.user_completed_order_count(uid) > 3;
$$;