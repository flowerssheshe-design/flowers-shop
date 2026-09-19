-- ============================================================
-- 022_add_product_availability_trigger.sql
-- Automatically syncs product.is_available based on inventory.live_stock_count
-- When live_stock_count reaches 0, is_available becomes false.
-- When live_stock_count goes above 0, is_available becomes true.
-- ============================================================

-- Step 1: Add is_available column to products
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS is_available boolean NOT NULL DEFAULT true;

-- Step 2: Backfill — mark products as unavailable if their current stock is 0
UPDATE public.products p
SET is_available = false
WHERE EXISTS (
  SELECT 1
  FROM public.inventory i
  WHERE i.product_id = p.id
    AND (i.live_stock_count IS NULL OR i.live_stock_count <= 0)
);

-- Step 3: Create the trigger function
CREATE OR REPLACE FUNCTION public.sync_product_availability()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.live_stock_count <= 0 THEN
    -- Stock reached zero — mark product as unavailable
    UPDATE public.products
    SET is_available = false, updated_at = NOW()
    WHERE id = NEW.product_id
      AND is_available = true;
  ELSE
    -- Stock is above zero — mark product as available
    UPDATE public.products
    SET is_available = true, updated_at = NOW()
    WHERE id = NEW.product_id
      AND is_available = false;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 4: Drop existing trigger if it exists, then recreate
DROP TRIGGER IF EXISTS trg_sync_product_availability ON public.inventory;

CREATE TRIGGER trg_sync_product_availability
  AFTER INSERT OR UPDATE ON public.inventory
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_product_availability();

-- Step 5: Index for faster lookups of available products
CREATE INDEX IF NOT EXISTS idx_products_available
  ON public.products(is_available)
  WHERE is_active = true;
