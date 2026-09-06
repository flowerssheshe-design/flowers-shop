-- Prevent negative stock at the row level (defense in depth).
ALTER TABLE inventory
  ADD CONSTRAINT inventory_live_stock_count_nonnegative
  CHECK (live_stock_count >= 0);

-- Atomic check-and-decrement. Returns the new count, or NULL if insufficient stock.
CREATE OR REPLACE FUNCTION public.decrement_inventory(p_product_id uuid, p_qty integer)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE v_new integer;
BEGIN
  UPDATE inventory
  SET live_stock_count = live_stock_count - p_qty
  WHERE product_id = p_product_id
    AND live_stock_count >= p_qty
  RETURNING live_stock_count INTO v_new;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  RETURN v_new;
END;
$$;

-- Atomic increment (used to restore stock on cancellation).
CREATE OR REPLACE FUNCTION public.increment_inventory(p_product_id uuid, p_qty integer)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE v_new integer;
BEGIN
  INSERT INTO inventory (product_id, live_stock_count)
  VALUES (p_product_id, p_qty)
  ON CONFLICT (product_id)
  DO UPDATE SET live_stock_count = inventory.live_stock_count + p_qty
  RETURNING live_stock_count INTO v_new;
  RETURN v_new;
END;
$$;

-- Track whether an order actually consumed live stock, so cancellation
-- restores only what was deducted (independent of the current day/time).
ALTER TABLE orders ADD COLUMN IF NOT EXISTS inventory_deducted boolean NOT NULL DEFAULT false;
