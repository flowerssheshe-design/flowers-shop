-- 050: what the supplier gave for free, and refunds for cancelled paid orders.
--
--   1. supplier_order_lines.free_qty: how many of what arrived (received_qty)
--      came free. They are in the stock, but not in what is paid to the supplier.
--   2. orders.refund_due / refunded_at: a paid order (Bit / PayBox) that was
--      cancelled waits for the money to be sent back by hand. refund_due is the
--      amount; refunded_at is set when a manager marks it as sent back.

alter table public.supplier_order_lines
  add column if not exists free_qty int not null default 0 check (free_qty >= 0);

alter table public.orders
  add column if not exists refund_due numeric(10,2) check (refund_due >= 0),
  add column if not exists refunded_at timestamptz;

create index if not exists idx_orders_refund_open
  on public.orders(refund_due)
  where refund_due is not null and refunded_at is null;
