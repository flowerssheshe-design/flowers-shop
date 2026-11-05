-- ============================================================
-- 045_stall_delivery_point.sql
--
-- עברית:
--   stalls.is_delivery_point: השליח לוקח את זרי המשלוחים מהדוכן הזה.
--   הזמנת משלוח יורדת מהמלאי של הדוכן (כמו איסוף עצמי), ונשמרת ב-
--   orders.pickup_stall_id ("הדוכן שממנו יוצאים הזרים").
--
-- English:
--   Delivery orders come off a delivery-point stall's share, like pickup
--   orders. Run after 043. Idempotent.
-- ============================================================

alter table public.stalls
  add column if not exists is_delivery_point boolean not null default false;
