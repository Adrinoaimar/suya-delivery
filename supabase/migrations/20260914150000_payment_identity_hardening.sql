-- Stronger wallet identity for the two-orders-at-the-same-amount case.
-- Store a deterministic digest for exact matching; expose only the last four.

alter table public.wallet_observations
  add column if not exists code_fingerprint text
    check (code_fingerprint is null or length(code_fingerprint) = 64);

alter table public.payment_attempts
  add column if not exists payer_code_digest text
    check (payer_code_digest is null or length(payer_code_digest) = 64);

create or replace function public.ingest_wallet_observation(
  p_device_token text,
  p_event_id text,
  p_provider text,
  p_sender_name text,
  p_code text,
  p_amount_cents bigint,
  p_currency text,
  p_observed_at timestamptz
)
returns table (
  observation_id uuid,
  was_inserted boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_device public.wallet_observer_devices%rowtype;
  v_event_id text := nullif(left(trim(coalesce(p_event_id, '')), 160), '');
  v_provider text := lower(trim(coalesce(p_provider, '')));
  v_currency text := upper(trim(coalesce(p_currency, 'PEN')));
  v_name text := nullif(left(regexp_replace(trim(coalesce(p_sender_name, '')), '\s+', ' ', 'g'), 120), '');
  v_code text := nullif(left(lower(regexp_replace(trim(coalesce(p_code, '')), '\s+', '', 'g')), 160), '');
  v_observation_id uuid;
begin
  if length(trim(coalesce(p_device_token, ''))) < 48 then
    raise exception 'invalid device token';
  end if;
  if v_event_id is null or v_provider not in ('yape', 'lemon', 'plin', 'mercado_pago', 'generic') then
    raise exception 'invalid wallet observation';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 or p_amount_cents > 100000000 then
    raise exception 'invalid amount';
  end if;
  if v_currency not in ('PEN', 'ARS', 'USD') then
    raise exception 'unsupported currency';
  end if;
  if p_observed_at is null
     or p_observed_at < now() - interval '7 days'
     or p_observed_at > now() + interval '5 minutes' then
    raise exception 'invalid observed_at';
  end if;
  if v_code is not null and v_code !~ '^[a-z0-9-]+$' then
    v_code := null;
  end if;

  select d.* into v_device
  from public.wallet_observer_devices d
  where d.active
    and extensions.crypt(trim(p_device_token), d.token_hash) = d.token_hash
  limit 1;
  if not found then raise exception 'invalid device token'; end if;

  insert into public.wallet_observations (
    device_id, restaurant_id, event_id, provider, sender_name,
    code_digest, code_fingerprint, code_last4, amount_cents, currency,
    verification_status, observed_at
  )
  values (
    v_device.id,
    v_device.restaurant_id,
    v_event_id,
    v_provider,
    v_name,
    case when v_code is null then null else extensions.crypt(v_code, extensions.gen_salt('bf')) end,
    case when v_code is null then null else encode(extensions.digest(v_code, 'sha256'), 'hex') end,
    case when v_code is null then null else right(v_code, 4) end,
    p_amount_cents,
    v_currency,
    'unverified',
    p_observed_at
  )
  on conflict (device_id, event_id) do nothing
  returning id into v_observation_id;

  update public.wallet_observer_devices
  set last_seen_at = greatest(coalesce(last_seen_at, p_observed_at), p_observed_at)
  where id = v_device.id;

  if v_observation_id is null then
    select o.id into v_observation_id
    from public.wallet_observations o
    where o.device_id = v_device.id and o.event_id = v_event_id;
    return query select v_observation_id, false;
  end if;
  return query select v_observation_id, true;
end;
$$;

create or replace function public.submit_payment_evidence(
  p_order_id uuid,
  p_code text,
  p_guest_access_token text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_attempt public.payment_attempts%rowtype;
  v_guest_ok boolean := false;
  v_code text := lower(regexp_replace(trim(coalesce(p_code, '')), '\s+', '', 'g'));
begin
  if p_order_id is null or v_code is null or length(v_code) < 3 or length(v_code) > 64
    or v_code !~ '^[a-z0-9-]+$' then
    raise exception 'invalid payment evidence code';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
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
  elsif v_order.customer_id <> (select auth.uid()) then
    raise exception 'order owner required';
  end if;

  select pa.* into v_attempt
  from public.payment_attempts pa
  where pa.order_id = v_order.id and pa.status = 'pending'
  order by pa.created_at desc limit 1 for update;
  if not found then raise exception 'pending payment attempt not found'; end if;
  if v_attempt.method not in ('yape', 'lemon') then
    raise exception 'evidence code is only valid for wallet payments';
  end if;

  update public.payment_attempts
  set payer_code_last4 = right(v_code, 4),
      payer_code_digest = encode(extensions.digest(v_code, 'sha256'), 'hex'),
      updated_at = now()
  where id = v_attempt.id;
  return true;
end;
$$;

create or replace function public.set_wallet_observation_code(
  p_observation_id uuid,
  p_code text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_observation public.wallet_observations%rowtype;
  v_code text := lower(regexp_replace(trim(coalesce(p_code, '')), '\s+', '', 'g'));
begin
  if p_observation_id is null or v_code is null or length(v_code) < 3 or length(v_code) > 64
    or v_code !~ '^[a-z0-9-]+$' then
    raise exception 'invalid wallet observation code';
  end if;
  select * into v_observation from public.wallet_observations where id = p_observation_id for update;
  if not found then raise exception 'wallet observation not found'; end if;
  if not (private.is_platform_admin() or private.has_restaurant_role(
    v_observation.restaurant_id, array['owner', 'manager']::public.restaurant_role[]
  )) then raise exception 'not authorized'; end if;
  if v_observation.verification_status not in ('unverified', 'under_review') then
    raise exception 'wallet observation is already closed';
  end if;

  update public.wallet_observations
  set code_digest = extensions.crypt(v_code, extensions.gen_salt('bf')),
      code_fingerprint = encode(extensions.digest(v_code, 'sha256'), 'hex'),
      code_last4 = right(v_code, 4)
  where id = v_observation.id;
  return true;
end;
$$;

drop function if exists public.list_wallet_payment_candidates(uuid);

create function public.list_wallet_payment_candidates(p_observation_id uuid)
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
  if v_observation.verification_status not in ('unverified', 'under_review')
    or v_observation.provider not in ('yape', 'lemon')
    or v_observation.currency <> 'PEN'
    or round(v_attempt.amount * 100) <> v_observation.amount_cents
    or v_attempt.method::text <> v_observation.provider
    or v_attempt.status <> 'pending'
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

revoke execute on function public.set_wallet_observation_code(uuid, text) from public, anon;
grant execute on function public.set_wallet_observation_code(uuid, text) to authenticated;
revoke execute on function public.list_wallet_payment_candidates(uuid) from public, anon;
grant execute on function public.list_wallet_payment_candidates(uuid) to authenticated;

comment on function public.set_wallet_observation_code(uuid, text)
  is 'Backoffice may add the visible wallet operation code; only a digest and last four are retained.';
