-- ============================================================
-- 040_money_fresh_start.sql
--
-- עברית:
--   התחלה חדשה לנתוני הכסף, בלי למחוק הזמנות:
--   1. "סופרים כסף מתאריך" = 1.11.2026. דפי הכסף, ההוצאות והשכר סופרים
--      רק מהתאריך הזה. אפשר לשנות אותו בכל רגע בדף ההגדרות.
--   2. מחיקת הארכיון השבועי של המערכת הישנה (weekly_archives). הוא לא
--      מדויק (ספר משכורות כהוצאות), והמערכת החדשה לא קוראת אותו.
--      גיבוי מלא נשמר ב-backups/money-2026-11-01-19-06.
--   ההזמנות של הלקוחות לא נמחקות, כך שההיסטוריה והנחת הלקוח הקבוע נשמרות.
--
-- English:
--   Money pages count from 2026-11-01 (system_settings.money_start_date);
--   the legacy weekly_archives rows are deleted. Orders are untouched, so
--   customers keep their history and regular-customer discount.
--   business_weeks.archive_id is "on delete set null" (migration 032).
-- ============================================================

insert into public.system_settings (key, value)
values ('money_start_date', '"2026-11-01"'::jsonb)
on conflict (key) do update set value = excluded.value, updated_at = now();

delete from public.weekly_archives;
