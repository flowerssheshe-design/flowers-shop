-- ============================================================
-- 036_weekly_budget.sql
--
-- עברית:
--   תקציב שבועי לשכר מוכרי הדוכנים והשליח. המנהלים הראשיים קובעים סכום
--   לשבוע, ומנהל המשמרות מחלק אותו בין העובדים (גם לעצמו). המערכת לא
--   מאפשרת לחלק יותר מהתקציב.
--
-- English:
--   Weekly pay budget for stall sellers and the courier. Owners set an
--   amount per week; the ops manager splits it between workers (himself
--   included). Allocations may not exceed the budget (checked in the API).
--
-- Run after 031. Idempotent.
-- ============================================================

create table if not exists public.weekly_budgets (
  week_start date primary key,               -- Sunday
  amount numeric(10,2) not null check (amount >= 0),
  set_by uuid references public.employees(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.weekly_pay_allocations (
  week_start date not null,
  employee_id uuid not null references public.employees(id) on delete cascade,
  amount numeric(10,2) not null check (amount >= 0),
  note text,
  set_by uuid references public.employees(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (week_start, employee_id)
);

create index if not exists idx_weekly_pay_allocations_employee
  on public.weekly_pay_allocations(employee_id, week_start);

alter table public.weekly_budgets enable row level security;
alter table public.weekly_pay_allocations enable row level security;
revoke all on public.weekly_budgets from anon, authenticated;
revoke all on public.weekly_pay_allocations from anon, authenticated;
