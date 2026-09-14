-- Never prepare a digital order before the server authorizes its exact payment.

create or replace function public.transition_order(
  target_order uuid,
  expected_status public.order_status,
  next_status public.order_status
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  order_row public.orders%rowtype;
begin
  if actor_id is null then raise exception 'authentication required'; end if;
  if expected_status is null or next_status is null then raise exception 'statuses are required'; end if;
  select * into order_row from public.orders where id = target_order for update;
  if not found then return false; end if;
  if order_row.status = next_status and expected_status <> next_status then return true; end if;
  if order_row.status <> expected_status then raise exception 'order status changed; refresh required'; end if;

  if order_row.status = 'confirmed' and next_status = 'preparing' then
    if not (private.is_platform_admin() or private.has_restaurant_role(
      order_row.restaurant_id,
      array['owner', 'manager', 'kitchen']::public.restaurant_role[]
    )) then raise exception 'restaurant preparation permission required'; end if;
    if order_row.payment_method <> 'cash' and not exists (
      select 1
      from public.payment_attempts pa
      where pa.order_id = order_row.id
        and pa.status = 'authorized'
        and round(pa.amount, 2) = round(order_row.total, 2)
    ) then
      raise exception 'digital payment must be authorized before preparation';
    end if;
  elsif order_row.status = 'preparing' and next_status = 'picked_up' then
    if order_row.rider_id is distinct from actor_id then raise exception 'assigned rider required'; end if;
  elsif order_row.status = 'picked_up' and next_status = 'on_the_way' then
    if order_row.rider_id is distinct from actor_id then raise exception 'assigned rider required'; end if;
  else
    raise exception 'transition requires a dedicated workflow';
  end if;

  update public.orders set status = next_status where id = target_order;
  return true;
end;
$$;

comment on function public.transition_order(uuid, public.order_status, public.order_status)
  is 'Prevents preparation of digital orders until an exact payment attempt is authorized.';
