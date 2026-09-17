-- ============================================================
-- 016_fix_archive_financials.sql
-- Corrects aggregate financial fields persisted in weekly_archives so they
-- match the per-segment (pre-orders + stall) values that are always stored
-- accurately:
--
--   * gross_profit must equal the sum of actual item/section profits
--     (preorders_profit + stall_profit), NOT total_revenue - a cost that
--     includes unsold inventory.
--   * total_cost / total_supplier_cost must be the cost of SOLD items only:
--     (preorders_revenue - preorders_profit) + (stall_revenue - stall_profit).
--   * stall_sales_count must reflect units sold at the stall (inventory-based),
--     recovered from the snapshot's stall_inventory.totals.units_sold.
--   * total_net_profit must subtract the week's recorded expenses from
--     gross_profit, and total_expenses stores that week's expense total.
--
-- Idempotent: safe to re-run. Archives created going forward are written
-- correctly by /api/admin/weekly-reset; this migration repairs historical rows.
-- ============================================================

-- New column to persist the week's expense total (used for net-profit math).
alter table public.weekly_archives
  add column if not exists total_expenses numeric(12,2) default 0;

-- Backfill the aggregate financials for every archive from the already-correct
-- per-segment stored values + the expenses incurred during that week.
update public.weekly_archives wa
set
  gross_profit =
    coalesce(wa.preorders_profit, 0) + coalesce(wa.stall_profit, 0),
  total_cost =
    (coalesce(wa.preorders_revenue, 0) - coalesce(wa.preorders_profit, 0))
    + (coalesce(wa.stall_revenue, 0) - coalesce(wa.stall_profit, 0)),
  total_supplier_cost =
    (coalesce(wa.preorders_revenue, 0) - coalesce(wa.preorders_profit, 0))
    + (coalesce(wa.stall_revenue, 0) - coalesce(wa.stall_profit, 0)),
  stall_sales_count = coalesce(
    (wa.snapshot_data -> 'stall_inventory' -> 'totals' ->> 'units_sold')::integer,
    wa.stall_sales_count
  ),
  total_expenses = coalesce(
    (
      select coalesce(sum(amount), 0)
      from public.expenses e
      where e.created_at >= wa.week_start
        and e.created_at < wa.week_end
    ), 0
  ),
  total_net_profit =
    (coalesce(wa.preorders_profit, 0) + coalesce(wa.stall_profit, 0))
    - coalesce(
      (
        select coalesce(sum(amount), 0)
        from public.expenses e
        where e.created_at >= wa.week_start
          and e.created_at < wa.week_end
      ), 0
    );

-- Re-establish the invariant: gross_profit == total_revenue - total_cost
-- (total_revenue itself was already stored correctly as
--  preorders_revenue + stall_revenue and is left untouched).
