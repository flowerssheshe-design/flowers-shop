-- System settings table for business configuration
-- Stores financial, contact, pickup, and operating settings as key-value pairs.

CREATE TABLE IF NOT EXISTS public.system_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Default values matching existing .env defaults
INSERT INTO public.system_settings (key, value)
VALUES
    ('delivery_fee', '15'::jsonb),
    ('club_discount_threshold', '3'::jsonb),
    ('member_discount_percent', '10'::jsonb),
    ('bit_number', '""'::jsonb),
    ('paybox_number', '""'::jsonb),
    ('whatsapp_number', '"972500000000"'::jsonb),
    ('contact_phone', '"05-32455705"'::jsonb),
    ('pickup_address', '" shortened 37,ירוחם(ליד סופר פינתי)"'::jsonb),
    ('pickup_hours', '"10:00-15:00"'::jsonb),
    ('business_hours', '"ראשון 08:00-18:00, שישי 09:00-14:00"'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Enable RLS
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- Public read access
CREATE POLICY "Public read system settings"
    ON public.system_settings
    FOR SELECT
    USING (true);

-- Admin write access (service role)
CREATE POLICY "Admin write system settings"
    ON public.system_settings
    FOR ALL
    USING (auth.jwt() ->> 'role' = 'service_role');

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_system_settings_key ON public.system_settings(key);