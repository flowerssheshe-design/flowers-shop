-- ============================================================
-- 014_expenses_table.sql
-- Adds: expenses table for tracking business expenses
--       both one-time and recurring/fixed expenses
-- ============================================================

create table if not exists public.expenses (
  id uuid default gen_random_uuid() primary key,
  description text not null,
  amount numeric(12,2) not null check (amount >= 0),
  category text not null,
  expense_type text not null check (expense_type in ('one_time', 'recurring')),
  created_at timestamptz default now()
);

-- Enable RLS
alter table public.expenses enable row level security;

-- Admin can do anything
drop policy if exists "expenses_admin_all" on public.expenses;
create policy "expenses_admin_all"
  on public.expenses for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- Index for querying by expense_type
create index if not exists idx_expenses_type_created
  on public.expenses(expense_type, created_at desc);

-- Index for category queries
create index if not exists idx_expenses_category
  on public.expenses(category);

-- Trigger for updated_at (optional, for future use)
drop trigger if exists trg_expenses_updated_at on public.expenses;
create trigger trg_expenses_updated_at
  before update on public.expenses
  for each row execute function public.set_updated_at();