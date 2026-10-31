-- ============================================================
-- 029_lock_down_rls.sql
--
-- עברית:
--   סגירת פרצות אבטחה ב-RLS. עד היום כל לקוח רשום (authenticated) יכול
--   היה לקרוא ולעדכן את כל ההזמנות, לכתוב מוצרים, לקרוא ולכתוב את
--   site_config (שמכילה את admin_pin, שהיה קריא אפילו ל-anon),
--   weekly_archives ו-expenses, ולקרוא site_visits. כל מי שמחזיק במפתח
--   ה-anon יכול היה להוסיף/לעדכן/למחוק מלאי (inventory) ולהכניס הזמנות
--   שרירותיות. לקוחות יכלו לעדכן את שורת ה-profile שלהם כולל
--   customer_status.
--   כל קוד האפליקציה ניגש לנתונים דרך ה-service role (createAdminClient)
--   שעוקף RLS, ולכן המדיניות האלה מיותרות ומסוכנות — אנחנו מוחקים אותן.
--   בנוסף, שוללים הרשאת EXECUTE מ-anon/authenticated על פונקציות SQL
--   שמשנות נתונים או חושפות נתונים של משתמשים אחרים (האפליקציה קוראת
--   להן רק דרך ה-service role).
--
-- English:
--   Close RLS security holes. All app data access goes through the
--   service-role client (bypasses RLS), so the over-broad policies below are
--   unnecessary and dangerous. We drop them, and revoke EXECUTE from
--   PUBLIC/anon/authenticated on SQL functions that mutate data or expose
--   other users' / business data (the app only calls them via service role).
--
-- Policies DROPPED (requested):
--   products        "products_admin_write"      (001) authenticated = full write
--   orders          "orders_public_insert"      (001) anyone can insert any order
--   orders          "orders_admin_read"         (001) authenticated reads ALL orders
--   orders          "orders_admin_update"       (001) authenticated updates ALL orders
--   site_config     "site_config_public_read"   (001) anon can read admin_pin
--   site_config     "site_config_admin_write"   (001) authenticated full write
--   weekly_archives "weekly_archives_admin_all" (003) authenticated full access
--   expenses        "expenses_admin_all"        (014) authenticated full access
--   site_visits     "site_visits_admin_read"    (010) authenticated reads all visits
--   inventory       "Allow admin insert"        (005) with check (true) — anyone
--   inventory       "Allow admin update"        (005) using (true) — anyone
--   inventory       "Allow admin delete"        (005) using (true) — anyone
--   profiles        "profiles_self_update"      (002) customer could set own
--                                                     customer_status / discounts
--
-- Audit of tables created in 003–027 (no other over-broad policy found):
--   weekly_archives (003), inventory (005), site_visits (010), expenses (014)
--     -> covered above.
--   store_settings (018): "Public read store settings" (select, kept);
--     "Admin write store settings" uses auth.jwt()->>'role' = 'service_role'
--     -> not over-broad, kept.
--   system_settings (020): "Public read system settings" (select, kept);
--     "Admin write system settings" service_role only -> kept.
--   Migrations 004, 006–009, 011–013, 015–017, 019(x3), 021–027 create no
--   tables/policies.
--
-- Policies KEPT: products_public_read, orders_self_read, profiles_self_read,
--   inventory "Allow public read" (also needed for realtime),
--   site_visits_public_insert, store_settings/system_settings public read.
--
-- Note: pg_cron jobs in supabase/sql/ run as postgres and are unaffected.
-- Idempotent: safe to re-run.
-- ============================================================

-- -----------------------------
-- 1. Drop over-broad policies
-- -----------------------------
drop policy if exists "products_admin_write"      on public.products;

drop policy if exists "orders_public_insert"      on public.orders;
drop policy if exists "orders_admin_read"         on public.orders;
drop policy if exists "orders_admin_update"       on public.orders;

drop policy if exists "site_config_public_read"   on public.site_config;
drop policy if exists "site_config_admin_write"   on public.site_config;

drop policy if exists "weekly_archives_admin_all" on public.weekly_archives;

drop policy if exists "expenses_admin_all"        on public.expenses;

drop policy if exists "site_visits_admin_read"    on public.site_visits;

drop policy if exists "Allow admin insert"        on public.inventory;
drop policy if exists "Allow admin update"        on public.inventory;
drop policy if exists "Allow admin delete"        on public.inventory;

drop policy if exists "profiles_self_update"      on public.profiles;

-- Make sure RLS stays enabled on every table touched here.
alter table public.products        enable row level security;
alter table public.orders          enable row level security;
alter table public.site_config     enable row level security;
alter table public.weekly_archives enable row level security;
alter table public.expenses        enable row level security;
alter table public.site_visits     enable row level security;
alter table public.inventory       enable row level security;
alter table public.profiles        enable row level security;

-- -----------------------------
-- 2. Revoke EXECUTE on sensitive functions
-- -----------------------------
-- Signatures are taken from the migrations. Some were replaced/dropped by
-- later migrations (overloads), so each one is resolved with
-- to_regprocedure() and silently skipped if it does not exist.
-- service_role keeps EXECUTE (granted explicitly, it is what the app uses).
--
-- Intentionally NOT revoked:
--   week_start_sunday(timestamptz)   pure date helper, used as a default arg
--   set_updated_at(), handle_new_user(), update_inventory_updated_at(),
--   sync_product_availability()      trigger functions (cannot be RPC-called)
do $$
declare
  sig text;
  fn  regprocedure;
begin
  foreach sig in array array[
    -- inventory mutation (006)
    'public.decrement_inventory(uuid, integer)',
    'public.increment_inventory(uuid, integer)',
    -- per-user data (002/008/013, 003)
    'public.user_completed_order_count(uuid)',
    'public.user_qualifies_for_member_price(uuid)',
    'public.ensure_profile(uuid)',
    -- weekly stats / reset (001, 003, 008, 009, 010, 012)
    'public.supplier_week_aggregate()',
    'public.supplier_week_aggregate(timestamptz)',
    'public.weekly_stats(timestamptz)',
    'public.weekly_top_products(timestamptz, timestamptz)',
    'public.weekly_top_products_with_costs(timestamptz, timestamptz)',
    'public.weekly_financial_summary(timestamptz)',
    'public.weekly_visitor_count(timestamptz)',
    'public.weekly_reset()',
    -- analytics RPCs (015, 017, 019, 023, 025)
    'public.all_time_gross_profit()',
    'public.total_expenses_logged()',
    'public.all_time_net_profit()',
    'public.all_time_metrics()',
    'public.total_registered_users()',
    'public.wow_growth_metrics()',
    'public.best_seller_by_volume()',
    'public.highest_sell_through_rate()',
    'public.investment_efficiency_ratio()',
    'public.best_seller_preorders()',
    'public.best_seller_stall_sales()',
    'public.highest_sell_through_rate_stall()',
    'public.customer_segment_counts()',
    'public.sync_weekly_archive_expenses()',
    -- expenses RPCs (015, 023, 024, 025)
    'public.add_expense(text, numeric, text, text)',
    'public.add_expense(text, numeric, text, text, date, boolean)',
    'public.update_expense(uuid, text, numeric, text, text)',
    'public.update_expense(uuid, text, numeric, text, text, date, boolean)',
    'public.delete_expense(uuid)',
    'public.list_expenses()',
    'public.expenses_summary()',
    'public.expenses_for_week(timestamptz)',
    'public.expense_reporting_weeks()',
    'public.one_time_expenses_for_week(timestamptz)',
    'public.all_time_expenses()',
    'public.all_time_expenses_breakdown()'
  ]
  loop
    fn := to_regprocedure(sig);
    if fn is null then
      raise notice 'skip (not found): %', sig;
      continue;
    end if;
    execute format('revoke execute on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end
$$;

-- Functions created from now on are not callable by anon/authenticated
-- unless granted explicitly (Supabase's default grants them to everyone).
alter default privileges in schema public
  revoke execute on functions from public, anon, authenticated;
