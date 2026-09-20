-- Static Lemon QR checkout. The QR is public configuration at the app edge;
-- payment evidence remains server-side and notification evidence stays unverified
-- until a restaurant operator reconciles it against this exact attempt.

alter type public.payment_method add value if not exists 'lemon';

alter table public.payment_attempts
  add column if not exists checkout_reference text,
  add column if not exists expires_at timestamptz;

create unique index if not exists payment_attempts_one_pending_lemon_order_uidx
  on public.payment_attempts (order_id)
  where provider = 'lemon' and status = 'pending';

-- Payment method stays immutable for normal clients. This transaction allows
-- only the one-way cash -> lemon transition after creating the server attempt.
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

create or replace function public.create_lemon_payment_intent(
  p_order_id uuid,
  p_guest_access_token text default null
)
returns table (
  attempt_id uuid,
  order_id uuid,
  provider text,
  method public.payment_method,
  status public.payment_status,
  amount numeric,
  currency text,
  provider_reference text,
  checkout_reference text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_secret private.order_secrets%rowtype;
  v_attempt public.payment_attempts%rowtype;
  v_provider_reference text;
  v_checkout_reference text;
  v_expires_at timestamptz;
begin
  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then raise exception 'order unavailable'; end if;
  if v_order.status in ('cancelled', 'delivered') then raise exception 'order is closed'; end if;

  if v_order.customer_id is null then
    select * into v_secret from private.order_secrets where order_id = v_order.id;
    if p_guest_access_token is null
       or v_secret.guest_access_token_hash is null
       or extensions.crypt(p_guest_access_token, v_secret.guest_access_token_hash)
          <> v_secret.guest_access_token_hash then
      raise exception 'guest access denied';
    end if;
  elsif v_order.customer_id <> (select auth.uid()) then
    raise exception 'order access denied';
  end if;

  select * into v_attempt
  from public.payment_attempts
  where order_id = v_order.id and provider = 'lemon'
    and status in ('pending', 'authorized')
  order by created_at desc
  limit 1
  for update;

  if found and v_attempt.status = 'authorized' then
    return query select v_attempt.id, v_attempt.order_id, v_attempt.provider,
      v_attempt.method, v_attempt.status, v_attempt.amount, 'PEN'::text,
      v_attempt.provider_reference, v_attempt.checkout_reference, v_attempt.expires_at;
    return;
  end if;

  if found and v_attempt.status = 'pending'
     and coalesce(v_attempt.expires_at, v_attempt.created_at + interval '30 minutes') > now() then
    return query select v_attempt.id, v_attempt.order_id, v_attempt.provider,
      v_attempt.method, v_attempt.status, v_attempt.amount, 'PEN'::text,
      v_attempt.provider_reference, v_attempt.checkout_reference,
      coalesce(v_attempt.expires_at, v_attempt.created_at + interval '30 minutes');
    return;
  end if;

  if found then
    update public.payment_attempts
    set status = 'failed', failure_code = 'expired', updated_at = now()
    where id = v_attempt.id;
  end if;

  v_provider_reference := 'lemon:' || v_order.id::text;
  v_checkout_reference := 'order:' || v_order.code || ':lemon';
  v_expires_at := now() + interval '30 minutes';

  insert into public.payment_attempts (
    order_id, provider, provider_reference, checkout_reference, method,
    status, amount, idempotency_key, expires_at
  ) values (
    v_order.id, 'lemon', v_provider_reference, v_checkout_reference, 'lemon',
    'pending', v_order.total, v_provider_reference, v_expires_at
  ) returning * into v_attempt;

  perform set_config('suya.payment_method_mutation', '1', true);
  update public.orders
  set payment_method = 'lemon'
  where id = v_order.id;

  return query select v_attempt.id, v_attempt.order_id, v_attempt.provider,
    v_attempt.method, v_attempt.status, v_attempt.amount, 'PEN'::text,
    v_attempt.provider_reference, v_attempt.checkout_reference, v_attempt.expires_at;
end;
$$;

revoke all on function public.create_lemon_payment_intent(uuid, text)
  from public, anon, authenticated;
grant execute on function public.create_lemon_payment_intent(uuid, text)
  to anon, authenticated;

-- Anonymous menu receipts need payment method after a refresh.
drop function if exists public.get_guest_order(uuid, text);

create function public.get_guest_order(p_order_id uuid, p_access_token text)
returns table (
  order_id uuid, code text, restaurant_id uuid, origin text, status public.order_status,
  payment_method public.payment_method, table_id uuid, table_session_id uuid,
  customer_name text, customer_phone text, delivery_address text, delivery_reference text,
  subtotal numeric, delivery_fee numeric, discount numeric, total numeric,
  estimated_minutes integer, created_at timestamptz, cancellation_reason text,
  delivery_code text, cancel_code text, items jsonb, events jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select o.id, o.code, o.restaurant_id, o.origin, o.status, o.payment_method,
    o.table_id, o.table_session_id, o.customer_name, o.customer_phone,
    o.delivery_address, o.delivery_reference, o.subtotal, o.delivery_fee,
    o.discount, o.total, o.estimated_minutes, o.created_at, o.cancellation_reason,
    s.delivery_code, s.cancel_code,
    coalesce((select jsonb_agg(jsonb_build_object(
      'id', i.id, 'product_id', i.product_id, 'product_name', i.product_name,
      'unit_price', i.unit_price, 'quantity', i.quantity, 'extras', i.extras,
      'note', i.note, 'image_url', i.image_url) order by i.id)
      from public.order_items i where i.order_id = o.id), '[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object('status', e.status, 'created_at', e.created_at)
      order by e.created_at) from public.order_events e where e.order_id = o.id), '[]'::jsonb)
  from public.orders o
  join private.order_secrets s on s.order_id = o.id
  where o.id = p_order_id and o.customer_id is null and o.origin in ('menu', 'table_qr')
    and p_access_token is not null and length(p_access_token) between 32 and 128
    and s.guest_access_token_hash is not null
    and extensions.crypt(p_access_token, s.guest_access_token_hash) = s.guest_access_token_hash;
$$;

revoke all on function public.get_guest_order(uuid, text) from public, anon, authenticated;
grant execute on function public.get_guest_order(uuid, text) to anon, authenticated;

-- Manual reconciliation is intentionally required. Notification text alone never
-- authorizes an order; operator must select exact Lemon evidence and order.
create or replace function public.reconcile_lemon_payment(
  p_observation_id uuid,
  p_order_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_observation public.wallet_observations%rowtype;
  v_attempt public.payment_attempts%rowtype;
  v_order public.orders%rowtype;
begin
  select * into v_observation
  from public.wallet_observations
  where id = p_observation_id;
  if not found then raise exception 'observation unavailable'; end if;

  select pa.* into v_attempt
  from public.payment_attempts pa
  where pa.order_id = p_order_id and pa.provider = 'lemon'
    and pa.status = 'pending'
  order by pa.created_at desc
  limit 1;
  if not found then raise exception 'pending Lemon attempt unavailable'; end if;
  select o.* into v_order from public.orders o where o.id = p_order_id;
  if not found then raise exception 'order unavailable'; end if;
  if v_order.status in ('cancelled', 'delivered') then raise exception 'order is closed'; end if;
  if not (
    private.is_platform_admin()
    or private.has_restaurant_role(v_order.restaurant_id, array['owner', 'manager']::public.restaurant_role[])
  ) then raise exception 'not authorized'; end if;
  if v_observation.restaurant_id <> v_order.restaurant_id
     or v_observation.provider <> 'lemon'
     or v_observation.currency <> 'PEN'
     or v_observation.amount_cents <> round(v_attempt.amount * 100)
     or v_observation.observed_at < v_attempt.created_at - interval '5 minutes'
     or v_observation.observed_at > coalesce(v_attempt.expires_at, now()) + interval '5 minutes' then
    raise exception 'Lemon observation does not match order';
  end if;

  update public.wallet_observations
  set verification_status = 'verified'
  where id = v_observation.id;
  update public.payment_attempts
  set status = 'authorized', updated_at = now()
  where id = v_attempt.id;
  return true;
end;
$$;

revoke all on function public.reconcile_lemon_payment(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.reconcile_lemon_payment(uuid, uuid)
  to authenticated;

comment on function public.create_lemon_payment_intent(uuid, text) is
  'Creates a server-total static Lemon QR attempt; QR image remains client configuration.';
comment on function public.reconcile_lemon_payment(uuid, uuid) is
  'Manually verifies exact Lemon notification evidence against a pending order.';
