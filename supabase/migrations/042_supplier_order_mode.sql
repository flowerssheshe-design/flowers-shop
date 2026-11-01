-- ============================================================
-- 042_supplier_order_mode.sql
--
-- עברית:
--   שתי דרכים לקבוע כמה להזמין מהספק מכל זר:
--   • "תוספת" (extra): להזמין = הוזמן מראש + תוספת.
--   • "כמות קבועה" (total): להזמין = הכמות הקבועה, וזה כולל גם את
--     ההזמנות מראש וגם את הלייב. אם הוזמן מראש יותר – מזמינים כמה שהוזמן.
--   הזר שומר את ברירת המחדל (order_mode + default_order_qty), ובכל שבוע
--   אפשר לשנות. בשורת השבוע extra_qty הוא "המספר" לפי הדרך שנבחרה.
--
-- English:
--   products.order_mode / supplier_order_lines.order_mode:
--   'extra' → final = preorders + amount; 'total' → final = max(amount, preorders).
--   In supplier_order_lines, extra_qty holds the amount for the chosen mode.
--   Run after 031. Idempotent.
-- ============================================================

alter table public.products
  add column if not exists order_mode text not null default 'extra';

alter table public.supplier_order_lines
  add column if not exists order_mode text not null default 'extra';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'products_order_mode_check') then
    alter table public.products
      add constraint products_order_mode_check check (order_mode in ('extra', 'total'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'supplier_order_lines_order_mode_check') then
    alter table public.supplier_order_lines
      add constraint supplier_order_lines_order_mode_check check (order_mode in ('extra', 'total'));
  end if;
end
$$;

-- Lines where "to order" was typed by hand (it no longer matches pre-orders +
-- extra) become a fixed total of what was typed, so nothing ordered changes.
update public.supplier_order_lines
set order_mode = 'total', extra_qty = final_qty
where order_mode = 'extra' and final_qty <> preorder_qty + extra_qty;
