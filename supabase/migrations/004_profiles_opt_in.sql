-- ============================================================
-- 004_profiles_opt_in.sql
-- Adds notification opt-in flag to profiles (default true).
-- ============================================================

alter table public.profiles
  add column if not exists notification_opt_in boolean not null default true;

-- Also update the signup trigger so new users get the default.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, notification_opt_in)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce((new.raw_user_meta_data->>'notification_opt_in')::boolean, true)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;