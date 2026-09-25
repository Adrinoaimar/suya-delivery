-- Digital orders stay out of restaurant operations until a trusted payment
-- authorization moves them from pending_payment to confirmed.

alter type public.order_status add value if not exists 'pending_payment' before 'confirmed';

create or replace function private.assign_initial_payment_order_status()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.payment_method <> 'cash' then
    new.status := 'pending_payment';
  end if;
  return new;
end;
$$;

revoke all on function private.assign_initial_payment_order_status() from public, anon, authenticated;
drop trigger if exists orders_initial_payment_status on public.orders;
create trigger orders_initial_payment_status
before insert on public.orders
for each row execute function private.assign_initial_payment_order_status();

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

  if new.payment_method is distinct from old.payment_method then
    if old.payment_method <> 'cash'
      or new.payment_method = 'cash'
      or old.status <> 'confirmed'
      or current_setting('suya.payment_method_mutation', true) is distinct from '1' then
      raise exception 'payment method can only be changed by a payment intent';
    end if;
    if old.status = 'confirmed' then
      new.status := 'pending_payment';
    end if;
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
    (old.status = 'confirmed' and new.status = 'pending_payment'
      and old.payment_method = 'cash' and new.payment_method <> 'cash'
      and current_setting('suya.payment_method_mutation', true) is not distinct from '1') or
    (old.status = 'pending_payment' and new.status = 'confirmed'
      and current_setting('suya.payment_confirmation_mutation', true) is not distinct from '1') or
    (old.status = 'pending_payment' and new.status = 'cancelled'
      and current_setting('suya.cancellation_mutation', true) is not distinct from '1') or
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

create or replace function private.confirm_order_after_payment_authorized()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_status public.order_status;
  v_order_total numeric;
  v_changed_rows integer := 0;
begin
  if new.status <> 'authorized' or old.status = 'authorized' then
    return new;
  end if;

  select o.status, o.total
    into v_order_status, v_order_total
  from public.orders o
  where o.id = new.order_id
  for update;
  if not found then raise exception 'payment order not found'; end if;
  if round(new.amount, 2) <> round(v_order_total, 2) then
    raise exception 'authorized payment amount must match order total';
  end if;

  if v_order_status = 'pending_payment' then
    perform set_config('suya.payment_confirmation_mutation', '1', true);
    update public.orders
    set status = 'confirmed'
    where id = new.order_id and status = 'pending_payment';
    get diagnostics v_changed_rows = row_count;
    perform set_config('suya.payment_confirmation_mutation', '0', true);
    if v_changed_rows <> 1 then raise exception 'paid order could not be confirmed'; end if;
  elsif v_order_status <> 'confirmed' then
    raise exception 'order is not eligible for payment authorization';
  end if;

  return new;
end;
$$;

revoke all on function private.confirm_order_after_payment_authorized() from public, anon, authenticated;
drop trigger if exists confirm_order_after_payment_authorized on public.payment_attempts;
create trigger confirm_order_after_payment_authorized
after update of status on public.payment_attempts
for each row
when (new.status = 'authorized' and old.status is distinct from new.status)
execute function private.confirm_order_after_payment_authorized();

-- The old checkout path first created cash orders, then opened Culqi in a second
-- request. These combined RPCs create a pending digital order and its local
-- Culqi attempt in one transaction. Culqi's external order is still created by
-- the existing Edge Function after the transaction commits.
create or replace function public.create_delivery_order_with_culqi_payment(
  p_restaurant_id uuid, p_items jsonb, p_customer_phone text, p_delivery_address text,
  p_delivery_reference text, p_request_id uuid, p_method text, p_offer_code text default null,
  p_delivery_latitude double precision default null, p_delivery_longitude double precision default null
)
returns table (order_id uuid, delivery_code text, cancel_code text)
language plpgsql security definer set search_path = '' as $$
declare result record; intent record;
begin
  if lower(trim(coalesce(p_method, ''))) not in ('card', 'yape') then
    raise exception 'Culqi only supports card or Yape';
  end if;
  select * into result from private.create_order_internal_v2(
    p_restaurant_id, p_items, null, p_customer_phone, p_delivery_address, p_delivery_reference,
    p_request_id, false, 'delivery', null, null, p_method, p_offer_code,
    p_delivery_latitude, p_delivery_longitude, null
  );
  perform private.apply_app_offer(result.order_id, p_offer_code);
  select * into intent from public.create_culqi_payment_intent(result.order_id, p_method, null);
  return query select result.order_id, result.delivery_code, result.cancel_code;
end;
$$;

create or replace function public.create_menu_order_with_culqi_payment(
  p_restaurant_id uuid, p_items jsonb, p_customer_name text, p_customer_phone text,
  p_delivery_address text, p_delivery_reference text, p_request_id uuid, p_method text,
  p_offer_code text default null, p_delivery_latitude double precision default null,
  p_delivery_longitude double precision default null, p_guest_access_token text default null
)
returns table (order_id uuid, delivery_code text, cancel_code text, guest_access_token text)
language plpgsql security definer set search_path = '' as $$
declare result record; intent record;
begin
  if lower(trim(coalesce(p_method, ''))) not in ('card', 'yape') then
    raise exception 'Culqi only supports card or Yape';
  end if;
  if not exists (
    select 1 from public.restaurant_menu_settings m
    join public.restaurants r on r.id = m.restaurant_id
    where m.restaurant_id = p_restaurant_id and m.published and r.active
  ) then raise exception 'menu is unavailable'; end if;
  select * into result from private.create_order_internal_v2(
    p_restaurant_id, p_items, p_customer_name, p_customer_phone, p_delivery_address,
    p_delivery_reference, p_request_id, true, 'menu', null, null, p_method, p_offer_code,
    p_delivery_latitude, p_delivery_longitude, p_guest_access_token
  );
  perform private.apply_app_offer(result.order_id, p_offer_code);
  select * into intent from public.create_culqi_payment_intent(
    result.order_id, p_method, result.guest_access_token
  );
  return query select result.order_id, result.delivery_code, result.cancel_code, result.guest_access_token;
end;
$$;

create or replace function public.create_table_order_with_culqi_payment(
  p_restaurant_id uuid, p_items jsonb, p_customer_name text, p_customer_phone text,
  p_delivery_address text, p_delivery_reference text, p_request_id uuid, p_table_id uuid,
  p_table_session_id uuid, p_method text, p_offer_code text default null,
  p_guest_access_token text default null
)
returns table (order_id uuid, delivery_code text, cancel_code text, guest_access_token text)
language plpgsql security definer set search_path = '' as $$
declare v_session uuid; result record; intent record;
begin
  if p_table_id is null then raise exception 'table is required'; end if;
  if lower(trim(coalesce(p_method, ''))) not in ('card', 'yape') then
    raise exception 'Culqi only supports card or Yape';
  end if;
  select s.id into v_session from public.table_sessions s
  join public.restaurant_tables t on t.id = s.table_id
  where s.table_id = p_table_id and s.restaurant_id = p_restaurant_id and t.active
    and s.status in ('open', 'payment_pending')
    and (p_table_session_id is null or s.id = p_table_session_id)
  order by s.opened_at desc limit 1;
  if v_session is null then raise exception 'active table session is required'; end if;
  select * into result from private.create_order_internal_v2(
    p_restaurant_id, p_items, p_customer_name, p_customer_phone, p_delivery_address,
    p_delivery_reference, p_request_id, true, 'table_qr', p_table_id, v_session, p_method,
    p_offer_code, null, null, p_guest_access_token
  );
  perform private.apply_app_offer(result.order_id, p_offer_code);
  select * into intent from public.create_culqi_payment_intent(
    result.order_id, p_method, result.guest_access_token
  );
  return query select result.order_id, result.delivery_code, result.cancel_code, result.guest_access_token;
end;
$$;

revoke all on function public.create_delivery_order_with_culqi_payment(
  uuid, jsonb, text, text, text, uuid, text, text, double precision, double precision
) from public, anon;
grant execute on function public.create_delivery_order_with_culqi_payment(
  uuid, jsonb, text, text, text, uuid, text, text, double precision, double precision
) to authenticated;
revoke all on function public.create_menu_order_with_culqi_payment(
  uuid, jsonb, text, text, text, text, uuid, text, text, double precision, double precision, text
) from public;
grant execute on function public.create_menu_order_with_culqi_payment(
  uuid, jsonb, text, text, text, text, uuid, text, text, double precision, double precision, text
) to anon, authenticated;
revoke all on function public.create_table_order_with_culqi_payment(
  uuid, jsonb, text, text, text, text, uuid, uuid, uuid, text, text, text
) from public;
grant execute on function public.create_table_order_with_culqi_payment(
  uuid, jsonb, text, text, text, text, uuid, uuid, uuid, text, text, text
) to anon, authenticated;


create or replace function public.confirm_manual_wallet_payment_by_code_v2(
  p_order_id uuid,
  p_confirmation_code text,
  p_guest_access_token text default null
)
returns table (
  confirmation_status text,
  payment_attempt_id uuid,
  observation_id uuid,
  observed_at timestamptz,
  payer_display_name text,
  observed_amount_cents bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_attempt public.payment_attempts%rowtype;
  v_observation public.wallet_observations%rowtype;
  v_guest_ok boolean := false;
  v_confirmation_code text := regexp_replace(trim(coalesce(p_confirmation_code, '')), '\s+', '', 'g');
  v_matching_observations bigint := 0;
  v_other_observations bigint := 0;
  v_changed_rows integer := 0;
begin
  if p_order_id is null
    or v_confirmation_code !~ '^[0-9]{3}$' then
    raise exception 'valid three digit Yape code is required';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;
  if not found then raise exception 'order not found'; end if;

  if v_order.customer_id is null then
    select exists (
      select 1 from private.order_secrets s
      where s.order_id = v_order.id
        and p_guest_access_token is not null
        and length(p_guest_access_token) between 32 and 128
        and s.guest_access_token_hash is not null
        and extensions.crypt(p_guest_access_token, s.guest_access_token_hash) = s.guest_access_token_hash
    ) into v_guest_ok;
    if not v_guest_ok then raise exception 'guest order token is invalid'; end if;
  elsif (select auth.uid()) is null or v_order.customer_id <> (select auth.uid()) then
    raise exception 'order owner required';
  end if;

  select * into v_attempt
  from public.payment_attempts pa
  where pa.order_id = v_order.id
  order by pa.created_at desc
  limit 1
  for update;
  if not found then raise exception 'payment attempt not found'; end if;
  if v_attempt.method <> 'yape' then
    raise exception 'three digit confirmation is only valid for Yape';
  end if;

  if v_order.status = 'cancelled' then
    if v_order.cancellation_reason = 'partial_wallet_payment'
      and v_attempt.status = 'failed'
      and v_attempt.failure_code = 'partial_payment_review'
      and v_attempt.observed_wallet_observation_id is not null then
      select * into v_observation
      from public.wallet_observations wo
      where wo.id = v_attempt.observed_wallet_observation_id;
      if found and v_observation.verification_status = 'under_review' then
        return query select
          'amount_mismatch'::text,
          v_attempt.id,
          v_observation.id,
          v_observation.observed_at,
          null::text,
          v_observation.amount_cents::bigint;
        return;
      end if;
    end if;
    raise exception 'cancelled order cannot be paid';
  end if;

  if v_attempt.status = 'authorized' then
    select * into v_observation
    from public.wallet_observations wo
    where wo.id = v_attempt.observed_wallet_observation_id;
    return query select
      'authorized'::text,
      v_attempt.id,
      v_observation.id,
      v_observation.observed_at,
      coalesce(v_observation.sender_name, v_attempt.payer_display_name),
      v_observation.amount_cents::bigint;
    return;
  end if;
  if v_attempt.status <> 'pending' then
    raise exception 'payment attempt is no longer pending';
  end if;

  perform public.declare_manual_payment(
    p_order_id,
    v_confirmation_code,
    null,
    p_guest_access_token
  );

  select count(*) into v_matching_observations
  from public.wallet_observations wo
  where wo.restaurant_id = v_order.restaurant_id
    and wo.verification_status in ('unverified', 'under_review')
    and wo.provider = 'yape'
    and wo.currency = 'PEN'
    and ((v_attempt.receiver_account_id is not null and wo.receiver_account_id = v_attempt.receiver_account_id)
      or (v_attempt.receiver_account_id is null and wo.receiver_account_id is null))
    and wo.code_last4 = v_confirmation_code
    and v_attempt.created_at <= wo.observed_at
    and v_attempt.expires_at >= wo.observed_at;

  if v_matching_observations = 0 then
    select count(*) into v_other_observations
    from public.wallet_observations wo
    where wo.restaurant_id = v_order.restaurant_id
      and wo.verification_status in ('unverified', 'under_review')
      and wo.provider = 'yape'
      and wo.currency = 'PEN'
      and wo.amount_cents = round(v_attempt.amount * 100)
      and ((v_attempt.receiver_account_id is not null and wo.receiver_account_id = v_attempt.receiver_account_id)
        or (v_attempt.receiver_account_id is null and wo.receiver_account_id is null))
      and wo.code_last4 <> v_confirmation_code
      and v_attempt.created_at <= wo.observed_at
      and v_attempt.expires_at >= wo.observed_at;

    if v_other_observations = 1 then
      return query select
        'code_mismatch'::text,
        v_attempt.id,
        null::uuid,
        null::timestamptz,
        null::text,
        null::bigint;
      return;
    end if;

    if v_other_observations > 1 then
      return query select
        'ambiguous'::text,
        v_attempt.id,
        null::uuid,
        null::timestamptz,
        null::text,
        null::bigint;
      return;
    end if;

    return query select
      'pending'::text,
      v_attempt.id,
      null::uuid,
      null::timestamptz,
      null::text,
      null::bigint;
    return;
  end if;
  if v_matching_observations <> 1 then
    return query select
      'ambiguous'::text,
      v_attempt.id,
      null::uuid,
      null::timestamptz,
      null::text,
      null::bigint;
    return;
  end if;

  select * into v_observation
  from public.wallet_observations wo
  where wo.restaurant_id = v_order.restaurant_id
    and wo.verification_status in ('unverified', 'under_review')
    and wo.provider = 'yape'
    and wo.currency = 'PEN'
    and ((v_attempt.receiver_account_id is not null and wo.receiver_account_id = v_attempt.receiver_account_id)
      or (v_attempt.receiver_account_id is null and wo.receiver_account_id is null))
    and wo.code_last4 = v_confirmation_code
    and v_attempt.created_at <= wo.observed_at
    and v_attempt.expires_at >= wo.observed_at
  limit 1
  for update;

  if v_observation.amount_cents <> round(v_attempt.amount * 100) then
    update public.wallet_observations
    set verification_status = 'under_review'
    where id = v_observation.id;

    if v_observation.amount_cents < round(v_attempt.amount * 100)
      and v_order.status in ('pending_payment', 'confirmed', 'preparing') then
      perform set_config('suya.cancellation_mutation', '1', true);
      update public.orders
      set status = 'cancelled',
          cancelled_at = now(),
          cancellation_reason = 'partial_wallet_payment'
      where id = v_order.id and status in ('pending_payment', 'confirmed', 'preparing');
      get diagnostics v_changed_rows = row_count;
      perform set_config('suya.cancellation_mutation', '0', true);
      if v_changed_rows <> 1 then
        raise exception 'partial payment could not cancel the order';
      end if;

      update public.payment_attempts
      set observed_wallet_observation_id = v_observation.id,
          failure_code = 'partial_payment_review',
          updated_at = now()
      where id = v_attempt.id and status = 'failed';
      get diagnostics v_changed_rows = row_count;
      if v_changed_rows <> 1 then
        raise exception 'partial payment review could not be recorded';
      end if;

      return query select
        'amount_mismatch'::text,
        v_attempt.id,
        v_observation.id,
        v_observation.observed_at,
        null::text,
        v_observation.amount_cents::bigint;
      return;
    end if;

    return query select
      'amount_mismatch'::text,
      v_attempt.id,
      null::uuid,
      null::timestamptz,
      null::text,
      v_observation.amount_cents::bigint;
    return;
  end if;

  update public.wallet_observations
  set verification_status = 'verified'
  where id = v_observation.id;

  update public.payment_attempts
  set status = 'authorized',
      payer_display_name = v_observation.sender_name,
      provider_reference = 'wallet_observation:' || v_observation.id::text,
      observed_wallet_observation_id = v_observation.id,
      updated_at = now()
  where id = v_attempt.id;

  return query select
    'authorized'::text,
    v_attempt.id,
    v_observation.id,
    v_observation.observed_at,
    v_observation.sender_name,
    v_observation.amount_cents::bigint;
end;
$$;

revoke all on function public.confirm_manual_wallet_payment_by_code_v2(uuid, text, text) from public;
grant execute on function public.confirm_manual_wallet_payment_by_code_v2(uuid, text, text) to anon, authenticated;

comment on function public.confirm_manual_wallet_payment_by_code_v2(uuid, text, text)
  is 'Client Yape confirmation cancels an unconfirmed, confirmed or preparing order on a code-matched partial payment, retains its observation for Caja review, and authorizes only one exact code, receiver, time and amount match.';
