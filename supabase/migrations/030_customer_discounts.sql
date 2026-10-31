-- ============================================================
-- 030_customer_discounts.sql
--
-- עברית:
--   הוספת הנחה אישית ללקוח (discount_percent, 0–100 אחוז) והערות פנימיות
--   של ההנהלה (admin_notes) לטבלת profiles. העמודה customer_status כבר
--   קיימת ממיגרציה 027. הלקוחות לא יכולים לשנות את השדות האלה כי
--   המדיניות profiles_self_update הוסרה במיגרציה 029 — רק השרת (service
--   role) מעדכן אותם.
--
-- English:
--   Add a per-customer discount (discount_percent, 0–100) and internal
--   admin notes to public.profiles. customer_status already exists (027).
--   Customers cannot change these: profiles_self_update was dropped in 029,
--   so only the service role can write them.
--
-- Idempotent: safe to re-run.
-- ============================================================

alter table public.profiles
  add column if not exists discount_percent numeric(5,2) not null default 0
    constraint profiles_discount_percent_range
    check (discount_percent >= 0 and discount_percent <= 100);

alter table public.profiles
  add column if not exists admin_notes text;

-- Hide admin_notes from customers. profiles_self_read lets a customer read
-- their own row, so limit what anon/authenticated may select to explicit
-- columns (a column-level REVOKE alone does not override a table grant).
revoke select on public.profiles from anon, authenticated;
grant select (
  id, full_name, phone, address, notification_opt_in,
  customer_status, discount_percent, created_at, updated_at
) on public.profiles to authenticated;

comment on column public.profiles.discount_percent is 'הנחה אישית באחוזים (0–100) / personal discount percent (0–100)';
comment on column public.profiles.admin_notes is 'הערות פנימיות של ההנהלה, לא מוצגות ללקוח / internal admin notes, not shown to the customer';
