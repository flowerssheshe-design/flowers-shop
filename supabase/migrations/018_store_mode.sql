-- Store mode configuration
-- Modes: 'preorder' (pre-order week) or 'realtime' (Friday live stall)

CREATE TABLE IF NOT EXISTS public.store_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Default store mode is 'preorder'
INSERT INTO public.store_settings (key, value)
VALUES ('mode', '"preorder"'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Enable RLS
ALTER TABLE public.store_settings ENABLE ROW LEVEL SECURITY;

-- Public read access
CREATE POLICY "Public read store settings"
    ON public.store_settings
    FOR SELECT
    USING (true);

-- Admin write access
CREATE POLICY "Admin write store settings"
    ON public.store_settings
    FOR ALL
    USING (auth.jwt() ->> 'role' = 'service_role');

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_store_settings_key ON public.store_settings(key);