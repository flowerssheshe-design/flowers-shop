-- eslint-disable
-- Add persistent initial stock tracking to inventory
ALTER TABLE inventory
  ADD COLUMN IF NOT EXISTS initial_stock_count INTEGER;

-- Backfill: for existing rows, set initial_stock_count = live_stock_count
-- so current inventory becomes the baseline for sell-through stats.
UPDATE inventory
SET initial_stock_count = live_stock_count
WHERE initial_stock_count IS NULL;

-- Ensure non-negative constraint covers the new column too
ALTER TABLE inventory
  ADD CONSTRAINT inventory_initial_stock_count_nonnegative
  CHECK (initial_stock_count IS NULL OR initial_stock_count >= 0);
