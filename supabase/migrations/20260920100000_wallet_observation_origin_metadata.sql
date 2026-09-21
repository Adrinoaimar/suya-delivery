-- Conserva trazabilidad técnica de la notificación sin guardar su texto privado.
-- El observador envía solo metadatos estructurados y huella del contenido.

alter table public.wallet_observations
  add column if not exists origin_metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(origin_metadata) = 'object');

comment on column public.wallet_observations.origin_metadata is
  'Metadatos sanitizados de origen: paquete/canal/categoría/evento, tipo de operación y huella; nunca texto completo de notificación.';

create or replace function private.audit_wallet_observation_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.audit_log (actor_id, table_name, row_id, action, old_data, new_data)
  values (
    null,
    'wallet_observations',
    new.id::text,
    'INSERT',
    null,
    jsonb_build_object(
      'restaurant_id', new.restaurant_id,
      'provider', new.provider,
      'amount_cents', new.amount_cents,
      'currency', new.currency,
      'verification_status', new.verification_status,
      'observed_at', new.observed_at,
      'origin_metadata', new.origin_metadata
    )
  );
  return new;
end;
$$;

-- Firma adicional mantiene compatibilidad con observadores antiguos que todavía
-- llaman la RPC de ocho argumentos. Observadores nuevos envían origen.
create or replace function public.ingest_wallet_observation(
  p_device_token text,
  p_event_id text,
  p_provider text,
  p_sender_name text,
  p_code text,
  p_amount_cents bigint,
  p_currency text,
  p_observed_at timestamptz,
  p_origin jsonb
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
  v_origin jsonb := case
    when jsonb_typeof(coalesce(p_origin, '{}'::jsonb)) = 'object' then coalesce(p_origin, '{}'::jsonb)
    else '{}'::jsonb
  end;
  v_origin_metadata jsonb;
  v_package text;
  v_app_label text;
  v_channel text;
  v_category text;
  v_group text;
  v_tag text;
  v_fingerprint text;
  v_operation_kind text;
  v_notification_when timestamptz;
  v_notification_id integer;
  v_flags integer;
begin
  if length(v_token) not between 48 and 128 then raise exception 'invalid device token'; end if;
  if v_event_id is null or v_provider not in ('yape', 'lemon', 'plin', 'mercado_pago', 'generic') then raise exception 'invalid wallet observation'; end if;
  if p_amount_cents is null or p_amount_cents <= 0 or p_amount_cents > 100000000 then raise exception 'invalid amount'; end if;
  if v_currency not in ('PEN', 'ARS', 'USD') then raise exception 'unsupported currency'; end if;
  if p_observed_at is null or p_observed_at < now() - interval '7 days' or p_observed_at > now() + interval '5 minutes' then raise exception 'invalid observed_at'; end if;
  if v_code is not null and (length(v_code) < 3 or length(v_code) > 64 or v_code !~ '^[a-z0-9-]+$') then v_code := null; end if;
  if v_code is not null then v_code_hmac := private.payment_claim_hmac(v_code); end if;

  v_package := nullif(left(regexp_replace(trim(coalesce(v_origin ->> 'packageName', '')), '\s+', ' ', 'g'), 120), '');
  v_app_label := nullif(left(regexp_replace(trim(coalesce(v_origin ->> 'appLabel', '')), '\s+', ' ', 'g'), 120), '');
  v_channel := nullif(left(regexp_replace(trim(coalesce(v_origin ->> 'channelId', '')), '\s+', ' ', 'g'), 120), '');
  v_category := nullif(left(regexp_replace(trim(coalesce(v_origin ->> 'category', '')), '\s+', ' ', 'g'), 64), '');
  v_group := nullif(left(regexp_replace(trim(coalesce(v_origin ->> 'groupKey', '')), '\s+', ' ', 'g'), 200), '');
  v_tag := nullif(left(regexp_replace(trim(coalesce(v_origin ->> 'tag', '')), '\s+', ' ', 'g'), 160), '');
  v_fingerprint := nullif(lower(trim(coalesce(v_origin ->> 'contentFingerprint', ''))), '');
  if v_fingerprint is not null and v_fingerprint !~ '^[a-f0-9]{64}$' then v_fingerprint := null; end if;
  v_operation_kind := lower(trim(coalesce(v_origin ->> 'operationKind', '')));
  if v_operation_kind not in ('deposit', 'transfer_received', 'payment_received', 'incoming_payment') then
    v_operation_kind := null;
  end if;

  begin
    v_notification_id := nullif(trim(coalesce(v_origin ->> 'notificationId', '')), '')::integer;
  exception when invalid_text_representation or numeric_value_out_of_range then
    v_notification_id := null;
  end;
  begin
    v_flags := nullif(trim(coalesce(v_origin ->> 'flags', '')), '')::integer;
  exception when invalid_text_representation or numeric_value_out_of_range then
    v_flags := null;
  end;
  begin
    v_notification_when := nullif(trim(coalesce(v_origin ->> 'notificationWhen', '')), '')::timestamptz;
  exception when invalid_text_representation or datetime_field_overflow then
    v_notification_when := null;
  end;

  v_origin_metadata := jsonb_strip_nulls(jsonb_build_object(
    'packageName', v_package,
    'appLabel', v_app_label,
    'channelId', v_channel,
    'category', v_category,
    'groupKey', v_group,
    'tag', v_tag,
    'notificationId', v_notification_id,
    'flags', v_flags,
    'contentFingerprint', v_fingerprint,
    'operationKind', v_operation_kind,
    'notificationWhen', v_notification_when
  ));

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
  select exists (
    select 1 from public.wallet_observations o
    where o.device_id = v_device.id and o.event_id = v_event_id
  ) into v_existing_event;
  if not v_existing_event and (
    select count(*) from public.wallet_observations o
    where o.device_id = v_device.id and o.created_at >= now() - interval '1 minute'
  ) >= 120 then
    raise exception 'device observation rate limit exceeded';
  end if;

  insert into public.wallet_observations (
    device_id, restaurant_id, receiver_account_id, event_id, provider, sender_name,
    code_digest, code_fingerprint, code_hmac, code_last4, amount_cents, currency,
    verification_status, observed_at, origin_metadata
  ) values (
    v_device.id, v_device.restaurant_id, v_device.receiver_account_id, v_event_id, v_provider, v_name,
    case when v_code is null then null else extensions.crypt(v_code, extensions.gen_salt('bf')) end,
    case when v_code is null then null else encode(extensions.digest(v_code, 'sha256'), 'hex') end,
    v_code_hmac,
    case when v_code is null then null else right(v_code, 4) end,
    p_amount_cents, v_currency, 'unverified', p_observed_at, v_origin_metadata
  )
  on conflict (device_id, event_id) do update
  set sender_name = coalesce(public.wallet_observations.sender_name, excluded.sender_name),
      code_digest = case when public.wallet_observations.code_fingerprint is null then excluded.code_digest else public.wallet_observations.code_digest end,
      code_fingerprint = coalesce(public.wallet_observations.code_fingerprint, excluded.code_fingerprint),
      code_hmac = coalesce(public.wallet_observations.code_hmac, excluded.code_hmac),
      code_last4 = coalesce(public.wallet_observations.code_last4, excluded.code_last4),
      origin_metadata = coalesce(public.wallet_observations.origin_metadata, '{}'::jsonb) || excluded.origin_metadata
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

revoke execute on function public.ingest_wallet_observation(text, text, text, text, text, bigint, text, timestamptz, jsonb)
  from public, anon, authenticated;
grant execute on function public.ingest_wallet_observation(text, text, text, text, text, bigint, text, timestamptz, jsonb)
  to anon, authenticated;

comment on function public.ingest_wallet_observation(text, text, text, text, text, bigint, text, timestamptz, jsonb)
  is 'Ingesta evidencia de billetera y conserva metadatos sanitizados para identificar origen sin guardar contenido completo.';
