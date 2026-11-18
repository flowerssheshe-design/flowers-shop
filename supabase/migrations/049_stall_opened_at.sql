-- ============================================================
-- 049_stall_opened_at.sql
--
-- עברית:
--   מתי הדוכן נפתח לאחרונה. ביום שישי, דוכן שנפתח ואחר כך נסגר כבר לא
--   מקבל הזמנות מהאתר. דוכן שעוד לא נפתח היום כן מקבל.
--
-- English:
--   When the stall was last opened. On Friday a stall that opened and then
--   closed takes no more website orders. Run after 048. Idempotent.
-- ============================================================

alter table public.stalls
  add column if not exists opened_at timestamptz;
