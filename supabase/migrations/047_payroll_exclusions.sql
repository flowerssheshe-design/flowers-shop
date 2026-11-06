-- ============================================================
-- 047_payroll_exclusions.sql
--
-- עברית:
--   בדף התשלומים אפשר לסמן ✗ על חלק מהשכר של עובד בשבוע מסוים (למשל
--   "תוספת אחריות" שלא משלמים השבוע). חלק שסומן ✗ לא נספר במה שצריך לשלם.
--   part: 'base' (שכר השבוע), 'responsibility' (תוספת אחריות),
--   או 'entry:<id>' (שורה שנוספה ידנית).
--
-- English:
--   Pay parts skipped for one employee in one week. Server-only. Run after 046.
-- ============================================================

create table if not exists public.payroll_exclusions (
  week_start date not null,
  employee_id uuid not null references public.employees(id) on delete cascade,
  part text not null check (part in ('base', 'responsibility') or part like 'entry:%'),
  created_by uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (week_start, employee_id, part)
);

alter table public.payroll_exclusions enable row level security;
revoke all on public.payroll_exclusions from anon, authenticated;
