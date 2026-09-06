-- Orders table updates
ALTER TABLE orders 
  ADD COLUMN IF NOT EXISTS fulfillment_type TEXT,
  ADD COLUMN IF NOT EXISTS payment_method TEXT,
  ADD COLUMN IF NOT EXISTS greeting_note TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Add check constraints
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_fulfillment_type_check') THEN
    ALTER TABLE orders ADD CONSTRAINT orders_fulfillment_type_check 
      CHECK (fulfillment_type IN ('delivery', 'pickup') OR fulfillment_type IS NULL);
  END IF;
END $$;

DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_payment_method_check') THEN
    ALTER TABLE orders ADD CONSTRAINT orders_payment_method_check 
      CHECK (payment_method IN ('bit', 'paybox', 'cash') OR payment_method IS NULL);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_status_check') THEN
    ALTER TABLE orders DROP CONSTRAINT orders_status_check;
  END IF;
  ALTER TABLE orders ADD CONSTRAINT orders_status_check
    CHECK (status IN ('pending_payment', 'approved', 'completed', 'cancelled', 'archived'));
END $$;

-- Inventory table
CREATE TABLE IF NOT EXISTS inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  live_stock_count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(product_id)
);

ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read" ON inventory FOR SELECT USING (true);
CREATE POLICY "Allow admin insert" ON inventory FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow admin update" ON inventory FOR UPDATE USING (true);
CREATE POLICY "Allow admin delete" ON inventory FOR DELETE USING (true);

CREATE OR REPLACE FUNCTION update_inventory_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS inventory_updated_at ON inventory;
CREATE TRIGGER inventory_updated_at
  BEFORE UPDATE ON inventory
  FOR EACH ROW EXECUTE FUNCTION update_inventory_updated_at();
