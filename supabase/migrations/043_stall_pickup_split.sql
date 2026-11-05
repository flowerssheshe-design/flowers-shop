-- ============================================================
-- 043_stall_pickup_split.sql
--
-- עברית:
--   חלוקת זרים בין הדוכנים בלי לנעול את המלאי של האתר.
--   - stalls.is_pickup_point: האם הדוכן הוא נקודת איסוף שהלקוח יכול לבחור.
--   - orders.pickup_stall_id: מאיזה דוכן הלקוח אוסף.
--   - orders.stall_stock_deducted: ההזמנה ירדה גם מהמלאי הנעול של הדוכן.
--   - business_weeks: שיטת החלוקה (כמות / אחוזים), האחוזים, ומתי ננעלה
--     החלוקה (חמישי בערב). אחרי הנעילה לכל דוכן יש מלאי קבוע.
--   - stall_plan: כמה מכל זר כל דוכן מקבל (בשיטת הכמות), לכל שבוע.
--   בשיטה החדשה המלאי הכללי כולל גם את מה שבדוכנים, לכן מה שהועבר לדוכנים
--   בשיטה הישנה חוזר למלאי הכללי.
--   חשוב: להריץ כשהדוכנים סגורים (לא ביום שישי בזמן מכירה).
--
-- English:
--   Stall split without locking the website stock. Run after 042. Idempotent.
--   Run while the stalls are closed: it returns old stall stock to the
--   general stock.
-- ============================================================

alter table public.stalls
  add column if not exists is_pickup_point boolean not null default false;

alter table public.orders
  add column if not exists pickup_stall_id uuid references public.stalls(id) on delete set null;
alter table public.orders
  add column if not exists stall_stock_deducted boolean not null default false;

create index if not exists idx_orders_pickup_stall on public.orders(pickup_stall_id) where pickup_stall_id is not null;

alter table public.business_weeks
  add column if not exists stall_split_mode text not null default 'percent';
alter table public.business_weeks
  add column if not exists stall_split_percents jsonb not null default '{}'::jsonb;
alter table public.business_weeks
  add column if not exists stalls_locked_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'business_weeks_stall_split_mode_check'
  ) then
    alter table public.business_weeks
      add constraint business_weeks_stall_split_mode_check check (stall_split_mode in ('count', 'percent'));
  end if;
end
$$;

create table if not exists public.stall_plan (
  week_start date not null,
  stall_id uuid not null references public.stalls(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  qty int not null default 0 check (qty >= 0),
  updated_at timestamptz not null default now(),
  primary key (week_start, stall_id, product_id)
);

alter table public.stall_plan enable row level security;
revoke all on public.stall_plan from anon, authenticated;

-- Old model: stall stock had been taken out of the general stock. Give it back
-- once, so the general stock is the whole stock again.
do $$
begin
  if not exists (select 1 from public.business_weeks where stalls_locked_at is not null) then
    update public.inventory i
    set live_stock_count = i.live_stock_count + s.total
    from (
      select product_id, sum(stock)::int as total
      from public.stall_inventory
      group by product_id
      having sum(stock) > 0
    ) s
    where i.product_id = s.product_id;

    update public.stall_inventory set stock = 0, initial_stock = 0;
  end if;
end
$$;
