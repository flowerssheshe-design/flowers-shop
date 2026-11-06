-- ============================================================
-- 044_stall_unlock_flag.sql
--
-- עברית:
--   כשמנהל פותח את חלוקת הדוכנים מחדש אחרי חמישי בערב, היא נשארת פתוחה
--   עד שהוא נועל שוב (בלי נעילה אוטומטית מיד).
--
-- English:
--   A manual unlock after the Thursday-evening lock time stays unlocked until
--   a manager locks again. Run after 043. Idempotent.
-- ============================================================

alter table public.business_weeks
  add column if not exists stalls_unlocked_at timestamptz;
