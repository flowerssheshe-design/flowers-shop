-- ============================================================
-- 031_staff_operations.sql
--
-- עברית:
--   התשתית של מערכת הצוות: דוכנים, מלאי לכל דוכן, ציוד דוכן, משמרות,
--   שיבוץ שבועי (שליח), שבוע עסקי (לפני/אחרי ההזמנה מהספק), שורות הזמנה
--   לספק, סיכומי שכר, סוגי הזמנות, ושדות שיווק (קישורי מעקב, Push,
--   תבניות וואטסאפ). כל הטבלאות זמינות רק לשרת (service role).
--
-- English:
--   Staff-system foundation: stalls, per-stall stock, stall equipment
--   checklists, shifts, weekly assignments (courier), business weeks
--   (before/after the supplier order), supplier order lines, payroll
--   snapshots, order types, and marketing tables. Server-only (service role).
--
-- Run after 028–030. Idempotent.
-- ============================================================

-- ---------- Stalls ----------
create table if not exists public.stalls (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  location text,
  is_active boolean not null default true,
  is_open boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.stall_inventory (
  stall_id uuid not null references public.stalls(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  stock int not null default 0 check (stock >= 0),
  initial_stock int not null default 0 check (initial_stock >= 0),
  updated_at timestamptz not null default now(),
  primary key (stall_id, product_id)
);

-- Equipment every stall needs (gazebo, chair, cash box, bags, sprayers...).
create table if not exists public.stall_equipment_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.stall_equipment_items (name, sort_order)
select v.name, v.sort_order
from (values ('גזיבו', 1), ('כיסא', 2), ('קופת מזומן', 3), ('שקיות לפרחים', 4), ('ספריי מים', 5))
  as v(name, sort_order)
where not exists (select 1 from public.stall_equipment_items);

-- One row per open/close check of a stall on a given day.
create table if not exists public.stall_checklists (
  id uuid primary key default gen_random_uuid(),
  stall_id uuid not null references public.stalls(id) on delete cascade,
  employee_id uuid references public.employees(id) on delete set null,
  work_date date not null,
  kind text not null check (kind in ('open', 'close')),
  checked_item_ids uuid[] not null default '{}',
  notes text,
  created_at timestamptz not null default now(),
  unique (stall_id, work_date, kind)
);

-- ---------- Scheduling ----------
create table if not exists public.shifts (
  id uuid primary key default gen_random_uuid(),
  work_date date not null,
  start_time time not null,
  end_time time not null,
  shift_type text not null check (shift_type in ('stall', 'courier', 'supply')),
  stall_id uuid references public.stalls(id) on delete set null,
  employee_id uuid not null references public.employees(id) on delete cascade,
  notes text,
  created_by uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shifts_time_order check (end_time > start_time),
  constraint shifts_stall_required check (shift_type <> 'stall' or stall_id is not null)
);

create index if not exists idx_shifts_date on public.shifts(work_date);
create index if not exists idx_shifts_employee_date on public.shifts(employee_id, work_date);

-- Assignments that cover a whole week (one courier per week).
create table if not exists public.week_assignments (
  week_start date not null,
  assignment text not null check (assignment in ('courier')),
  employee_id uuid not null references public.employees(id) on delete cascade,
  created_by uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (week_start, assignment)
);

-- ---------- Business week and supplier order ----------
alter table public.products
  add column if not exists default_order_qty int not null default 0
    check (default_order_qty >= 0);

create table if not exists public.business_weeks (
  week_start date primary key,               -- Sunday
  supplier_order_at timestamptz not null,    -- planned cut-off (from settings)
  supplier_ordered_at timestamptz,           -- when the order was actually sent
  closed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.supplier_order_lines (
  week_start date not null references public.business_weeks(week_start) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  preorder_qty int not null default 0 check (preorder_qty >= 0),
  extra_qty int not null default 0 check (extra_qty >= 0),
  final_qty int not null default 0 check (final_qty >= 0),
  picked_up boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (week_start, product_id)
);

-- ---------- Orders: type and staff attribution ----------
alter table public.orders
  add column if not exists order_type text not null default 'preorder';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'orders_order_type_check'
  ) then
    alter table public.orders
      add constraint orders_order_type_check
      check (order_type in ('preorder', 'live', 'stall', 'manual'));
  end if;
end
$$;

alter table public.orders
  add column if not exists stall_id uuid references public.stalls(id) on delete set null,
  add column if not exists sold_by uuid references public.employees(id) on delete set null,
  add column if not exists approved_by uuid references public.employees(id) on delete set null,
  add column if not exists delivered_by uuid references public.employees(id) on delete set null,
  add column if not exists delivered_at timestamptz;

-- Stall sales used to be recognised only by text in notes / customer_name.
update public.orders
set order_type = 'stall'
where order_type = 'preorder'
  and (coalesce(notes, '') like '%מכירה בדוכן%' or trim(coalesce(customer_name, '')) = 'לקוח דוכן');

create index if not exists idx_orders_order_type_created on public.orders(order_type, created_at desc);

-- ---------- Payroll snapshots (written when a week closes) ----------
create table if not exists public.payroll_weeks (
  week_start date not null,
  employee_id uuid not null references public.employees(id) on delete cascade,
  hours numeric(8,2) not null default 0,
  shifts_count int not null default 0,
  deliveries_count int not null default 0,
  amount numeric(10,2) not null default 0,
  created_at timestamptz not null default now(),
  primary key (week_start, employee_id)
);

-- ---------- Marketing ----------
create table if not exists public.tracking_links (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,48}$'),
  name text not null,
  source text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.site_visits
  add column if not exists tracking_link_id uuid references public.tracking_links(id) on delete set null,
  add column if not exists landing_path text,
  add column if not exists referrer text;

alter table public.profiles
  add column if not exists signup_link_id uuid references public.tracking_links(id) on delete set null;

alter table public.orders
  add column if not exists tracking_link_id uuid references public.tracking_links(id) on delete set null;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.whatsapp_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,                     -- internal Hebrew name
  meta_template_name text,                -- name approved in Meta (null = free text, 24h window only)
  language text not null default 'he',
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.message_automations (
  kind text primary key check (kind in ('preorder_closing', 'order_thanks', 'win_back')),
  is_enabled boolean not null default false,
  template_id uuid references public.whatsapp_templates(id) on delete set null,
  config jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.message_log (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('whatsapp', 'push')),
  recipient text,
  template_id uuid references public.whatsapp_templates(id) on delete set null,
  status text not null check (status in ('sent', 'failed', 'skipped')),
  error text,
  created_at timestamptz not null default now()
);

-- ---------- Settings defaults ----------
insert into public.system_settings (key, value)
values
  ('supplier_order_day', '2'::jsonb),          -- 0=Sunday … 2=Tuesday
  ('supplier_order_time', '"12:00"'::jsonb),
  ('week_close_day', '6'::jsonb),              -- Saturday
  ('week_close_time', '"21:00"'::jsonb),
  ('stall_bit_number', '""'::jsonb),
  ('stall_bit_qr_url', '""'::jsonb),
  ('stall_hours', '"שישי 08:00-14:00"'::jsonb)
on conflict (key) do nothing;

-- ---------- Stall stock RPC (atomic) ----------
-- Adds p_delta (negative to sell) to a stall's stock; returns the new stock,
-- or null when it would go below zero.
create or replace function public.stall_stock_adjust(p_stall uuid, p_product uuid, p_delta int)
returns int
language plpgsql
as $$
declare
  new_stock int;
begin
  insert into public.stall_inventory (stall_id, product_id, stock, initial_stock)
  values (p_stall, p_product, 0, 0)
  on conflict (stall_id, product_id) do nothing;

  update public.stall_inventory
  set stock = stock + p_delta, updated_at = now()
  where stall_id = p_stall and product_id = p_product and stock + p_delta >= 0
  returning stock into new_stock;

  return new_stock;
end
$$;

revoke execute on function public.stall_stock_adjust(uuid, uuid, int) from public, anon, authenticated;
grant execute on function public.stall_stock_adjust(uuid, uuid, int) to service_role;

-- ---------- updated_at triggers ----------
drop trigger if exists trg_stalls_updated_at on public.stalls;
create trigger trg_stalls_updated_at before update on public.stalls
  for each row execute function public.set_updated_at();

drop trigger if exists trg_shifts_updated_at on public.shifts;
create trigger trg_shifts_updated_at before update on public.shifts
  for each row execute function public.set_updated_at();

drop trigger if exists trg_whatsapp_templates_updated_at on public.whatsapp_templates;
create trigger trg_whatsapp_templates_updated_at before update on public.whatsapp_templates
  for each row execute function public.set_updated_at();

-- ---------- Server-only access ----------
do $$
declare
  t text;
begin
  foreach t in array array[
    'stalls', 'stall_inventory', 'stall_equipment_items', 'stall_checklists',
    'shifts', 'week_assignments', 'business_weeks', 'supplier_order_lines',
    'payroll_weeks', 'tracking_links', 'push_subscriptions',
    'whatsapp_templates', 'message_automations', 'message_log'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end
$$;
