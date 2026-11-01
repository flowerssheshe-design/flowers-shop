-- ============================================================
-- 035_stall_writeoffs_distributions.sql
--
-- עברית:
--   שני יומנים לכלי העובדים:
--   - stall_writeoffs: פחת בדוכן ("פרח נפגע / נזרק"). מוריד מלאי בלי הזמנה,
--     ונשמר כאן כדי שהמנהל יראה מי רשם, מתי, כמה ולמה.
--   - stall_distributions: החלוקה של הבוקר מהמלאי הכללי לדוכנים (עובד האיסוף).
--   הטבלאות זמינות רק לשרת (service role).
--
-- English:
--   Logs for the worker tools: stall write-offs (stock removed without an
--   order) and the morning distribution from the general stock to stalls.
--   Server-only (service role). Run after 031. Idempotent.
-- ============================================================

create table if not exists public.stall_writeoffs (
  id uuid primary key default gen_random_uuid(),
  stall_id uuid not null references public.stalls(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  qty int not null check (qty > 0),
  reason text not null default '',
  employee_id uuid references public.employees(id) on delete set null,
  work_date date not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_stall_writeoffs_stall_date
  on public.stall_writeoffs(stall_id, work_date);

create table if not exists public.stall_distributions (
  id uuid primary key default gen_random_uuid(),
  stall_id uuid not null references public.stalls(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  qty int not null check (qty > 0),
  employee_id uuid references public.employees(id) on delete set null,
  work_date date not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_stall_distributions_date
  on public.stall_distributions(work_date, stall_id);

alter table public.stall_writeoffs enable row level security;
alter table public.stall_distributions enable row level security;

revoke all on public.stall_writeoffs from anon, authenticated;
revoke all on public.stall_distributions from anon, authenticated;
