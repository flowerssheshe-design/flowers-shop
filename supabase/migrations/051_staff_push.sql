-- Phone notifications for staff: a stall seller gets "new order" on Friday
-- while the stall is open. Separate from the customers' push_subscriptions
-- so marketing broadcasts never go to staff phones by mistake.

create table if not exists public.staff_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

create index if not exists staff_push_subscriptions_employee_idx on public.staff_push_subscriptions (employee_id);

alter table public.staff_push_subscriptions enable row level security;
revoke all on public.staff_push_subscriptions from anon, authenticated;
