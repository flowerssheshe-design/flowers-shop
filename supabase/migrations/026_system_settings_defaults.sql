-- Add default values for additional system_settings keys
-- These are the operational fields used across storefront & backend.

INSERT INTO public.system_settings (key, value)
VALUES
    ('business_phone', '"05-32455705"'::jsonb),
    ('business_email', '"flowerssheshe@gmail.com"'::jsonb),
    ('preorder_deadline', '"10:00"'::jsonb),
    ('same_day_deadline', '"13:00"'::jsonb),
    ('announcement_banner_text', '""'::jsonb),
    ('is_stall_open', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;