-- Enable realtime for inventory table
-- This allows clients to subscribe to live stock changes

ALTER PUBLICATION supabase_realtime ADD TABLE public.inventory;