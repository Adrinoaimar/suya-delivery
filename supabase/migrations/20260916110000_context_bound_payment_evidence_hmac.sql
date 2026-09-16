-- P-09: bind new evidence HMACs to the receiver account and evidence type.
-- Legacy code-only HMACs remain readable only when a contextual HMAC is absent
-- on one side; two contextual values must agree exactly.

alter table public.payment_attempts
  add column if not exists payer_code_hmac_context text
    check (payer_code_hmac_context is null or length(payer_code_hmac_context) = 64);

alter table public.wallet_observations
  add column if not exists code_hmac_context text
    check (code_hmac_context is null or length(code_hmac_context) = 64);

alter table public.payment_claims
  add column if not exists code_hmac_context text
    check (code_hmac_context is null or length(code_hmac_context) = 64);

create or replace function private.payment_claim_hmac(p_code text, p_context text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text;
  v_code text := lower(regexp_replace(trim(coalesce(p_code, '')), '\s+', '', 'g'));
  v_context text := lower(regexp_replace(trim(coalesce(p_context, '')), '\s+', '', 'g'));
begin
  if v_code is null or length(v_code) < 3 or length(v_code) > 64
    or v_code !~ '^[a-z0-9-]+$' then
    raise exception 'invalid payment evidence code';
  end if;
  if v_context is null or length(v_context) < 3 or length(v_context) > 240
    or v_context !~ '^[a-z0-9|:_-]+$' then
    raise exception 'invalid payment evidence context';
  end if;
  select s.hmac_key into v_key
  from private.payment_claim_secrets s
  where s.id;
  if v_key is null then raise exception 'payment evidence key is unavailable'; end if;
  return encode(
    extensions.hmac('suya-payment-evidence:v2|' || v_context || '|' || v_code, v_key, 'sha256'),
    'hex'
  );
end;
$$;

revoke all on function private.payment_claim_hmac(text, text) from public, anon, authenticated;

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
  v_context text;
  v_hmac text;
  v_context_hmac text;
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
  elsif (select auth.uid()) is null or v_order.customer_id <> (select auth.uid()) then
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
  v_context := concat_ws('|', 'payment-claim', coalesce(v_attempt.receiver_account_id::text, 'unbound'), v_attempt.method::text);
  if v_code is not null then
    v_hmac := private.payment_claim_hmac(v_code);
    v_context_hmac := private.payment_claim_hmac(v_code, v_context);
  end if;

  insert into public.payment_claims (
    payment_attempt_id, order_id, payer_display_name, code_hmac, code_hmac_context, code_last4, declared_by
  ) values (
    v_attempt.id, v_order.id, v_payer, v_hmac, v_context_hmac,
    case when v_code is null then null else right(v_code, 4) end,
    (select auth.uid())
  )
  on conflict (payment_attempt_id) do update set
    payer_display_name = coalesce(excluded.payer_display_name, public.payment_claims.payer_display_name),
    code_hmac = coalesce(excluded.code_hmac, public.payment_claims.code_hmac),
    code_hmac_context = coalesce(excluded.code_hmac_context, public.payment_claims.code_hmac_context),
    code_last4 = coalesce(excluded.code_last4, public.payment_claims.code_last4),
    updated_at = now();

  update public.payment_attempts
  set payment_declared_at = coalesce(payment_declared_at, now()),
      payer_display_name = coalesce(v_payer, payer_display_name),
      payer_code_hmac = coalesce(v_hmac, payer_code_hmac),
      payer_code_hmac_context = coalesce(v_context_hmac, payer_code_hmac_context),
      payer_code_last4 = coalesce(case when v_code is null then null else right(v_code, 4) end, payer_code_last4),
      payer_code_digest = coalesce(
        case when v_code is null then null else encode(extensions.digest(v_code, 'sha256'), 'hex') end,
        payer_code_digest
      ),
      updated_at = now()
  where id = v_attempt.id;
  return true;
end;
$$;

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
  v_context_hmac text;
  v_context text;
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

  if v_code is not null then
    v_context := concat_ws('|', 'wallet-observation', coalesce(v_device.receiver_account_id::text, 'unbound'), v_provider);
    v_context_hmac := private.payment_claim_hmac(v_code, v_context);
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_device.id::text, 0));
  select exists (select 1 from public.wallet_observations o where o.device_id = v_device.id and o.event_id = v_event_id)
    into v_existing_event;
  if not v_existing_event and (select count(*) from public.wallet_observations o where o.device_id = v_device.id and o.created_at >= now() - interval '1 minute') >= 120 then
    raise exception 'device observation rate limit exceeded';
  end if;

  insert into public.wallet_observations (
    device_id, restaurant_id, receiver_account_id, event_id, provider, sender_name,
    code_digest, code_fingerprint, code_hmac, code_hmac_context, code_last4, amount_cents, currency, verification_status, observed_at
  ) values (
    v_device.id, v_device.restaurant_id, v_device.receiver_account_id, v_event_id, v_provider, v_name,
    case when v_code is null then null else extensions.crypt(v_code, extensions.gen_salt('bf')) end,
    case when v_code is null then null else encode(extensions.digest(v_code, 'sha256'), 'hex') end,
    v_code_hmac, v_context_hmac,
    case when v_code is null then null else right(v_code, 4) end,
    p_amount_cents, v_currency, 'unverified', p_observed_at
  )
  on conflict (device_id, event_id) do update
  set sender_name = coalesce(public.wallet_observations.sender_name, excluded.sender_name),
      code_digest = case when public.wallet_observations.code_fingerprint is null then excluded.code_digest else public.wallet_observations.code_digest end,
      code_fingerprint = coalesce(public.wallet_observations.code_fingerprint, excluded.code_fingerprint),
      code_hmac = coalesce(public.wallet_observations.code_hmac, excluded.code_hmac),
      code_hmac_context = coalesce(public.wallet_observations.code_hmac_context, excluded.code_hmac_context),
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
  v_context text;
  v_hmac text;
  v_context_hmac text;
begin
  if p_observation_id is null or v_code is null or length(v_code) < 3 or length(v_code) > 64 or v_code !~ '^[a-z0-9-]+$' then
    raise exception 'invalid wallet observation code';
  end if;
  select * into v_observation from public.wallet_observations where id = p_observation_id for update;
  if not found then raise exception 'wallet observation not found'; end if;
  if not (private.is_platform_admin() or private.has_restaurant_role(v_observation.restaurant_id, array['owner', 'manager']::public.restaurant_role[])) then raise exception 'not authorized'; end if;
  if v_observation.verification_status not in ('unverified', 'under_review') then raise exception 'wallet observation is already closed'; end if;
  v_context := concat_ws('|', 'wallet-observation', coalesce(v_observation.receiver_account_id::text, 'unbound'), v_observation.provider);
  v_hmac := private.payment_claim_hmac(v_code);
  v_context_hmac := private.payment_claim_hmac(v_code, v_context);
  update public.wallet_observations
  set code_digest = extensions.crypt(v_code, extensions.gen_salt('bf')),
      code_fingerprint = encode(extensions.digest(v_code, 'sha256'), 'hex'),
      code_hmac = v_hmac,
      code_hmac_context = v_context_hmac,
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
    and (pa.expires_at >= wo.observed_at
      or (pa.payment_declared_at is not null and pa.payment_declared_at <= pa.expires_at
        and wo.observed_at <= pa.expires_at + interval '24 hours'))
    and (
      (pa.payer_code_hmac_context is not null and wo.code_hmac_context is not null
        and pa.payer_code_hmac_context = wo.code_hmac_context)
      or (
        (pa.payer_code_hmac_context is null or wo.code_hmac_context is null)
        and pa.payer_code_hmac is not null and wo.code_hmac is not null
        and pa.payer_code_hmac = wo.code_hmac
      )
      or (
        (pa.payer_code_hmac_context is null or wo.code_hmac_context is null)
        and (pa.payer_code_hmac is null or wo.code_hmac is null)
        and (
          (pa.payer_code_digest is not null and wo.code_fingerprint is not null and pa.payer_code_digest = wo.code_fingerprint)
          or ((pa.payer_code_digest is null or wo.code_fingerprint is null) and pa.payer_code_last4 is not null and wo.code_last4 is not null and pa.payer_code_last4 = wo.code_last4)
        )
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
  v_context_hmac boolean;
  v_full_hmac boolean;
  v_identity_matches boolean;
begin
  select * into v_observation from public.wallet_observations where id = p_observation_id for update;
  if not found then raise exception 'wallet observation not found'; end if;
  if not (private.is_platform_admin() or private.has_restaurant_role(v_observation.restaurant_id, array['owner', 'manager']::public.restaurant_role[])) then raise exception 'not authorized'; end if;
  select pa.* into v_attempt from public.payment_attempts pa join public.orders o on o.id = pa.order_id
  where pa.id = p_payment_attempt_id and o.restaurant_id = v_observation.restaurant_id for update;
  if not found then raise exception 'payment attempt not found'; end if;
  select o.status into v_order_status from public.orders o where o.id = v_attempt.order_id;
  if v_order_status in ('cancelled', 'delivered') then raise exception 'cancelled order cannot be verified'; end if;

  v_context_hmac := v_attempt.payer_code_hmac_context is not null and v_observation.code_hmac_context is not null;
  v_full_hmac := v_context_hmac or (v_attempt.payer_code_hmac is not null and v_observation.code_hmac is not null);
  v_identity_matches :=
    (v_context_hmac and v_attempt.payer_code_hmac_context = v_observation.code_hmac_context)
    or (
      not v_context_hmac
      and v_attempt.payer_code_hmac is not null and v_observation.code_hmac is not null
      and v_attempt.payer_code_hmac = v_observation.code_hmac
    )
    or (
      not v_context_hmac
      and (v_attempt.payer_code_hmac is null or v_observation.code_hmac is null)
      and (
        (v_attempt.payer_code_digest is not null and v_observation.code_fingerprint is not null and v_attempt.payer_code_digest = v_observation.code_fingerprint)
        or ((v_attempt.payer_code_digest is null or v_observation.code_fingerprint is null) and v_attempt.payer_code_last4 is not null and v_attempt.payer_code_last4 = v_observation.code_last4)
      )
    );
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
    or not v_identity_matches then
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
    and (
      (pa.payer_code_hmac_context is not null and v_observation.code_hmac_context is not null
        and pa.payer_code_hmac_context = v_observation.code_hmac_context)
      or (
        (pa.payer_code_hmac_context is null or v_observation.code_hmac_context is null)
        and pa.payer_code_hmac is not null and v_observation.code_hmac is not null
        and pa.payer_code_hmac = v_observation.code_hmac
      )
      or (
        (pa.payer_code_hmac_context is null or v_observation.code_hmac_context is null)
        and (pa.payer_code_hmac is null or v_observation.code_hmac is null)
        and (
          (pa.payer_code_digest is not null and v_observation.code_fingerprint is not null and pa.payer_code_digest = v_observation.code_fingerprint)
          or ((pa.payer_code_digest is null or v_observation.code_fingerprint is null) and pa.payer_code_last4 is not null and pa.payer_code_last4 = v_observation.code_last4)
        )
      )
    );
  if v_matching_attempts <> 1 then raise exception 'payment identity is ambiguous; full operation code required'; end if;

  update public.wallet_observations set verification_status = 'verified' where id = v_observation.id;
  update public.payment_attempts set status = 'authorized', provider_reference = 'wallet_observation:' || v_observation.id::text,
    observed_wallet_observation_id = v_observation.id, updated_at = now() where id = v_attempt.id;
  return true;
end;
$$;

-- The contextual HMAC is still sensitive evidence and must not enter audit JSON.
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
      - 'payer_code_digest' - 'payer_code_hmac' - 'payer_code_hmac_context' - 'payer_code_last4';
    new_value := new_value - 'idempotency_key' - 'provider_reference'
      - 'payer_code_digest' - 'payer_code_hmac' - 'payer_code_hmac_context' - 'payer_code_last4';
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

revoke execute on function public.ingest_wallet_observation(text, text, text, text, text, bigint, text, timestamptz) from public, anon;
grant execute on function public.ingest_wallet_observation(text, text, text, text, text, bigint, text, timestamptz) to anon, authenticated;
revoke execute on function public.set_wallet_observation_code(uuid, text) from public, anon;
grant execute on function public.set_wallet_observation_code(uuid, text) to authenticated;
revoke execute on function public.list_wallet_payment_candidates(uuid) from public, anon;
grant execute on function public.list_wallet_payment_candidates(uuid) to authenticated;
revoke execute on function public.verify_wallet_payment(uuid, uuid) from public, anon;
grant execute on function public.verify_wallet_payment(uuid, uuid) to authenticated;

comment on column public.payment_attempts.payer_code_hmac_context is
  'HMAC contextual server-side del código declarado; incluye cuenta receptora y tipo de evidencia.';
comment on column public.wallet_observations.code_hmac_context is
  'HMAC contextual server-side; incluye cuenta receptora y proveedor de evidencia.';
comment on function private.payment_claim_hmac(text, text) is
  'HMAC privado v2 del código con contexto de cuenta receptora y tipo de evidencia.';
