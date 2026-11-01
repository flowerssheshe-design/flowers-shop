-- ============================================================
-- 039_payroll_history.sql
--
-- עברית:
--   היסטוריית שכר ותשלומים חד-פעמיים.
--
--   1. employee_pay_history: כל שינוי שכר נשמר עם השבוע שממנו הוא חל
--      (effective_week, יום ראשון). שבוע משולם לפי ההגדרה האחרונה שה-
--      effective_week שלה <= השבוע. כך שינוי שכר לא משנה שבועות קודמים:
--      אם שילמו 3 שבועות 150 ורק אז שינו ל-200, שלושת השבועות נשארים 150.
--      לכל עובד קיים (שאינו מנהל ראשי ויש לו ערך כלשהו) נוצרת שורת פתיחה
--      מ-2000-01-02 עם השכר שמופיע היום בכרטיס העובד.
--
--   2. payroll_entries: תשלומים חד-פעמיים (בונוס, תוספת) לשבוע מסוים.
--
--   3. העברת שכר מההוצאות: במערכת הישנה שכר נרשם כהוצאה בקטגוריה
--      'salaries'. כל שורה כזאת עוברת ל-payroll_entries (source =
--      'migrated_expense', בלי עובד, התיאור = תיאור ההוצאה):
--        * הוצאה חד-פעמית  -> תשלום אחד בשבוע של expense_date.
--        * הוצאה קבועה פעילה -> תשלום אחד לכל שבוע, מהשבוע של expense_date
--          ועד השבוע האחרון לפני מערכת השכר החדשה (שבועות לפני 2026-11-01).
--        * הוצאה קבועה לא פעילה לא נספרה באף שבוע, ולכן לא עוברת.
--      אחרי ההעברה שורות ה-'salaries' נמחקות מ-expenses, כדי שהשכר לא
--      ייספר פעמיים (פעם כהוצאה ופעם כשכר).
--      לפי הנתונים היום:
--        "עובד דוכן" 150 קבועה מ-2026-10-08  -> 4 שבועות: 04.10, 11.10, 18.10, 25.10
--        "תוספת לשובי" 100 חד-פעמית 16.10     -> שבוע 11.10
--        "עובד נוסף בדוכן" 150 קבועה מ-30.10 -> שבוע 25.10
--
--   weekly_archives (טבלה ישנה של דפי /admin) לא משתנה.
--
-- English:
--   employee_pay_history: pay settings per employee per effective week (a
--   Sunday). A week is paid with the latest row whose effective_week <= it,
--   so a change never rewrites earlier weeks. Seeded from the current
--   employees.pay_type / pay_rate / responsibility_pay at 2000-01-02.
--   payroll_entries: one-off payments for a week. Old 'salaries' expenses
--   are moved here (one row per week they counted in) and then deleted from
--   expenses.
--
-- Run after 038. Idempotent.
-- ============================================================

-- ---------- 1. Pay history ----------
create table if not exists public.employee_pay_history (
  employee_id uuid not null references public.employees(id) on delete cascade,
  effective_week date not null,
  pay_type text null check (pay_type in ('hourly', 'per_shift')),
  pay_rate numeric(10,2) null check (pay_rate >= 0),
  responsibility_pay numeric(10,2) null check (responsibility_pay >= 0),
  created_by uuid null references public.employees(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (employee_id, effective_week)
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'employee_pay_history_sunday_check') then
    alter table public.employee_pay_history
      add constraint employee_pay_history_sunday_check
      check (extract(dow from effective_week) = 0);
  end if;
end
$$;

alter table public.employee_pay_history enable row level security;
revoke all on public.employee_pay_history from anon, authenticated;

-- Seed: what every employee is paid today applies from the beginning.
-- Owners are never paid; rows with nothing set are skipped.
insert into public.employee_pay_history (employee_id, effective_week, pay_type, pay_rate, responsibility_pay)
select
  e.id,
  date '2000-01-02',
  case when e.pay_type in ('hourly', 'per_shift') then e.pay_type else null end,
  case when e.pay_rate is not null and e.pay_rate >= 0 then e.pay_rate else null end,
  case when e.responsibility_pay is not null and e.responsibility_pay >= 0 then e.responsibility_pay else null end
from public.employees e
where not (e.role = 'owner' or 'owner' = any(coalesce(e.roles, '{}'::text[])))
  and (e.pay_type is not null or e.pay_rate is not null or e.responsibility_pay is not null)
on conflict (employee_id, effective_week) do nothing;

-- ---------- 2. One-off payments ----------
create table if not exists public.payroll_entries (
  id uuid primary key default gen_random_uuid(),
  week_start date not null,
  employee_id uuid null references public.employees(id) on delete set null,
  description text not null,
  amount numeric(10,2) not null check (amount >= 0),
  source text not null default 'manual' check (source in ('manual', 'migrated_expense')),
  created_by uuid null references public.employees(id) on delete set null,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'payroll_entries_sunday_check') then
    alter table public.payroll_entries
      add constraint payroll_entries_sunday_check
      check (extract(dow from week_start) = 0);
  end if;
end
$$;

create index if not exists idx_payroll_entries_week on public.payroll_entries(week_start);
create index if not exists idx_payroll_entries_employee on public.payroll_entries(employee_id, week_start);

alter table public.payroll_entries enable row level security;
revoke all on public.payroll_entries from anon, authenticated;

-- ---------- 3. Move old salary expenses into payroll_entries ----------
-- One-time: the Sunday of expense_date.
-- Recurring (active): every Sunday from the week of expense_date up to the
-- last week before the new pay system (week_start < 2026-11-01).
-- A (week, description) pair that was already moved is never inserted twice.
with salary as (
  select
    e.description,
    e.amount,
    e.expense_type,
    coalesce(e.is_active, true) as is_active,
    (e.expense_date - extract(dow from e.expense_date)::int) as start_week
  from public.expenses e
  where e.category = 'salaries'
    and e.expense_date is not null
),
weeks as (
  select s.start_week as week_start, s.description, s.amount
  from salary s
  where s.expense_type = 'one_time'
  union all
  select g::date as week_start, s.description, s.amount
  from salary s
  cross join lateral generate_series(s.start_week::timestamp, timestamp '2026-10-25', interval '7 days') as g
  where s.expense_type = 'recurring'
    and s.is_active
)
insert into public.payroll_entries (week_start, employee_id, description, amount, source)
select w.week_start, null, w.description, w.amount, 'migrated_expense'
from weeks w
where not exists (
  select 1
  from public.payroll_entries p
  where p.source = 'migrated_expense'
    and p.week_start = w.week_start
    and p.description = w.description
);

delete from public.expenses where category = 'salaries';
