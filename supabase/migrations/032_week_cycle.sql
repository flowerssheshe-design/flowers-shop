-- ============================================================
-- 032_week_cycle.sql
--
-- עברית:
--   מחזור שבועי אוטומטי.
--   1. store_settings.mode יכול להיות 'auto' (ברירת המחדל החדשה),
--      'preorder' או 'realtime'. במצב auto האתר עובר לבד ממכירה מראש
--      למכירה בלייב במועד ההזמנה מהספק. 'preorder'/'realtime' הם כפייה
--      ידנית של המנהל.
--   2. business_weeks: עמודות לסגירה בטוחה של שבוע (נעילה למניעת סגירה
--      כפולה, וקישור לשורת הארכיון שנוצרה).
--   3. אינדקסים לשאילתות של מסך "השבוע עכשיו" ומסך הכסף.
--
-- English:
--   Automatic week cycle.
--   1. store_settings.mode may be 'auto' (new default), 'preorder' or
--      'realtime'. 'auto' follows the business-week phase; the other two are
--      a manual owner override.
--   2. business_weeks gets a close lock (close_started_at) and the id of the
--      weekly_archives row written when the week closed, so closing a week is
--      idempotent and safe to run twice.
--   3. Indexes for the owner dashboard / money queries.
--
-- Run after 031. Idempotent.
-- ============================================================

-- 1. Store mode: switch to automatic.
insert into public.store_settings (key, value)
values ('mode', '"auto"'::jsonb)
on conflict (key) do update
  set value = '"auto"'::jsonb, updated_at = now();

-- 2. Week close bookkeeping.
alter table public.business_weeks
  add column if not exists close_started_at timestamptz,
  add column if not exists archive_id uuid references public.weekly_archives(id) on delete set null;

comment on column public.business_weeks.close_started_at is
  'נעילה בזמן סגירת השבוע / lock taken while the week is being closed';
comment on column public.business_weeks.archive_id is
  'שורת הארכיון שנכתבה בסגירה / weekly_archives row written when the week closed';

-- 3. Indexes.
create index if not exists idx_orders_created_at on public.orders(created_at desc);
create index if not exists idx_orders_user_id on public.orders(user_id);
create index if not exists idx_orders_delivered_by on public.orders(delivered_by, delivered_at);
create index if not exists idx_payroll_weeks_week on public.payroll_weeks(week_start);
create index if not exists idx_business_weeks_open on public.business_weeks(week_start) where closed_at is null;

-- Server-only access (business_weeks is already locked down in 031; repeat to be safe).
alter table public.business_weeks enable row level security;
revoke all on public.business_weeks from anon, authenticated;
alter table public.payroll_weeks enable row level security;
revoke all on public.payroll_weeks from anon, authenticated;
