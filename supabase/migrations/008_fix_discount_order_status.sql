-- Fix discount/order-count logic after status model changed in 005.
-- Old statuses used: 'confirmed'
-- New statuses used: 'approved', 'pending_payment', 'completed'

create or replace function public.user_completed_order_count(uid uuid)
returns bigint
language sql
stable
as $$
  select count(*)::bigint
  from public.orders
  where user_id = uid
    and status in ('approved', 'completed');
$$;

create or replace function public.user_qualifies_for_member_price(uid uuid)
returns boolean
language sql
stable
as $$
  select public.user_completed_order_count(uid) >= 3;
$$;

create or replace function public.weekly_stats(week_start timestamptz default public.week_start_sunday())
returns table (
  total_revenue numeric,
  delivery_revenue numeric,
  products_revenue numeric,
  orders_count bigint,
  pickup_count bigint,
  delivery_count bigint,
  member_orders_count bigint,
  new_customers_count bigint,
  returning_customers_count bigint,
  avg_order_value numeric
)
language sql stable as $$
  with wk as (
    select *
    from public.orders o
    where o.created_at >= week_start
      and o.created_at <  week_start + interval '7 days'
      and o.status <> 'cancelled'
      and o.status <> 'archived'
  )
  select
    coalesce(sum(wk.total_amount), 0)::numeric as total_revenue,
    coalesce(sum(wk.delivery_fee), 0)::numeric   as delivery_revenue,
    coalesce(sum(wk.total_amount - wk.delivery_fee), 0)::numeric as products_revenue,
    count(*)::bigint                              as orders_count,
    count(*) filter (where wk.delivery_type = 'pickup')::bigint    as pickup_count,
    count(*) filter (where wk.delivery_type = 'delivery')::bigint  as delivery_count,
    count(*) filter (where wk.is_member)::bigint   as member_orders_count,
    count(distinct wk.customer_phone) filter (
      where not exists (
        select 1 from public.orders prior
        where prior.customer_phone = wk.customer_phone
          and prior.created_at < week_start
          and prior.status in ('approved', 'completed')
      )
    )::bigint as new_customers_count,
    count(distinct wk.customer_phone) filter (
      where exists (
        select 1 from public.orders prior
        where prior.customer_phone = wk.customer_phone
          and prior.created_at < week_start
          and prior.status in ('approved', 'completed')
      )
    )::bigint as returning_customers_count,
    case
      when count(*) = 0 then 0::numeric
      else round(coalesce(sum(wk.total_amount),0)::numeric / count(*), 2)
    end as avg_order_value
  from wk;
$$;
