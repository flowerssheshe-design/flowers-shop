-- ============================================================
-- 033_marketing_message_log.sql
--
-- עברית:
--   יומן ההודעות (message_log) מקבל שדות שמונעים שליחה כפולה של הודעות
--   אוטומטיות: סוג ההודעה (kind), מפתח ייחודי (ref, למשל
--   "order_thanks:<מזהה הזמנה>") והלקוח (user_id). השליחה "תופסת" את
--   המפתח בשורה במצב pending לפני השליחה, כך שגם שתי ריצות במקביל לא
--   ישלחו פעמיים. שליחה שנכשלה משחררת את המפתח לניסיון חוזר.
--
-- English:
--   message_log gets kind / ref / user_id so automations are idempotent:
--   a sender claims `ref` by inserting a 'pending' row before sending
--   (unique while pending or sent), then marks it sent/failed. A failed
--   send frees the ref for a retry.
--
-- Run after 031. Idempotent. Server-only (service role), like 031.
-- ============================================================

alter table public.message_log
  add column if not exists kind text,
  add column if not exists ref text,
  add column if not exists user_id uuid references public.profiles(id) on delete set null;

alter table public.message_log drop constraint if exists message_log_status_check;
alter table public.message_log
  add constraint message_log_status_check
  check (status in ('pending', 'sent', 'failed', 'skipped'));

create unique index if not exists uq_message_log_ref_active
  on public.message_log(ref)
  where ref is not null and status in ('pending', 'sent');

create index if not exists idx_message_log_kind_created
  on public.message_log(kind, created_at desc);

create index if not exists idx_message_log_channel_created
  on public.message_log(channel, created_at desc);

alter table public.message_log enable row level security;
revoke all on public.message_log from anon, authenticated;
