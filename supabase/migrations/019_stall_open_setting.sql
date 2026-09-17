-- Stall open/closed status configuration
-- This is independent of the sales mode (preorder/realtime)

INSERT INTO public.store_settings (key, value)
VALUES ('stall_open', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;