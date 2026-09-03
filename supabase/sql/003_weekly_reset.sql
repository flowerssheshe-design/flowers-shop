-- Run in Supabase SQL editor (one-time setup).
-- Schedule the weekly archive + reset to run every Sunday at 00:00 UTC.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Replace <project-ref> and <service-role-key> with your real values.
select cron.schedule(
  'weekly-reset',
  '0 0 * * 0', -- Sunday 00:00 server time
  $$
    select net.http_post(
      url := 'https://<project-ref>.supabase.co/functions/v1/weekly-reset',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer <service-role-key>'
      ),
      body := '{}'::jsonb
    );
  $$
);

-- Alternatively, if you don't have an edge function, schedule the SQL function
-- directly (requires pg_cron in the same DB, which Supabase provides):
-- select cron.schedule('weekly-reset-sql', '0 0 * * 0', $$ select public.weekly_reset(); $$);