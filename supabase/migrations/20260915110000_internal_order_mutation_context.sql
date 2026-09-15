-- SECURITY DEFINER RPCs still execute table triggers with the caller context.
-- Use transaction-local capabilities so trusted RPCs can update protected fields
-- without granting direct UPDATE access to client roles.

create or replace function private.validate_order_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (new.id, new.code, new.customer_id, new.restaurant_id, new.subtotal, new.delivery_fee,
      new.discount, new.customer_name, new.customer_phone, new.delivery_address,
      new.delivery_reference, new.estimated_minutes, new.created_at,
      new.idempotency_key)
    is distinct from
     (old.id, old.code, old.customer_id, old.restaurant_id, old.subtotal, old.delivery_fee,
      old.discount, old.customer_name, old.customer_phone, old.delivery_address,
      old.delivery_reference, old.estimated_minutes, old.created_at,
      old.idempotency_key) then
    raise exception 'immutable order fields cannot be changed';
  end if;

  if (new.delivery_latitude, new.delivery_longitude) is distinct from
     (old.delivery_latitude, old.delivery_longitude)
    and current_user not in ('service_role', 'postgres')
    and current_setting('suya.delivery_coordinates_mutation', true) is distinct from '1' then
    raise exception 'delivery coordinates are backend-only';
  end if;

  if new.payment_method is distinct from old.payment_method
    and (old.payment_method <> 'cash'
      or new.payment_method = 'cash'
      or current_setting('suya.payment_method_mutation', true) is distinct from '1') then
    raise exception 'payment method can only be changed by a payment intent';
  end if;

  if new.rider_id is distinct from old.rider_id then
    if current_user <> 'service_role'
      and not private.is_platform_admin()
      and not private.has_restaurant_role(new.restaurant_id, array['owner', 'manager']::public.restaurant_role[]) then
      raise exception 'only authorized dispatch can assign a rider';
    end if;
    if new.rider_id is not null and not exists (
      select 1 from public.rider_profiles rp
      where rp.user_id = new.rider_id and rp.verified_at is not null
        and rp.status in ('available', 'busy')
    ) then
      raise exception 'rider is not eligible for assignment';
    end if;
  end if;

  if (new.cancelled_at, new.cancellation_reason) is distinct from
     (old.cancelled_at, old.cancellation_reason)
    and current_user <> 'service_role'
    and current_setting('suya.cancellation_mutation', true) is distinct from '1'
    and not private.is_platform_admin()
    and not private.is_restaurant_member(new.restaurant_id) then
    raise exception 'cancellation metadata is backend or restaurant only';
  end if;

  if new.delivery_verified_at is distinct from old.delivery_verified_at
    and current_user not in ('service_role', 'postgres')
    and current_setting('suya.delivery_verification_mutation', true) is distinct from '1'
    and not private.is_platform_admin() then
    raise exception 'delivery verification is backend-only';
  end if;

  if new.status is distinct from old.status and not (
    (old.status = 'confirmed' and new.status in ('preparing', 'cancelled')) or
    (old.status = 'preparing' and new.status in ('picked_up', 'cancelled')) or
    (old.status = 'picked_up' and new.status = 'on_the_way') or
    (old.status = 'on_the_way' and new.status = 'delivered')
  ) then
    raise exception 'invalid order status transition';
  end if;

  if new.status = 'delivered' and new.delivery_verified_at is null then
    raise exception 'delivery code must be verified before delivery';
  end if;
  if new.status = 'cancelled' and new.cancelled_at is null then
    raise exception 'cancelled_at is required';
  end if;
  return new;
end;
$$;

create or replace function public.set_order_delivery_coordinates(
  target_order uuid,
  latitude double precision,
  longitude double precision
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
  perform set_config('suya.delivery_coordinates_mutation', '0', true);
  perform set_config('suya.delivery_verification_mutation', '0', true);
  if actor_id is null then raise exception 'authentication required'; end if;
  if latitude is null or longitude is null or
     latitude = 'NaN'::double precision or longitude = 'NaN'::double precision or
     latitude not between -90 and 90 or longitude not between -180 and 180 then
    raise exception 'invalid delivery coordinates';
  end if;

  select * into order_row
  from public.orders
  where id = target_order and customer_id = actor_id
  for update;
  if not found then return false; end if;

  if order_row.delivery_latitude is not null then
    return order_row.delivery_latitude = latitude and order_row.delivery_longitude = longitude;
  end if;
  if order_row.status <> 'confirmed' or order_row.rider_id is not null then return false; end if;

  perform set_config('suya.delivery_coordinates_mutation', '1', true);
  perform set_config('suya.delivery_verification_mutation', '1', true);
  update public.orders set
    delivery_latitude = latitude,
    delivery_longitude = longitude,
    delivery_verified_at = now()
  where id = target_order;
  perform set_config('suya.delivery_coordinates_mutation', '0', true);
  perform set_config('suya.delivery_verification_mutation', '0', true);
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
  perform set_config('suya.delivery_verification_mutation', '0', true);
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
  perform set_config('suya.delivery_verification_mutation', '1', true);
  update public.orders set delivery_verified_at = now(), status = 'delivered' where id = target_order;
  perform set_config('suya.delivery_verification_mutation', '0', true);
  return true;
end;
$$;
