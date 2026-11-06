-- ============================================================
-- 046_payments_supply_requests.sql
--
-- עברית:
--   1. payroll_payments: "שולם" — כמה כסף שולם בפועל לעובד על שבוע מסוים.
--      אפשר כמה תשלומים לאותו שבוע (תשלום חלקי), ואפשר למחוק תשלום שנרשם בטעות.
--   2. supplier_order_lines: כמה הגיע בפועל מהספק (received_qty) וכמה
--      שולם לכל זר (unit_cost). השליח מהספק מעדכן, והמלאי ועלות הספק
--      מתעדכנים לפי זה.
--   3. products.show_on_site: האם הזר מופיע באתר. זר שהשליח מהספק יוצר
--      לא מופיע באתר עד שהמנהל מפעיל אותו. זרים קיימים ממשיכים להופיע.
--   4. staff_requests: פניות של עובדים למנהל הראשי.
--
-- English:
--   Paid amounts per employee/week, supplier receipts (actual qty and unit
--   cost), a "show on website" flag for products, and staff requests to the
--   owners. Server-only tables. Run after 045. Idempotent.
-- ============================================================

-- ---------- 1. Payments ----------
create table if not exists public.payroll_payments (
  id uuid primary key default gen_random_uuid(),
  week_start date not null,
  employee_id uuid not null references public.employees(id) on delete cascade,
  amount numeric(10,2) not null check (amount > 0),
  note text,
  paid_by uuid references public.employees(id) on delete set null,
  paid_at timestamptz not null default now()
);

create index if not exists idx_payroll_payments_employee on public.payroll_payments(employee_id, week_start);
create index if not exists idx_payroll_payments_paid_at on public.payroll_payments(paid_at);

alter table public.payroll_payments enable row level security;
revoke all on public.payroll_payments from anon, authenticated;

-- ---------- 2. Supplier receipts ----------
alter table public.supplier_order_lines
  add column if not exists received_qty int check (received_qty >= 0);
alter table public.supplier_order_lines
  add column if not exists unit_cost numeric(10,2) check (unit_cost >= 0);

-- ---------- 3. Show on website ----------
alter table public.products
  add column if not exists show_on_site boolean not null default true;

-- ---------- 4. Staff requests ----------
create table if not exists public.staff_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid references public.employees(id) on delete set null,
  body text not null check (char_length(body) between 2 and 2000),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.employees(id) on delete set null,
  reply text
);

create index if not exists idx_staff_requests_open on public.staff_requests(created_at) where resolved_at is null;

alter table public.staff_requests enable row level security;
revoke all on public.staff_requests from anon, authenticated;
