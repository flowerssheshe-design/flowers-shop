-- ============================================================
-- 037_employee_roles_and_delete.sql
--
-- עברית:
--   1. אחריות ותפקיד הם שני דברים נפרדים: לעובד יכולות להיות כמה
--      אחריויות (מנהל ראשי / מנהל הזמנות ומשמרות / אחראי שיווק) וגם סוגי
--      עבודה (מוכר בדוכן / שליח / איסוף מהספק). roles שומר את כל
--      האחריויות; role נשאר "התפקיד הראשי" לתאימות לאחור.
--   2. מחיקת עובד: עובד שנמחק מוסתר מכל המסכים, לא יכול להתחבר, ומספר
--      הטלפון שלו מתפנה. ההיסטוריה (משמרות שעברו, שכר, מכירות) נשמרת.
--
-- English:
--   1. employees.roles holds every responsibility; employees.role stays as
--      the primary one (owner > ops_manager > marketing > worker).
--   2. Soft delete: deleted_at set, phone cleared (so it can be reused),
--      history rows keep pointing at the employee.
--
-- Run after 028. Idempotent.
-- ============================================================

alter table public.employees
  add column if not exists roles text[] not null default '{}',
  add column if not exists deleted_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'employees_roles_check') then
    alter table public.employees
      add constraint employees_roles_check
      check (roles <@ array['owner', 'ops_manager', 'marketing']::text[]);
  end if;
end
$$;

-- Existing employees: their single role becomes their responsibility.
update public.employees
set roles = array[role]
where roles = '{}' and role in ('owner', 'ops_manager', 'marketing');

-- A deleted employee frees the phone number.
alter table public.employees alter column phone drop not null;

create index if not exists idx_employees_not_deleted on public.employees(is_active) where deleted_at is null;
