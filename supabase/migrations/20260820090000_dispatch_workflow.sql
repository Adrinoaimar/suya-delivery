create unique index orders_one_open_per_rider_idx
  on public.orders (rider_id)
  where rider_id is not null and status not in ('delivered', 'cancelled');

alter table public.order_events
  add column event_type text not null default 'status_changed'
    check (event_type in ('created', 'status_changed', 'rider_assigned', 'rider_unassigned', 'rider_reassigned')),
  add column previous_status public.order_status,
  add column rider_id uuid references public.rider_profiles(user_id) on delete set null,
  add column actor_role text not null default 'system'
    check (actor_role in ('customer', 'restaurant', 'rider', 'platform_admin', 'system')),
  add column metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object');

with first_event as (
  select min(id) as id from public.order_events group by order_id
)
update public.order_events e set event_type = 'created'
from first_event f where e.id = f.id;

create or replace function private.record_order_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_actor_role text := 'system';
begin
  if (select auth.uid()) is not null then
    event_actor_role := case
      when private.is_platform_admin() then 'platform_admin'
      when new.rider_id = (select auth.uid()) then 'rider'
      when private.is_restaurant_member(new.restaurant_id) then 'restaurant'
      when new.customer_id = (select auth.uid()) then 'customer'
      else 'system'
    end;
  end if;
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.order_events (
      order_id, status, actor_id, event_type, previous_status, rider_id, actor_role
    ) values (
      new.id, new.status, (select auth.uid()),
      case when tg_op = 'INSERT' then 'created' else 'status_changed' end,
      case when tg_op = 'INSERT' then null else old.status end,
      new.rider_id, event_actor_role
    );
  end if;
  return new;
end;
$$;

create or replace function private.write_audit_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_value jsonb;
  old_value jsonb;
  new_value jsonb;
begin
  row_value := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  old_value := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  new_value := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  if tg_table_name = 'payment_attempts' then
    old_value := old_value - 'idempotency_key' - 'provider_reference';
    new_value := new_value - 'idempotency_key' - 'provider_reference';
  elsif tg_table_name = 'orders' then
    old_value := old_value - array[
      'customer_name', 'customer_phone', 'delivery_address', 'delivery_reference',
      'delivery_latitude', 'delivery_longitude', 'idempotency_key'
    ];
    new_value := new_value - array[
      'customer_name', 'customer_phone', 'delivery_address', 'delivery_reference',
      'delivery_latitude', 'delivery_longitude', 'idempotency_key'
    ];
  end if;
  insert into public.audit_log (actor_id, table_name, row_id, action, old_data, new_data)
  values (
    (select auth.uid()), tg_table_name,
    coalesce(row_value ->> 'id', concat_ws(':', row_value ->> 'restaurant_id', row_value ->> 'user_id')),
    tg_op, old_value, new_value
  );
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create function private.release_rider_if_idle(target_rider uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.rider_profiles rp
  set status = 'available'
  where rp.user_id = target_rider
    and rp.status = 'busy'
    and not exists (
      select 1 from public.orders o
      where o.rider_id = target_rider
        and o.status not in ('delivered', 'cancelled')
    );
$$;

create function public.set_rider_availability(is_available boolean)
returns public.rider_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  rider_row public.rider_profiles%rowtype;
  next_status public.rider_status;
begin
  if actor_id is null then raise exception 'authentication required'; end if;
  if is_available is null then raise exception 'availability is required'; end if;
  select * into rider_row from public.rider_profiles
  where user_id = actor_id for update;
  if not found or rider_row.verified_at is null then raise exception 'verified rider required'; end if;
  if rider_row.status = 'suspended' then raise exception 'rider is suspended'; end if;
  if exists (
    select 1 from public.orders o
    where o.rider_id = actor_id and o.status not in ('delivered', 'cancelled')
  ) then raise exception 'rider has an active assignment'; end if;
  next_status := case when is_available then 'available'::public.rider_status
    else 'offline'::public.rider_status end;
  update public.rider_profiles set status = next_status where user_id = actor_id;
  return next_status;
end;
$$;

create function public.list_available_riders(target_restaurant uuid)
returns table (
  user_id uuid,
  display_name text,
  phone text,
  vehicle_type text,
  vehicle_color text,
  vehicle_plate text,
  rating numeric,
  deliveries integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select rp.user_id, p.display_name, coalesce(rp.phone, p.phone), rp.vehicle_type,
    rp.vehicle_color, rp.vehicle_plate, rp.rating, rp.deliveries
  from public.rider_profiles rp
  join public.profiles p on p.id = rp.user_id
  where (private.is_platform_admin() or private.has_restaurant_role(
      target_restaurant, array['owner', 'manager']::public.restaurant_role[]
    ))
    and rp.verified_at is not null
    and rp.status = 'available'
    and not exists (
      select 1 from public.orders o
      where o.rider_id = rp.user_id and o.status not in ('delivered', 'cancelled')
    )
  order by rp.rating desc, rp.deliveries desc, p.display_name;
$$;

create function public.assign_order_rider(target_order uuid, target_rider uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  order_row public.orders%rowtype;
  rider_row public.rider_profiles%rowtype;
  previous_rider uuid;
begin
  if (select auth.uid()) is null then raise exception 'authentication required'; end if;
  select * into order_row from public.orders where id = target_order for update;
  if not found then return false; end if;
  if not (private.is_platform_admin() or private.has_restaurant_role(
    order_row.restaurant_id, array['owner', 'manager']::public.restaurant_role[]
  )) then raise exception 'dispatch permission required'; end if;
  if order_row.status not in ('confirmed', 'preparing') then
    raise exception 'order cannot be assigned in current status';
  end if;
  if order_row.rider_id is not distinct from target_rider then return true; end if;

  previous_rider := order_row.rider_id;
  if target_rider is not null then
    select * into rider_row from public.rider_profiles
    where user_id = target_rider for update;
    if not found or rider_row.verified_at is null or rider_row.status <> 'available' then
      raise exception 'rider is not available';
    end if;
    if exists (
      select 1 from public.orders o
      where o.rider_id = target_rider and o.status not in ('delivered', 'cancelled')
    ) then raise exception 'rider already has an active assignment'; end if;
  end if;

  update public.orders set rider_id = target_rider where id = target_order;
  if target_rider is not null then
    update public.rider_profiles set status = 'busy' where user_id = target_rider;
  end if;
  if previous_rider is not null then perform private.release_rider_if_idle(previous_rider); end if;
  insert into public.order_events (
    order_id, status, actor_id, event_type, rider_id, actor_role, metadata
  ) values (
    target_order, order_row.status, (select auth.uid()),
    case
      when previous_rider is null then 'rider_assigned'
      when target_rider is null then 'rider_unassigned'
      else 'rider_reassigned'
    end,
    target_rider,
    case when private.is_platform_admin() then 'platform_admin' else 'restaurant' end,
    jsonb_build_object('previous_rider_id', previous_rider)
  );
  return true;
end;
$$;

create function public.transition_order(
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

create function public.cancel_order_by_restaurant(target_order uuid, reason text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  order_row public.orders%rowtype;
begin
  select * into order_row from public.orders where id = target_order for update;
  if not found then return false; end if;
  if not (private.is_platform_admin() or private.has_restaurant_role(
    order_row.restaurant_id, array['owner', 'manager']::public.restaurant_role[]
  )) then raise exception 'restaurant cancellation permission required'; end if;
  if order_row.status not in ('confirmed', 'preparing') then return false; end if;
  reason := btrim(coalesce(reason, ''));
  if length(reason) not between 3 and 300 then raise exception 'valid cancellation reason required'; end if;
  update public.orders set status = 'cancelled', cancelled_at = now(),
    cancellation_reason = reason where id = target_order;
  if order_row.rider_id is not null then perform private.release_rider_if_idle(order_row.rider_id); end if;
  return true;
end;
$$;

create or replace function public.cancel_order_with_code(target_order uuid, supplied_code text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  order_row public.orders%rowtype;
  secret_row private.order_secrets%rowtype;
begin
  select * into order_row from public.orders
  where id = target_order and customer_id = (select auth.uid()) for update;
  if not found then return false; end if;
  if order_row.status in ('delivered', 'cancelled', 'picked_up', 'on_the_way') then return false; end if;
  select * into secret_row from private.order_secrets where order_id = target_order for update;
  if secret_row.locked_until is not null and secret_row.locked_until > now() then return false; end if;
  if extensions.crypt(btrim(supplied_code), secret_row.cancel_code_hash) <> secret_row.cancel_code_hash then
    update private.order_secrets set
      cancel_failed_attempts = least(cancel_failed_attempts + 1, 10),
      locked_until = case when cancel_failed_attempts + 1 >= 5 then now() + interval '15 minutes' else locked_until end
    where order_id = target_order;
    return false;
  end if;
  update public.orders set status = 'cancelled', cancelled_at = now(),
    cancellation_reason = 'cancelled_by_customer' where id = target_order;
  if order_row.rider_id is not null then perform private.release_rider_if_idle(order_row.rider_id); end if;
  return true;
end;
$$;

create or replace function public.confirm_order_delivery(target_order uuid, supplied_code text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  order_row public.orders%rowtype;
  secret_row private.order_secrets%rowtype;
begin
  select * into order_row from public.orders
  where id = target_order and rider_id = (select auth.uid()) for update;
  if not found or order_row.status <> 'on_the_way' then return false; end if;
  select * into secret_row from private.order_secrets where order_id = target_order for update;
  if secret_row.locked_until is not null and secret_row.locked_until > now() then return false; end if;
  if extensions.crypt(btrim(supplied_code), secret_row.delivery_code_hash) <> secret_row.delivery_code_hash then
    update private.order_secrets set
      delivery_failed_attempts = least(delivery_failed_attempts + 1, 10),
      locked_until = case when delivery_failed_attempts + 1 >= 5 then now() + interval '15 minutes' else locked_until end
    where order_id = target_order;
    return false;
  end if;
  update public.orders set delivery_verified_at = now(), status = 'delivered' where id = target_order;
  update public.rider_profiles set deliveries = deliveries + 1 where user_id = order_row.rider_id;
  perform private.release_rider_if_idle(order_row.rider_id);
  return true;
end;
$$;

drop policy if exists orders_restaurant_update on public.orders;
drop policy if exists orders_rider_update on public.orders;
revoke update (rider_id, status, cancelled_at, cancellation_reason) on public.orders from authenticated;
revoke update (status) on public.rider_profiles from authenticated;

revoke all on function private.release_rider_if_idle(uuid) from public, anon, authenticated;
revoke all on function public.set_rider_availability(boolean) from public, anon, authenticated;
revoke all on function public.list_available_riders(uuid) from public, anon, authenticated;
revoke all on function public.assign_order_rider(uuid, uuid) from public, anon, authenticated;
revoke all on function public.transition_order(uuid, public.order_status, public.order_status)
  from public, anon, authenticated;
revoke all on function public.cancel_order_by_restaurant(uuid, text)
  from public, anon, authenticated;
grant execute on function public.set_rider_availability(boolean) to authenticated;
grant execute on function public.list_available_riders(uuid) to authenticated;
grant execute on function public.assign_order_rider(uuid, uuid) to authenticated;
grant execute on function public.transition_order(uuid, public.order_status, public.order_status) to authenticated;
grant execute on function public.cancel_order_by_restaurant(uuid, text) to authenticated;
