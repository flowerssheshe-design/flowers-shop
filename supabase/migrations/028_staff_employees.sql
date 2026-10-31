-- ============================================================
-- 028_staff_employees.sql
--
-- עברית:
--   טבלת עובדים חדשה (public.employees) עבור מערכת הצוות.
--   כל עובד מזוהה לפי מספר טלפון (מנורמל לספרות מקומיות שמתחילות ב-0,
--   לדוגמה 0501234567) וקוד PIN מוצפן (pin_hash). התפקידים: owner,
--   ops_manager, marketing, worker. סוגי עבודה: מוכר/ת בדוכן, שליח/ה,
--   ומביא/ת סחורה. כולל שדות נעילה אחרי ניסיונות PIN שגויים.
--   RLS מופעל ללא אף מדיניות, והרשאות anon/authenticated נשללות לגמרי:
--   רק ה-service role (קוד השרת) יכול לקרוא/לכתוב לטבלה.
--
-- English:
--   New staff table for the employee system. Employees log in with a
--   normalized local phone number + PIN (only the hash is stored). Includes
--   lockout bookkeeping (failed_pin_attempts / locked_until).
--   RLS is enabled with NO policies and all privileges are revoked from
--   anon/authenticated, so only the service-role client (server code via
--   createAdminClient) can access it.
--
-- Idempotent: safe to re-run.
-- ============================================================

create table if not exists public.employees (
  id                  uuid primary key default gen_random_uuid(),
  full_name           text not null,
  phone               text not null unique
                        constraint employees_phone_format
                        check (phone ~ '^0[0-9]{8,9}$'),
  pin_hash            text not null,
  role                text not null
                        constraint employees_role_check
                        check (role in ('owner', 'ops_manager', 'marketing', 'worker')),
  work_types          text[] not null default '{}'
                        constraint employees_work_types_check
                        check (
                          work_types <@ array['stall_seller', 'courier', 'supply_runner']::text[]
                          and array_position(work_types, null) is null
                        ),
  pay_type            text null
                        constraint employees_pay_type_check
                        check (pay_type in ('hourly', 'per_shift', 'per_delivery')),
  pay_rate            numeric(10,2) null
                        constraint employees_pay_rate_check
                        check (pay_rate >= 0),
  is_active           boolean not null default true,
  failed_pin_attempts int not null default 0,
  locked_until        timestamptz null,
  last_login_at       timestamptz null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on table public.employees is 'עובדי הצוות (service role בלבד) / Staff employees (service role only)';
comment on column public.employees.phone is 'טלפון מנורמל, ספרות מקומיות שמתחילות ב-0 / normalized local digits, e.g. 0501234567';
comment on column public.employees.pin_hash is 'גיבוב של קוד ה-PIN, לעולם לא הקוד עצמו / hash of the PIN, never the raw PIN';

-- updated_at trigger (reuses public.set_updated_at() from 001)
drop trigger if exists trg_employees_updated_at on public.employees;
create trigger trg_employees_updated_at
  before update on public.employees
  for each row execute function public.set_updated_at();

-- RLS on, no policies => only service_role (bypasses RLS) can access.
alter table public.employees enable row level security;

revoke all on public.employees from anon, authenticated;
