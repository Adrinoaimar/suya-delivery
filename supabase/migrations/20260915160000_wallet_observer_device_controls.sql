-- Controles operativos de credenciales del observador.
-- Los tokens nuevos incluyen el UUID público del dispositivo para localizar una
-- sola fila antes de verificar el secreto. Los tokens legacy siguen funcionando
-- mediante el fallback hash-only hasta que el operador los rote.

create index if not exists wallet_observations_device_created_idx
  on public.wallet_observations (device_id, created_at desc);

create or replace function private.audit_wallet_observer_device()
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
  old_value := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) - 'token_hash' end;
  new_value := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) - 'token_hash' end;
  insert into public.audit_log (actor_id, table_name, row_id, action, old_data, new_data)
  values (
    (select auth.uid()),
    'wallet_observer_devices',
    row_value ->> 'id',
    tg_op,
    old_value,
    new_value
  );
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists wallet_observer_devices_audit on public.wallet_observer_devices;
create trigger wallet_observer_devices_audit
  after insert or update or delete on public.wallet_observer_devices
  for each row execute function private.audit_wallet_observer_device();

-- El alta conserva el formato legacy de la firma, pero emite un token con
-- identificador para que la ingesta no tenga que recorrer todos los bcrypt.
create or replace function public.create_wallet_observer_device(
  p_restaurant_id uuid,
  p_label text
)
returns table (
  device_id uuid,
  device_label text,
  device_token text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text;
  v_id uuid := extensions.gen_random_uuid();
  v_label text;
begin
  if not (
    private.is_platform_admin()
    or private.has_restaurant_role(
      p_restaurant_id,
      array['owner', 'manager']::public.restaurant_role[]
    )
  ) then
    raise exception 'not authorized';
  end if;

  v_label := nullif(left(regexp_replace(trim(coalesce(p_label, '')), '\s+', ' ', 'g'), 80), '');
  if v_label is null then raise exception 'device label is required'; end if;

  v_token := v_id::text || '.' || encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.wallet_observer_devices (
    id, restaurant_id, label, token_hash, token_last4, created_by
  ) values (
    v_id, p_restaurant_id, v_label,
    extensions.crypt(v_token, extensions.gen_salt('bf')), right(v_token, 4), auth.uid()
  );
  return query select v_id, v_label, v_token;
end;
$$;

create or replace function public.create_wallet_observer_device_for_account(
  p_restaurant_id uuid,
  p_receiver_account_id uuid,
  p_label text
)
returns table (
  device_id uuid,
  device_label text,
  device_token text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text;
  v_id uuid := extensions.gen_random_uuid();
  v_label text;
begin
  if not (
    private.is_platform_admin()
    or private.has_restaurant_role(
      p_restaurant_id,
      array['owner', 'manager']::public.restaurant_role[]
    )
  ) then
    raise exception 'not authorized';
  end if;
  if not exists (
    select 1
    from public.restaurant_payment_accounts account
    where account.id = p_receiver_account_id
      and account.restaurant_id = p_restaurant_id
      and account.active
  ) then
    raise exception 'receiver payment account is invalid';
  end if;

  v_label := nullif(left(regexp_replace(trim(coalesce(p_label, '')), '\s+', ' ', 'g'), 80), '');
  if v_label is null then raise exception 'device label is required'; end if;

  v_token := v_id::text || '.' || encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.wallet_observer_devices (
    id, restaurant_id, receiver_account_id, label, token_hash, token_last4, created_by
  ) values (
    v_id, p_restaurant_id, p_receiver_account_id, v_label,
    extensions.crypt(v_token, extensions.gen_salt('bf')), right(v_token, 4), auth.uid()
  );
  return query select v_id, v_label, v_token;
end;
$$;

create or replace function public.set_wallet_observer_device_active(
  p_device_id uuid,
  p_active boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_restaurant_id uuid;
begin
  if (select auth.uid()) is null then raise exception 'authentication required'; end if;
  if p_active is null then raise exception 'device status is required'; end if;
  select d.restaurant_id into v_restaurant_id
  from public.wallet_observer_devices d
  where d.id = p_device_id
  for update;
  if not found then return false; end if;
  if not (
    private.is_platform_admin()
    or private.has_restaurant_role(
      v_restaurant_id,
      array['owner', 'manager']::public.restaurant_role[]
    )
  ) then
    raise exception 'not authorized';
  end if;
  update public.wallet_observer_devices
  set active = p_active
  where id = p_device_id;
  return true;
end;
$$;

create or replace function public.rotate_wallet_observer_device(p_device_id uuid)
returns table (
  device_id uuid,
  device_label text,
  device_token text,
  restaurant_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_device public.wallet_observer_devices%rowtype;
  v_token text;
begin
  if (select auth.uid()) is null then raise exception 'authentication required'; end if;
  select d.* into v_device
  from public.wallet_observer_devices d
  where d.id = p_device_id
  for update;
  if not found then raise exception 'device not found'; end if;
  if not (
    private.is_platform_admin()
    or private.has_restaurant_role(
      v_device.restaurant_id,
      array['owner', 'manager']::public.restaurant_role[]
    )
  ) then
    raise exception 'not authorized';
  end if;

  v_token := v_device.id::text || '.' || encode(extensions.gen_random_bytes(32), 'hex');
  update public.wallet_observer_devices
  set token_hash = extensions.crypt(v_token, extensions.gen_salt('bf')),
      token_last4 = right(v_token, 4)
  where id = v_device.id;
  return query select v_device.id, v_device.label, v_token, v_device.restaurant_id;
end;
$$;

-- La ingesta localiza por UUID en tokens nuevos, limita ráfagas y conserva el
-- fallback para dispositivos creados antes de esta migración.
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
  v_code text := nullif(left(lower(regexp_replace(trim(coalesce(p_code, '')), '\s+', '', 'g')), 160), '');
  v_device_id uuid;
  v_token text := trim(coalesce(p_device_token, ''));
  v_observation_id uuid;
  v_existing_event boolean := false;
begin
  if length(v_token) not between 48 and 128 then raise exception 'invalid device token'; end if;
  if v_event_id is null or v_provider not in ('yape', 'lemon', 'plin', 'mercado_pago', 'generic') then raise exception 'invalid wallet observation'; end if;
  if p_amount_cents is null or p_amount_cents <= 0 or p_amount_cents > 100000000 then raise exception 'invalid amount'; end if;
  if v_currency not in ('PEN', 'ARS', 'USD') then raise exception 'unsupported currency'; end if;
  if p_observed_at is null or p_observed_at < now() - interval '7 days' or p_observed_at > now() + interval '5 minutes' then raise exception 'invalid observed_at'; end if;
  if v_code is not null and v_code !~ '^[a-z0-9-]+$' then v_code := null; end if;

  begin
    v_device_id := split_part(v_token, '.', 1)::uuid;
  exception when invalid_text_representation then
    v_device_id := null;
  end;

  if v_device_id is not null then
    select d.* into v_device
    from public.wallet_observer_devices d
    where d.id = v_device_id
      and d.active
      and extensions.crypt(v_token, d.token_hash) = d.token_hash;
  else
    select d.* into v_device
    from public.wallet_observer_devices d
    where d.active
      and extensions.crypt(v_token, d.token_hash) = d.token_hash
    limit 1;
  end if;
  if not found then raise exception 'invalid device token'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_device.id::text, 0));
  select exists (
    select 1
    from public.wallet_observations o
    where o.device_id = v_device.id and o.event_id = v_event_id
  ) into v_existing_event;
  if not v_existing_event and (
    select count(*)
    from public.wallet_observations o
    where o.device_id = v_device.id
      and o.created_at >= now() - interval '1 minute'
  ) >= 120 then
    raise exception 'device observation rate limit exceeded';
  end if;

  insert into public.wallet_observations (
    device_id, restaurant_id, receiver_account_id, event_id, provider, sender_name,
    code_digest, code_fingerprint, code_last4, amount_cents, currency, verification_status, observed_at
  ) values (
    v_device.id, v_device.restaurant_id, v_device.receiver_account_id, v_event_id, v_provider, v_name,
    case when v_code is null then null else extensions.crypt(v_code, extensions.gen_salt('bf')) end,
    case when v_code is null then null else encode(extensions.digest(v_code, 'sha256'), 'hex') end,
    case when v_code is null then null else right(v_code, 4) end,
    p_amount_cents, v_currency, 'unverified', p_observed_at
  )
  on conflict (device_id, event_id) do update
  set sender_name = coalesce(public.wallet_observations.sender_name, excluded.sender_name),
      code_digest = case when public.wallet_observations.code_fingerprint is null then excluded.code_digest else public.wallet_observations.code_digest end,
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

revoke all on function private.audit_wallet_observer_device() from public, anon, authenticated;
revoke all on function public.set_wallet_observer_device_active(uuid, boolean) from public, anon;
revoke all on function public.rotate_wallet_observer_device(uuid) from public, anon;
grant execute on function public.set_wallet_observer_device_active(uuid, boolean) to authenticated;
grant execute on function public.rotate_wallet_observer_device(uuid) to authenticated;

comment on function public.set_wallet_observer_device_active(uuid, boolean) is
  'Revoca o reactiva un observador sin exponer su secreto; cada cambio queda auditado.';
comment on function public.rotate_wallet_observer_device(uuid) is
  'Invalida el token anterior y devuelve el nuevo secreto una sola vez al operador autorizado.';
