-- A wallet may post one notification in stages: first a compact preview,
-- then an expanded version containing the operation code. Keep the event
-- identity stable and enrich only open observations. Never alter amount,
-- provider, timing, or an observation that has already been closed.

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
  on conflict (device_id, event_id) do update
  set sender_name = coalesce(public.wallet_observations.sender_name, excluded.sender_name),
      code_digest = case
        when public.wallet_observations.code_fingerprint is null then excluded.code_digest
        else public.wallet_observations.code_digest
      end,
      code_fingerprint = coalesce(public.wallet_observations.code_fingerprint, excluded.code_fingerprint),
      code_last4 = coalesce(public.wallet_observations.code_last4, excluded.code_last4)
  where public.wallet_observations.verification_status in ('unverified', 'under_review')
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

comment on function public.ingest_wallet_observation(text, text, text, text, text, bigint, text, timestamptz)
  is 'Stores one stable wallet notification event and enriches open observations with later sender/code fields.';
