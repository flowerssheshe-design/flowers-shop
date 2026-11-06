-- ============================================================
-- 048_split_reset_budget_carry.sql
--
-- עברית:
--   אם אחרי שהחלוקה בין הדוכנים ננעלה מגיע מהספק מספר אחר ממה שהוזמן
--   (או זר חדש), החלוקה מבוטלת והמנהל מקבל הודעה לחלק מחדש.
--   split_reset_at / split_reset_note שומרים מתי ולמה.
--
-- English:
--   When the supplier delivery differs after the split was locked, the split
--   is cancelled and the managers are told to split again. Run after 047.
-- ============================================================

alter table public.business_weeks
  add column if not exists split_reset_at timestamptz;
alter table public.business_weeks
  add column if not exists split_reset_note text;
