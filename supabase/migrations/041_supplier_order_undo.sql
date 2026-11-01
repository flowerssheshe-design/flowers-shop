-- ============================================================
-- 041_supplier_order_undo.sql
--
-- עברית:
--   "ביטול השליחה" להזמנה מהספק: בזמן הסימון "ההזמנה נשלחה" נשמר
--   המלאי כמו שהיה לפני, וביטול מחזיר אותו בדיוק למצב הקודם.
--
-- English:
--   Undo for "order sent to supplier": the stock before the send is kept in
--   business_weeks.stock_before_order, and undo restores it.
--   Run after 032. Idempotent.
-- ============================================================

alter table public.business_weeks
  add column if not exists stock_before_order jsonb;

comment on column public.business_weeks.stock_before_order is
  'המלאי לפני "ההזמנה נשלחה לספק" – לביטול השליחה / stock before the supplier order was marked sent (for undo)';
