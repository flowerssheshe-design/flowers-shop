-- Run in Supabase SQL editor (one-time setup).
-- Requires the supabase_admin role to schedule jobs.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Replace <project-ref> and <service-role-key> with your real values.
select cron.schedule(
  'weekly-reminder',
  '0 8 * * 4', -- Thursday 08:00 server time
  $$
    select net.http_post(
      url := 'https://<project-ref>.supabase.co/functions/v1/send-reminders',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer <service-role-key>'
      ),
      body := '{}'::jsonb
    );
  $$
);