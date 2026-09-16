-- Declaración explícita del cliente para pagos manuales.
-- La declaración conserva el intento original y nunca autoriza por sí sola.
-- Los códigos nuevos se comparan con HMAC de una clave que solo vive en Postgres;
-- los campos SHA heredados se mantienen únicamente para leer instalaciones previas.

alter table public.payment_attempts
  add column if not exists payment_declared_at timestamptz,
  add column if not exists payer_display_name text
    check (payer_display_name is null or length(trim(payer_display_name)) between 2 and 120),
  add column if not exists payer_code_hmac text
    check (payer_code_hmac is null or length(payer_code_hmac) = 64);

alter table public.wallet_observations
  add column if not exists code_hmac text
    check (code_hmac is null or length(code_hmac) = 64);

create table if not exists private.payment_claim_secrets (
  id boolean primary key default true check (id),
  hmac_key text not null check (length(hmac_key) >= 64),
  created_at timestamptz not null default now()
);

revoke all on private.payment_claim_secrets from public, anon, authenticated;
grant select on private.payment_claim_secrets to service_role;

insert into private.payment_claim_secrets (id, hmac_key)
values (true, encode(extensions.gen_random_bytes(32), 'hex'))
on conflict (id) do nothing;

create table if not exists public.payment_claims (
  id uuid primary key default extensions.gen_random_uuid(),
  payment_attempt_id uuid not null unique references public.payment_attempts(id) on delete restrict,
  order_id uuid not null references public.orders(id) on delete restrict,
  payer_display_name text
    check (payer_display_name is null or length(trim(payer_display_name)) between 2 and 120),
  code_hmac text check (code_hmac is null or length(code_hmac) = 64),
  code_last4 text check (code_last4 is null or length(code_last4) between 1 and 4),
  declared_at timestamptz not null default now(),
  declared_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.payment_claims enable row level security;
revoke all on public.payment_claims from public, anon, authenticated;

create or replace function private.payment_claim_hmac(p_code text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text;
  v_code text := lower(regexp_replace(trim(coalesce(p_code, '')), '\s+', '', 'g'));
begin
  if v_code is null or length(v_code) < 3 or length(v_code) > 64
    or v_code !~ '^[a-z0-9-]+$' then
    raise exception 'invalid payment evidence code';
  end if;
  select s.hmac_key into v_key
  from private.payment_claim_secrets s
  where s.id;
  if v_key is null then raise exception 'payment evidence key is unavailable'; end if;
  return encode(extensions.hmac(v_code, v_key, 'sha256'), 'hex');
end;
$$;

revoke all on function private.payment_claim_hmac(text) from public, anon, authenticated;

create or replace function public.declare_manual_payment(
  p_order_id uuid,
  p_code text default null,
  p_payer_display_name text default null,
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
  v_code text := nullif(lower(regexp_replace(trim(coalesce(p_code, '')), '\s+', '', 'g')), '');
  v_payer text := nullif(left(regexp_replace(trim(coalesce(p_payer_display_name, '')), '\s+', ' ', 'g'), 120), '');
  v_hmac text;
begin
  if p_order_id is null then raise exception 'order is required'; end if;
  if v_code is not null and (length(v_code) < 3 or length(v_code) > 64 or v_code !~ '^[a-z0-9-]+$') then
    raise exception 'invalid payment evidence code';
  end if;
  if v_payer is not null and length(v_payer) < 2 then
    raise exception 'invalid payer display name';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
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

  select pa.* into v_attempt
  from public.payment_attempts pa
  where pa.order_id = v_order.id and pa.status = 'pending'
  order by pa.created_at desc
  limit 1
  for update;
  if not found then raise exception 'pending payment attempt not found'; end if;
  if v_attempt.method not in ('yape', 'lemon') then
    raise exception 'payment declaration is only valid for wallet payments';
  end if;
  if v_code is not null then v_hmac := private.payment_claim_hmac(v_code); end if;

  insert into public.payment_claims (
    payment_attempt_id, order_id, payer_display_name, code_hmac, code_last4, declared_by
  ) values (
    v_attempt.id, v_order.id, v_payer, v_hmac, case when v_code is null then null else right(v_code, 4) end,
    (select auth.uid())
  )
  on conflict (payment_attempt_id) do update set
    payer_display_name = coalesce(excluded.payer_display_name, public.payment_claims.payer_display_name),
    code_hmac = coalesce(excluded.code_hmac, public.payment_claims.code_hmac),
    code_last4 = coalesce(excluded.code_last4, public.payment_claims.code_last4),
    updated_at = now();

  update public.payment_attempts
  set payment_declared_at = coalesce(payment_declared_at, now()),
      payer_display_name = coalesce(v_payer, payer_display_name),
      payer_code_hmac = coalesce(v_hmac, payer_code_hmac),
      payer_code_last4 = coalesce(case when v_code is null then null else right(v_code, 4) end, payer_code_last4),
      -- Legacy readers retain a non-authoritative suffix/digest. New matching uses payer_code_hmac.
      payer_code_digest = coalesce(
        case when v_code is null then null else encode(extensions.digest(v_code, 'sha256'), 'hex') end,
        payer_code_digest
      ),
      updated_at = now()
  where id = v_attempt.id;
  return true;
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
begin
  perform public.declare_manual_payment(p_order_id, p_code, null, p_guest_access_token);
  return true;
end;
$$;

create or replace function public.get_payment_declaration(
  p_order_id uuid,
  p_guest_access_token text default null
)
returns table (
  declared_at timestamptz,
  payer_display_name text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_guest_ok boolean := false;
begin
  if p_order_id is null then return; end if;
  select * into v_order from public.orders where id = p_order_id;
  if not found then return; end if;
  if v_order.customer_id is null then
    select exists (
      select 1 from private.order_secrets s
      where s.order_id = v_order.id
        and p_guest_access_token is not null
        and length(p_guest_access_token) between 32 and 128
        and s.guest_access_token_hash is not null
        and extensions.crypt(p_guest_access_token, s.guest_access_token_hash) = s.guest_access_token_hash
    ) into v_guest_ok;
    if not v_guest_ok then return; end if;
  elsif v_order.customer_id <> (select auth.uid()) then
    return;
  end if;

  return query
  select coalesce(pa.payment_declared_at, pc.declared_at),
    coalesce(pa.payer_display_name, pc.payer_display_name)
  from public.payment_attempts pa
  left join public.payment_claims pc on pc.payment_attempt_id = pa.id
  where pa.order_id = p_order_id
  order by pa.created_at desc
  limit 1;
end;
$$;

revoke all on function public.declare_manual_payment(uuid, text, text, text) from public, anon;
grant execute on function public.declare_manual_payment(uuid, text, text, text) to anon, authenticated;
revoke all on function public.get_payment_declaration(uuid, text) from public;
grant execute on function public.get_payment_declaration(uuid, text) to anon, authenticated;

-- A declared attempt is never renewed automatically, even after its display window.
-- It remains pending for assisted review; the original receiver and timestamps stay intact.
create or replace function public.refresh_payment_intent(
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
  v_intent record;
  v_new_attempt public.payment_attempts%rowtype;
  v_receiver_account_id uuid;
  v_qr_payload text;
  v_declared_at timestamptz;
begin
  select * into v_intent
  from public.create_payment_intent(p_order_id, p_method, p_guest_access_token);
  if not found then return; end if;

  select pa.payment_declared_at into v_declared_at
  from public.payment_attempts pa
  where pa.id = v_intent.attempt_id;

  if v_intent.status = 'pending' and v_intent.expires_at <= now() then
    if v_declared_at is not null then
      return query select v_intent.attempt_id, v_intent.order_id, v_intent.method,
        v_intent.status, v_intent.amount, v_intent.currency, v_intent.checkout_reference,
        v_intent.expires_at, v_intent.provider, v_intent.qr_payload;
      return;
    end if;

    update public.payment_attempts as pa
    set status = 'failed', failure_code = 'expired', updated_at = now()
    where pa.id = v_intent.attempt_id
      and pa.status = 'pending'
      and pa.expires_at <= now();

    select pa.receiver_account_id into v_receiver_account_id
    from public.payment_attempts pa
    where pa.id = v_intent.attempt_id;
    if v_receiver_account_id is not null then
      select rpa.qr_payload into v_qr_payload
      from public.restaurant_payment_accounts rpa
      where rpa.id = v_receiver_account_id and rpa.active;
      if not found then raise exception 'receiver payment account is no longer active'; end if;
    else
      select rpa.id, rpa.qr_payload into v_receiver_account_id, v_qr_payload
      from public.restaurant_payment_accounts rpa
      join public.orders o on o.id = p_order_id and o.restaurant_id = rpa.restaurant_id
      where rpa.provider = v_intent.method::text and rpa.active;
      if v_receiver_account_id is null then raise exception 'restaurant payment account is not configured'; end if;
    end if;

    insert into public.payment_attempts (
      order_id, receiver_account_id, provider, method, status, amount, idempotency_key, expires_at
    ) values (
      v_intent.order_id, v_receiver_account_id, 'wallet_observer', v_intent.method, 'pending',
      v_intent.amount,
      'order:' || v_intent.order_id::text || ':' || v_intent.method::text || ':renewal:' || extensions.gen_random_uuid()::text,
      now() + interval '30 minutes'
    ) returning * into v_new_attempt;

    return query select v_new_attempt.id, v_new_attempt.order_id, v_new_attempt.method,
      v_new_attempt.status, v_new_attempt.amount, 'PEN'::text, v_new_attempt.checkout_reference,
      v_new_attempt.expires_at, v_new_attempt.provider, coalesce(v_qr_payload, v_intent.qr_payload);
    return;
  end if;

  return query select v_intent.attempt_id, v_intent.order_id, v_intent.method, v_intent.status,
    v_intent.amount, v_intent.currency, v_intent.checkout_reference, v_intent.expires_at,
    v_intent.provider, v_intent.qr_payload;
end;
$$;

-- New observations carry both a server-only HMAC and the legacy fingerprint.
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
returns table (observation_id uuid, was_inserted boolean)
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
  v_code text := nullif(lower(regexp_replace(trim(coalesce(p_code, '')), '\s+', '', 'g')), '');
  v_device_id uuid;
  v_token text := trim(coalesce(p_device_token, ''));
  v_observation_id uuid;
  v_existing_event boolean := false;
  v_code_hmac text;
begin
  if length(v_token) not between 48 and 128 then raise exception 'invalid device token'; end if;
  if v_event_id is null or v_provider not in ('yape', 'lemon', 'plin', 'mercado_pago', 'generic') then raise exception 'invalid wallet observation'; end if;
  if p_amount_cents is null or p_amount_cents <= 0 or p_amount_cents > 100000000 then raise exception 'invalid amount'; end if;
  if v_currency not in ('PEN', 'ARS', 'USD') then raise exception 'unsupported currency'; end if;
  if p_observed_at is null or p_observed_at < now() - interval '7 days' or p_observed_at > now() + interval '5 minutes' then raise exception 'invalid observed_at'; end if;
  if v_code is not null and (length(v_code) < 3 or length(v_code) > 64 or v_code !~ '^[a-z0-9-]+$') then v_code := null; end if;
  if v_code is not null then v_code_hmac := private.payment_claim_hmac(v_code); end if;

  begin
    v_device_id := split_part(v_token, '.', 1)::uuid;
  exception when invalid_text_representation then
    v_device_id := null;
  end;
  if v_device_id is not null then
    select d.* into v_device from public.wallet_observer_devices d
    where d.id = v_device_id and d.active and extensions.crypt(v_token, d.token_hash) = d.token_hash;
  else
    select d.* into v_device from public.wallet_observer_devices d
    where d.active and extensions.crypt(v_token, d.token_hash) = d.token_hash limit 1;
  end if;
  if not found then raise exception 'invalid device token'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_device.id::text, 0));
  select exists (select 1 from public.wallet_observations o where o.device_id = v_device.id and o.event_id = v_event_id)
    into v_existing_event;
  if not v_existing_event and (select count(*) from public.wallet_observations o where o.device_id = v_device.id and o.created_at >= now() - interval '1 minute') >= 120 then
    raise exception 'device observation rate limit exceeded';
  end if;

  insert into public.wallet_observations (
    device_id, restaurant_id, receiver_account_id, event_id, provider, sender_name,
    code_digest, code_fingerprint, code_hmac, code_last4, amount_cents, currency, verification_status, observed_at
  ) values (
    v_device.id, v_device.restaurant_id, v_device.receiver_account_id, v_event_id, v_provider, v_name,
    case when v_code is null then null else extensions.crypt(v_code, extensions.gen_salt('bf')) end,
    case when v_code is null then null else encode(extensions.digest(v_code, 'sha256'), 'hex') end,
    v_code_hmac,
    case when v_code is null then null else right(v_code, 4) end,
    p_amount_cents, v_currency, 'unverified', p_observed_at
  )
  on conflict (device_id, event_id) do update
  set sender_name = coalesce(public.wallet_observations.sender_name, excluded.sender_name),
      code_digest = case when public.wallet_observations.code_fingerprint is null then excluded.code_digest else public.wallet_observations.code_digest end,
      code_fingerprint = coalesce(public.wallet_observations.code_fingerprint, excluded.code_fingerprint),
      code_hmac = coalesce(public.wallet_observations.code_hmac, excluded.code_hmac),
      code_last4 = coalesce(public.wallet_observations.code_last4, excluded.code_last4)
  where public.wallet_observations.verification_status in ('unverified', 'under_review')
  returning id into v_observation_id;

  update public.wallet_observer_devices
  set last_seen_at = greatest(coalesce(last_seen_at, p_observed_at), p_observed_at)
  where id = v_device.id;
  if v_observation_id is null then
    select o.id into v_observation_id from public.wallet_observations o where o.device_id = v_device.id and o.event_id = v_event_id;
    return query select v_observation_id, false;
  end if;
  return query select v_observation_id, true;
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
  if p_observation_id is null or v_code is null or length(v_code) < 3 or length(v_code) > 64 or v_code !~ '^[a-z0-9-]+$' then
    raise exception 'invalid wallet observation code';
  end if;
  select * into v_observation from public.wallet_observations where id = p_observation_id for update;
  if not found then raise exception 'wallet observation not found'; end if;
  if not (private.is_platform_admin() or private.has_restaurant_role(v_observation.restaurant_id, array['owner', 'manager']::public.restaurant_role[])) then raise exception 'not authorized'; end if;
  if v_observation.verification_status not in ('unverified', 'under_review') then raise exception 'wallet observation is already closed'; end if;
  update public.wallet_observations
  set code_digest = extensions.crypt(v_code, extensions.gen_salt('bf')),
      code_fingerprint = encode(extensions.digest(v_code, 'sha256'), 'hex'),
      code_hmac = private.payment_claim_hmac(v_code),
      code_last4 = right(v_code, 4)
  where id = v_observation.id;
  return true;
end;
$$;

drop function if exists public.list_wallet_payment_candidates(uuid);
create function public.list_wallet_payment_candidates(p_observation_id uuid)
returns table (
  payment_attempt_id uuid, order_id uuid, order_code text, customer_name text,
  checkout_reference text, method public.payment_method, amount numeric,
  created_at timestamptz, expires_at timestamptz, sender_name text
)
language plpgsql security definer set search_path = '' as $$
begin
  return query
  select pa.id, o.id, o.code, o.customer_name, pa.checkout_reference, pa.method,
    pa.amount, pa.created_at, pa.expires_at, wo.sender_name
  from public.wallet_observations wo
  join public.orders o on o.restaurant_id = wo.restaurant_id
  join public.payment_attempts pa on pa.order_id = o.id
  where wo.id = p_observation_id
    and (private.is_platform_admin() or private.has_restaurant_role(wo.restaurant_id, array['owner', 'manager']::public.restaurant_role[]))
    and wo.verification_status in ('unverified', 'under_review')
    and wo.provider in ('yape', 'lemon') and wo.currency = 'PEN'
    and o.status not in ('cancelled', 'delivered') and pa.provider = 'wallet_observer' and pa.status = 'pending'
    and ((pa.receiver_account_id is not null and pa.receiver_account_id = wo.receiver_account_id)
      or (pa.receiver_account_id is null and wo.receiver_account_id is null and pa.method::text = wo.provider))
    and round(pa.amount * 100) = wo.amount_cents
    and pa.created_at <= wo.observed_at
    -- Late notifications may be proposed only when the client declared during
    -- the original window. Final verification remains an operator action.
    and (pa.expires_at >= wo.observed_at
      or (pa.payment_declared_at is not null and pa.payment_declared_at <= pa.expires_at
        and wo.observed_at <= pa.expires_at + interval '24 hours'))
    and (
      (pa.payer_code_hmac is not null and wo.code_hmac is not null and pa.payer_code_hmac = wo.code_hmac)
      or (
        (pa.payer_code_hmac is null or wo.code_hmac is null)
        and (((pa.payer_code_digest is not null and wo.code_fingerprint is not null) and pa.payer_code_digest = wo.code_fingerprint)
          or ((pa.payer_code_digest is null or wo.code_fingerprint is null) and pa.payer_code_last4 is not null and wo.code_last4 is not null and pa.payer_code_last4 = wo.code_last4))
      )
    )
  order by abs(extract(epoch from (wo.observed_at - pa.created_at))), pa.created_at desc;
end;
$$;

create or replace function public.verify_wallet_payment(p_observation_id uuid, p_payment_attempt_id uuid)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_observation public.wallet_observations%rowtype;
  v_attempt public.payment_attempts%rowtype;
  v_order_status public.order_status;
  v_matching_attempts bigint := 0;
  v_full_hmac boolean;
begin
  select * into v_observation from public.wallet_observations where id = p_observation_id for update;
  if not found then raise exception 'wallet observation not found'; end if;
  if not (private.is_platform_admin() or private.has_restaurant_role(v_observation.restaurant_id, array['owner', 'manager']::public.restaurant_role[])) then raise exception 'not authorized'; end if;
  select pa.* into v_attempt from public.payment_attempts pa join public.orders o on o.id = pa.order_id
  where pa.id = p_payment_attempt_id and o.restaurant_id = v_observation.restaurant_id for update;
  if not found then raise exception 'payment attempt not found'; end if;
  select o.status into v_order_status from public.orders o where o.id = v_attempt.order_id;
  if v_order_status in ('cancelled', 'delivered') then raise exception 'cancelled order cannot be verified'; end if;

  v_full_hmac := v_attempt.payer_code_hmac is not null and v_observation.code_hmac is not null;
  if v_observation.verification_status not in ('unverified', 'under_review')
    or v_observation.provider not in ('yape', 'lemon') or v_observation.currency <> 'PEN'
    or v_attempt.provider <> 'wallet_observer' or round(v_attempt.amount * 100) <> v_observation.amount_cents
    or (v_attempt.receiver_account_id is not null and v_attempt.receiver_account_id <> v_observation.receiver_account_id)
    or (v_attempt.receiver_account_id is null and v_observation.receiver_account_id is not null)
    or (v_attempt.receiver_account_id is null and v_observation.receiver_account_id is null and v_attempt.method::text <> v_observation.provider)
    or v_attempt.status <> 'pending' or v_attempt.created_at > v_observation.observed_at
    or (v_attempt.expires_at < v_observation.observed_at and not (
      v_attempt.payment_declared_at is not null and v_attempt.payment_declared_at <= v_attempt.expires_at and v_full_hmac
    ))
    or v_observation.code_last4 is null
    or (v_full_hmac and v_attempt.payer_code_hmac <> v_observation.code_hmac)
    or (not v_full_hmac and not (
      (v_attempt.payer_code_digest is not null and v_observation.code_fingerprint is not null and v_attempt.payer_code_digest = v_observation.code_fingerprint)
      or ((v_attempt.payer_code_digest is null or v_observation.code_fingerprint is null) and v_attempt.payer_code_last4 is not null and v_attempt.payer_code_last4 = v_observation.code_last4)
    )) then
    raise exception 'wallet observation does not match payment identity';
  end if;

  select count(*) into v_matching_attempts
  from public.payment_attempts pa join public.orders o on o.id = pa.order_id
  where o.restaurant_id = v_observation.restaurant_id and o.status not in ('cancelled', 'delivered')
    and pa.provider = 'wallet_observer' and pa.status = 'pending'
    and ((pa.receiver_account_id is not null and pa.receiver_account_id = v_observation.receiver_account_id)
      or (pa.receiver_account_id is null and v_observation.receiver_account_id is null and pa.method::text = v_observation.provider))
    and round(pa.amount * 100) = v_observation.amount_cents
    and pa.created_at <= v_observation.observed_at
    and (pa.expires_at >= v_observation.observed_at
      or (pa.payment_declared_at is not null and pa.payment_declared_at <= pa.expires_at and v_observation.observed_at <= pa.expires_at + interval '24 hours'))
    and (((v_full_hmac) and pa.payer_code_hmac = v_observation.code_hmac)
      or ((not v_full_hmac) and ((pa.payer_code_digest is not null and v_observation.code_fingerprint is not null and pa.payer_code_digest = v_observation.code_fingerprint)
        or ((pa.payer_code_digest is null or v_observation.code_fingerprint is null) and pa.payer_code_last4 = v_observation.code_last4))));
  if v_matching_attempts <> 1 then raise exception 'payment identity is ambiguous; full operation code required'; end if;

  update public.wallet_observations set verification_status = 'verified' where id = v_observation.id;
  update public.payment_attempts set status = 'authorized', provider_reference = 'wallet_observation:' || v_observation.id::text,
    observed_wallet_observation_id = v_observation.id, updated_at = now() where id = v_attempt.id;
  return true;
end;
$$;

revoke execute on function public.refresh_payment_intent(uuid, text, text) from public;
grant execute on function public.refresh_payment_intent(uuid, text, text) to anon, authenticated;
revoke execute on function public.ingest_wallet_observation(text, text, text, text, text, bigint, text, timestamptz) from public, anon;
grant execute on function public.ingest_wallet_observation(text, text, text, text, text, bigint, text, timestamptz) to anon, authenticated;
revoke execute on function public.set_wallet_observation_code(uuid, text) from public, anon;
grant execute on function public.set_wallet_observation_code(uuid, text) to authenticated;
revoke execute on function public.list_wallet_payment_candidates(uuid) from public, anon;
grant execute on function public.list_wallet_payment_candidates(uuid) to authenticated;
revoke execute on function public.verify_wallet_payment(uuid, uuid) from public, anon;
grant execute on function public.verify_wallet_payment(uuid, uuid) to authenticated;

comment on table public.payment_claims is
  'Declaración del cliente para revisión manual; no autoriza ni prueba recepción bancaria.';
comment on column public.payment_attempts.payer_code_hmac is
  'HMAC server-side del código declarado; no se expone al cliente y no demuestra recepción.';
comment on function public.refresh_payment_intent(uuid, text, text) is
  'Renueva solo intentos sin declaración; una declaración conserva el intento original para revisión tardía.';
comment on function public.verify_wallet_payment(uuid, uuid) is
  'Verificación manual con receptor, monto, identidad y ventana; una notificación nunca autoriza por sí sola.';

-- La auditoría financiera conserva el cambio de estado, pero nunca debe guardar
-- hashes, HMAC ni el código visible del pagador.
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
    old_value := old_value - 'idempotency_key' - 'provider_reference'
      - 'payer_code_digest' - 'payer_code_hmac' - 'payer_code_last4';
    new_value := new_value - 'idempotency_key' - 'provider_reference'
      - 'payer_code_digest' - 'payer_code_hmac' - 'payer_code_last4';
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

revoke all on function private.write_audit_log() from public, anon, authenticated;
