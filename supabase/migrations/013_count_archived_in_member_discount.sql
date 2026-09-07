-- Fix loyal-customer (member) discount count so that orders which have been
-- archived by the weekly reset (status = 'archived') are still counted toward
-- the CLUB_DISCOUNT_THRESHOLD. Previously only 'approved'/'completed' orders
-- counted, which meant a customer's past orders were wiped from the tally every
-- week on archive and they could never reach the threshold.
-- Archived orders are historical approved/completed purchases, so they must
-- continue to contribute to the member discount count.

create or replace function public.user_completed_order_count(uid uuid)
returns bigint
language sql
stable
as $$
  select count(*)::bigint
  from public.orders
  where user_id = uid
    and status in ('approved', 'completed', 'archived');
$$;
