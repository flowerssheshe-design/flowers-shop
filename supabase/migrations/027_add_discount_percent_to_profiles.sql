-- ============================================================
-- 027_add_customer_status_to_profiles.sql
-- Adds customer status field to profiles for manual override.
-- ============================================================

create type public.customer_status as enum ('regular', 'returning');

alter table public.profiles
  add column if not exists customer_status public.customer_status not null default 'regular';

comment on column public.profiles.customer_status is 'סטטוס לקוח: regular=רגיל, returning=קבוע';