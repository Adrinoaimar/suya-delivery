-- A cancelled order must never keep a pending wallet attempt that can be
-- reconciled later. The final RPC also checks the order state defensively.

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
    and current_user not in ('service_role', 'postgres') then
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
  perform set_config('suya.cancellation_mutation', '0', true);
  select * into order_row from public.orders
  where id = target_order and customer_id = (select auth.uid()) for update;
  if not found or order_row.status in ('delivered', 'cancelled') then return false; end if;
  select * into secret_row from private.order_secrets where order_id = target_order for update;
  if secret_row.locked_until is not null and secret_row.locked_until > now() then return false; end if;
  if extensions.crypt(btrim(supplied_code), secret_row.cancel_code_hash) <> secret_row.cancel_code_hash then
    update private.order_secrets set
      cancel_failed_attempts = least(cancel_failed_attempts + 1, 10),
      locked_until = case when cancel_failed_attempts + 1 >= 5 then now() + interval '15 minutes' else locked_until end
    where order_id = target_order;
    return false;
  end if;
  perform set_config('suya.cancellation_mutation', '1', true);
  update public.orders set status = 'cancelled', cancelled_at = now(),
    cancellation_reason = 'cancelled_by_customer' where id = target_order;
  perform set_config('suya.cancellation_mutation', '0', true);
  return true;
end;
$$;

create or replace function public.cancel_order_by_rider(target_order uuid, reason text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  order_row public.orders%rowtype;
begin
  perform set_config('suya.cancellation_mutation', '0', true);
  if actor_id is null then raise exception 'authentication required'; end if;
  reason := btrim(coalesce(reason, ''));
  if length(reason) not between 3 and 300 then raise exception 'valid cancellation reason required'; end if;
  select * into order_row from public.orders where id = target_order for update;
  if not found or order_row.rider_id is distinct from actor_id then return false; end if;
  if order_row.status not in ('confirmed', 'preparing') then return false; end if;
  perform set_config('suya.cancellation_mutation', '1', true);
  update public.orders set status = 'cancelled', cancelled_at = now(),
    cancellation_reason = reason where id = target_order;
  perform set_config('suya.cancellation_mutation', '0', true);
  perform private.release_rider_if_idle(actor_id);
  return true;
end;
$$;

create or replace function private.close_pending_payment_attempts_on_order_cancel()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'cancelled' and old.status is distinct from new.status then
    update public.payment_attempts
    set status = 'failed',
        failure_code = 'order_cancelled',
        updated_at = now()
    where order_id = new.id and status = 'pending';
  end if;
  return new;
end;
$$;

revoke all on function private.close_pending_payment_attempts_on_order_cancel() from public, anon, authenticated;

drop trigger if exists close_pending_payment_attempts_on_order_cancel on public.orders;
create trigger close_pending_payment_attempts_on_order_cancel
after update of status on public.orders
for each row
when (new.status = 'cancelled' and old.status is distinct from new.status)
execute function private.close_pending_payment_attempts_on_order_cancel();

create or replace function public.list_wallet_payment_candidates(p_observation_id uuid)
returns table (
  payment_attempt_id uuid,
  order_id uuid,
  order_code text,
  customer_name text,
  checkout_reference text,
  method public.payment_method,
  amount numeric,
  created_at timestamptz,
  expires_at timestamptz,
  sender_name text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  select pa.id, o.id, o.code, o.customer_name, pa.checkout_reference, pa.method, pa.amount,
    pa.created_at, pa.expires_at, wo.sender_name
  from public.wallet_observations wo
  join public.orders o on o.restaurant_id = wo.restaurant_id
  join public.payment_attempts pa on pa.order_id = o.id
  where wo.id = p_observation_id
    and (private.is_platform_admin() or private.has_restaurant_role(
      wo.restaurant_id, array['owner', 'manager']::public.restaurant_role[]
    ))
    and wo.verification_status in ('unverified', 'under_review')
    and wo.provider in ('yape', 'lemon')
    and wo.currency = 'PEN'
    and o.status not in ('cancelled', 'delivered')
    and pa.provider = 'wallet_observer'
    and pa.method::text = wo.provider
    and pa.status = 'pending'
    and round(pa.amount * 100) = wo.amount_cents
    and pa.created_at <= wo.observed_at
    and pa.expires_at >= wo.observed_at
    and (
      (pa.payer_code_digest is not null and wo.code_fingerprint is not null
        and pa.payer_code_digest = wo.code_fingerprint)
      or (
        (pa.payer_code_digest is null or wo.code_fingerprint is null)
        and pa.payer_code_last4 is not null and wo.code_last4 is not null
        and pa.payer_code_last4 = wo.code_last4
      )
    )
  order by abs(extract(epoch from (wo.observed_at - pa.created_at))), pa.created_at desc
  limit 10;
end;
$$;

create or replace function public.verify_wallet_payment(
  p_observation_id uuid,
  p_payment_attempt_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_observation public.wallet_observations%rowtype;
  v_attempt public.payment_attempts%rowtype;
  v_order_status public.order_status;
  v_matching_attempts bigint := 0;
begin
  select * into v_observation from public.wallet_observations where id = p_observation_id for update;
  if not found then raise exception 'wallet observation not found'; end if;
  if not (private.is_platform_admin() or private.has_restaurant_role(
    v_observation.restaurant_id, array['owner', 'manager']::public.restaurant_role[]
  )) then raise exception 'not authorized'; end if;

  select pa.* into v_attempt
  from public.payment_attempts pa
  join public.orders o on o.id = pa.order_id
  where pa.id = p_payment_attempt_id and o.restaurant_id = v_observation.restaurant_id
  for update;
  if not found then raise exception 'payment attempt not found'; end if;

  select o.status into v_order_status from public.orders o where o.id = v_attempt.order_id;
  if v_order_status in ('cancelled', 'delivered') then
    raise exception 'cancelled order cannot be verified';
  end if;
  if v_observation.verification_status not in ('unverified', 'under_review')
    or v_observation.provider not in ('yape', 'lemon')
    or v_observation.currency <> 'PEN'
    or v_attempt.provider <> 'wallet_observer'
    or round(v_attempt.amount * 100) <> v_observation.amount_cents
    or v_attempt.method::text <> v_observation.provider
    or v_attempt.status <> 'pending'
    or v_attempt.created_at > v_observation.observed_at
    or v_attempt.expires_at < v_observation.observed_at
    or v_observation.code_last4 is null
    or (
      v_attempt.payer_code_digest is not null and v_observation.code_fingerprint is not null
      and v_attempt.payer_code_digest <> v_observation.code_fingerprint
    )
    or (
      (v_attempt.payer_code_digest is null or v_observation.code_fingerprint is null)
      and (v_attempt.payer_code_last4 is null or v_attempt.payer_code_last4 <> v_observation.code_last4)
    ) then
    raise exception 'wallet observation does not match payment identity';
  end if;

  if v_attempt.payer_code_digest is null or v_observation.code_fingerprint is null then
    select count(*) into v_matching_attempts
    from public.payment_attempts pa
    join public.orders o on o.id = pa.order_id
    where o.restaurant_id = v_observation.restaurant_id
      and o.status not in ('cancelled', 'delivered')
      and pa.provider = 'wallet_observer'
      and pa.method::text = v_observation.provider
      and pa.status = 'pending'
      and round(pa.amount * 100) = v_observation.amount_cents
      and pa.created_at <= v_observation.observed_at
      and pa.expires_at >= v_observation.observed_at
      and pa.payer_code_last4 = v_observation.code_last4;
    if v_matching_attempts > 1 then
      raise exception 'payment identity is ambiguous; full operation code required';
    end if;
  end if;

  update public.wallet_observations set verification_status = 'verified' where id = v_observation.id;
  update public.payment_attempts
  set status = 'authorized',
      provider_reference = 'wallet_observation:' || v_observation.id::text,
      observed_wallet_observation_id = v_observation.id,
      updated_at = now()
  where id = v_attempt.id;
  return true;
end;
$$;

revoke execute on function public.list_wallet_payment_candidates(uuid) from public, anon;
grant execute on function public.list_wallet_payment_candidates(uuid) to authenticated;
revoke execute on function public.verify_wallet_payment(uuid, uuid) from public, anon;
grant execute on function public.verify_wallet_payment(uuid, uuid) to authenticated;

comment on function public.verify_wallet_payment(uuid, uuid)
  is 'Verifies one manual wallet attempt only while its order is active and identity matches.';
