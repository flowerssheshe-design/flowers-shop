-- ============================================================
-- 038_responsibility_pay.sql
--
-- עברית:
--   שכר על אחריות: סכום קבוע לכל שבוע עסקי למי שאחראי (מנהל הזמנות
--   ומשמרות / אחראי שיווק), בנוסף לשכר על העבודה. רק המנהלים הראשיים
--   קובעים אותו. מנהלים ראשיים לא מקבלים שכר, אז אצלם הערך נשאר ריק.
--
-- English:
--   employees.responsibility_pay: a fixed amount per business week for the
--   ops_manager / marketing responsibility, on top of pay for work. Null when
--   not set, for owners, and for people without those responsibilities.
--   Counted once per business week while the employee is active and not
--   deleted (money page, dashboard, payroll_weeks snapshots, "my area").
--
-- Run after 037. Idempotent.
-- ============================================================

alter table public.employees
  add column if not exists responsibility_pay numeric(10,2);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'employees_responsibility_pay_check') then
    alter table public.employees
      add constraint employees_responsibility_pay_check
      check (responsibility_pay is null or responsibility_pay >= 0);
  end if;
end
$$;

-- Owners are never paid.
update public.employees
set responsibility_pay = null
where responsibility_pay is not null
  and (role = 'owner' or 'owner' = any(roles));
