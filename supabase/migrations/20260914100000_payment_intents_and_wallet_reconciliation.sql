-- Payment intent lifecycle for digital checkout.
-- Amounts are copied from the locked order; clients never choose the payable amount.

alter type public.payment_method add value if not exists 'lemon';

-- Public merchant QR payload. It is optional until the account is configured.
create table if not exists public.restaurant_payment_accounts (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  provider text not null check (provider in ('yape', 'lemon')),
  account_label text not null check (length(trim(account_label)) between 1 and 120),
  qr_payload text check (qr_payload is null or length(trim(qr_payload)) between 1 and 4000),
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, provider)
);

alter table public.restaurant_payment_accounts enable row level security;
revoke all on public.restaurant_payment_accounts from public, anon, authenticated;

create or replace function public.list_restaurant_payment_accounts(p_restaurant_id uuid)
returns table (
  id uuid,
  restaurant_id uuid,
  provider text,
  account_label text,
  qr_payload text,
  active boolean
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (private.is_platform_admin() or private.has_restaurant_role(
    p_restaurant_id, array['owner', 'manager']::public.restaurant_role[]
  )) then raise exception 'not authorized'; end if;
  return query
  select a.id, a.restaurant_id, a.provider, a.account_label, a.qr_payload, a.active
  from public.restaurant_payment_accounts a
  where a.restaurant_id = p_restaurant_id
  order by a.provider;
end;
$$;

create or replace function public.upsert_restaurant_payment_account(
  p_restaurant_id uuid,
  p_provider text,
  p_account_label text,
  p_qr_payload text,
  p_active boolean
)
returns table (
  id uuid,
  restaurant_id uuid,
  provider text,
  account_label text,
  qr_payload text,
  active boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_provider text := lower(trim(coalesce(p_provider, '')));
  v_label text := nullif(left(regexp_replace(trim(coalesce(p_account_label, '')), '\s+', ' ', 'g'), 120), '');
  v_qr text := nullif(trim(coalesce(p_qr_payload, '')), '');
begin
  if not (private.is_platform_admin() or private.has_restaurant_role(
    p_restaurant_id, array['owner', 'manager']::public.restaurant_role[]
  )) then raise exception 'not authorized'; end if;
  if v_provider not in ('yape', 'lemon') or v_label is null then
    raise exception 'invalid payment account';
  end if;
  if v_qr is not null and length(v_qr) > 4000 then raise exception 'QR payload is too long'; end if;
  return query
  insert into public.restaurant_payment_accounts (
    restaurant_id, provider, account_label, qr_payload, active
  ) values (p_restaurant_id, v_provider, v_label, v_qr, coalesce(p_active, false))
  on conflict (restaurant_id, provider) do update set
    account_label = excluded.account_label,
    qr_payload = excluded.qr_payload,
    active = excluded.active,
    updated_at = now()
  returning restaurant_payment_accounts.id, restaurant_payment_accounts.restaurant_id,
    restaurant_payment_accounts.provider, restaurant_payment_accounts.account_label,
    restaurant_payment_accounts.qr_payload, restaurant_payment_accounts.active;
end;
$$;

alter table public.payment_attempts
  add column if not exists checkout_reference text,
  add column if not exists expires_at timestamptz,
  add column if not exists observed_wallet_observation_id uuid references public.wallet_observations(id) on delete set null;

update public.payment_attempts
set checkout_reference = 'SUYA-' || upper(substr(replace(id::text, '-', ''), 1, 8))
where checkout_reference is null;

update public.payment_attempts
set expires_at = created_at + interval '30 minutes'
where expires_at is null;

alter table public.payment_attempts
  alter column checkout_reference set default ('SUYA-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))),
  alter column checkout_reference set not null,
  alter column expires_at set default (now() + interval '30 minutes'),
  alter column expires_at set not null;

create unique index if not exists payment_attempts_checkout_reference_uidx
  on public.payment_attempts (checkout_reference);

create unique index if not exists payment_attempts_one_pending_order_uidx
  on public.payment_attempts (order_id)
  where status = 'pending';

-- Payment method is immutable for normal clients. Only create_payment_intent can
-- make the one-way cash -> digital transition inside its transaction.
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

create or replace function public.create_payment_intent(
  p_order_id uuid,
  p_method text,
  p_guest_access_token text default null
)
returns table (
  attempt_id uuid,
  order_id uuid,
  method public.payment_method,
  status public.payment_status,
  amount numeric,
  currency text,
  checkout_reference text,
  expires_at timestamptz,
  provider text,
  qr_payload text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_method public.payment_method;
  v_attempt public.payment_attempts%rowtype;
  v_qr_payload text;
  v_guest_ok boolean := false;
  v_idempotency text;
begin
  if p_order_id is null then raise exception 'order is required'; end if;
  if lower(trim(coalesce(p_method, ''))) not in ('yape', 'lemon') then
    raise exception 'digital wallet is not configured for this method';
  end if;
  v_method := lower(trim(p_method))::public.payment_method;

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;
  if not found then raise exception 'order not found'; end if;
  if v_order.status = 'cancelled' then raise exception 'cancelled order cannot be paid'; end if;

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
  elsif v_order.customer_id <> (select auth.uid()) then
    raise exception 'order owner required';
  end if;

  if v_order.payment_method <> 'cash' and v_order.payment_method <> v_method then
    raise exception 'order already uses another payment method';
  end if;

  select pa.* into v_attempt
  from public.payment_attempts pa
  where order_id = v_order.id
    and status in ('pending', 'authorized')
  order by created_at desc
  limit 1
  for update;
  if found then
    if v_attempt.method <> v_method then raise exception 'order already has another payment attempt'; end if;
    select rpa.qr_payload into v_qr_payload
    from public.restaurant_payment_accounts rpa
    where rpa.restaurant_id = v_order.restaurant_id and rpa.provider = v_method::text and rpa.active;
    return query select v_attempt.id, v_attempt.order_id, v_attempt.method, v_attempt.status,
      v_attempt.amount, 'PEN'::text, v_attempt.checkout_reference, v_attempt.expires_at,
      v_attempt.provider, v_qr_payload;
    return;
  end if;

  if v_order.total <= 0 then raise exception 'order total must be positive'; end if;
  v_idempotency := 'order:' || v_order.id::text || ':' || v_method::text;
  perform set_config('suya.payment_method_mutation', '1', true);
  update public.orders set payment_method = v_method where id = v_order.id;

  insert into public.payment_attempts (
    order_id, provider, method, status, amount, idempotency_key, expires_at
  ) values (
    v_order.id, 'wallet_observer', v_method, 'pending', v_order.total, v_idempotency,
    now() + interval '30 minutes'
  ) returning * into v_attempt;

  select rpa.qr_payload into v_qr_payload
  from public.restaurant_payment_accounts rpa
  where rpa.restaurant_id = v_order.restaurant_id and rpa.provider = v_method::text and rpa.active;

  return query select v_attempt.id, v_attempt.order_id, v_attempt.method, v_attempt.status,
    v_attempt.amount, 'PEN'::text, v_attempt.checkout_reference, v_attempt.expires_at,
    v_attempt.provider, v_qr_payload;
end;
$$;

create or replace function public.get_payment_intent(
  p_order_id uuid,
  p_guest_access_token text default null
)
returns table (
  attempt_id uuid,
  order_id uuid,
  method public.payment_method,
  status public.payment_status,
  amount numeric,
  currency text,
  checkout_reference text,
  expires_at timestamptz,
  provider text,
  qr_payload text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_attempt public.payment_attempts%rowtype;
  v_guest_ok boolean := false;
  v_qr_payload text;
begin
  select * into v_order from public.orders where id = p_order_id;
  if not found then return; end if;
  if v_order.customer_id is null then
    select exists (
      select 1 from private.order_secrets s
      where s.order_id = v_order.id
        and p_guest_access_token is not null
        and length(p_guest_access_token) between 32 and 128
        and extensions.crypt(p_guest_access_token, s.guest_access_token_hash) = s.guest_access_token_hash
    ) into v_guest_ok;
    if not v_guest_ok then return; end if;
  elsif v_order.customer_id <> (select auth.uid()) then
    return;
  end if;
  select * into v_attempt from public.payment_attempts
  where order_id = p_order_id order by created_at desc limit 1;
  if not found then return; end if;
  select rpa.qr_payload into v_qr_payload
  from public.restaurant_payment_accounts rpa
  where rpa.restaurant_id = v_order.restaurant_id and rpa.provider = v_attempt.method::text and rpa.active;
  return query select v_attempt.id, v_attempt.order_id, v_attempt.method, v_attempt.status,
    v_attempt.amount, 'PEN'::text, v_attempt.checkout_reference, v_attempt.expires_at,
    v_attempt.provider, v_qr_payload;
end;
$$;

create or replace function public.list_wallet_payment_candidates(p_observation_id uuid)
returns table (
  payment_attempt_id uuid,
  order_id uuid,
  order_code text,
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
  select pa.id, o.id, o.code, pa.checkout_reference, pa.method, pa.amount,
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
    and pa.method::text = wo.provider
    and pa.status = 'pending'
    and round(pa.amount * 100) = wo.amount_cents
    and pa.created_at <= wo.observed_at
    and pa.expires_at >= wo.observed_at
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
begin
  select * into v_observation from public.wallet_observations where id = p_observation_id for update;
  if not found then raise exception 'wallet observation not found'; end if;
  if not (private.is_platform_admin() or private.has_restaurant_role(
    v_observation.restaurant_id, array['owner', 'manager']::public.restaurant_role[]
  )) then raise exception 'not authorized'; end if;

  select pa.* into v_attempt from public.payment_attempts pa
  join public.orders o on o.id = pa.order_id
  where pa.id = p_payment_attempt_id and o.restaurant_id = v_observation.restaurant_id
  for update;
  if not found then raise exception 'payment attempt not found'; end if;
  if v_observation.verification_status not in ('unverified', 'under_review')
    or v_observation.provider not in ('yape', 'lemon')
    or v_observation.currency <> 'PEN'
    or round(v_attempt.amount * 100) <> v_observation.amount_cents
    or v_attempt.method::text <> v_observation.provider
    or v_attempt.status <> 'pending'
    or v_attempt.expires_at < v_observation.observed_at then
    raise exception 'wallet observation does not match payment attempt';
  end if;

  update public.wallet_observations
  set verification_status = 'verified'
  where id = v_observation.id;
  update public.payment_attempts
  set status = 'authorized',
      provider_reference = 'wallet_observation:' || v_observation.id::text,
      observed_wallet_observation_id = v_observation.id
  where id = v_attempt.id;
  return true;
end;
$$;

revoke all on function public.create_payment_intent(uuid, text, text) from public, anon;
grant execute on function public.create_payment_intent(uuid, text, text) to anon, authenticated;
revoke all on function public.get_payment_intent(uuid, text) from public;
grant execute on function public.get_payment_intent(uuid, text) to anon, authenticated;
revoke all on function public.list_restaurant_payment_accounts(uuid) from public, anon;
grant execute on function public.list_restaurant_payment_accounts(uuid) to authenticated;
revoke all on function public.upsert_restaurant_payment_account(uuid, text, text, text, boolean) from public, anon;
grant execute on function public.upsert_restaurant_payment_account(uuid, text, text, text, boolean) to authenticated;
revoke all on function public.list_wallet_payment_candidates(uuid) from public, anon;
grant execute on function public.list_wallet_payment_candidates(uuid) to authenticated;
revoke all on function public.verify_wallet_payment(uuid, uuid) from public, anon;
grant execute on function public.verify_wallet_payment(uuid, uuid) to authenticated;

comment on function public.create_payment_intent(uuid, text, text)
  is 'Creates an exact-total digital wallet intent. Guest access is token-gated.';
comment on function public.verify_wallet_payment(uuid, uuid)
  is 'Operator confirmation only after exact restaurant/provider/currency/amount/time match.';
