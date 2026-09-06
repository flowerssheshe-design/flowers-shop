-- ============================================================
-- 010_add_site_visits.sql
-- Adds: site_visits table and weekly visitor counting
-- ============================================================

create table if not exists public.site_visits (
  id uuid default gen_random_uuid() primary key,
  session_id text not null,
  created_at timestamptz default now()
);

create index if not exists idx_site_visits_created
  on public.site_visits(created_at desc);

create index if not exists idx_site_visits_session
  on public.site_visits(session_id);

alter table public.site_visits enable row level security;

drop policy if exists "site_visits_public_insert" on public.site_visits;
create policy "site_visits_public_insert"
  on public.site_visits for insert
  with check (true);

drop policy if exists "site_visits_admin_read" on public.site_visits;
create policy "site_visits_admin_read"
  on public.site_visits for select
  using (auth.role() = 'authenticated');

create or replace function public.weekly_visitor_count(week_start timestamptz default public.week_start_sunday())
returns bigint language sql stable as $$
  select count(distinct session_id)::bigint
  from public.site_visits
  where created_at >= week_start
    and created_at < week_start + interval '7 days';
$$;
