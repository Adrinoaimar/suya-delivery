-- Conciliación automática opt-in por notificación Android de dispositivo `Suya Caja` emparejado.
-- Mantiene intacto el bloqueo por defecto: solo opera cuando un dueño/administrador activa
-- explícitamente `auto_settle_orders = true` en un dispositivo `wallet_observer_devices` activo.

alter table public.wallet_observer_devices
  add column if not exists auto_settle_orders boolean not null default false;

drop function if exists public.list_wallet_observer_devices(uuid);

create or replace function public.list_wallet_observer_devices(p_restaurant_id uuid)
returns table (
  device_id uuid,
  device_label text,
  device_active boolean,
  token_last4 text,
  last_seen_at timestamptz,
  created_at timestamptz,
  auto_settle_orders boolean
)
language plpgsql
security definer
set search_path = ''
as $$
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

  return query
  select d.id, d.label, d.active, d.token_last4, d.last_seen_at, d.created_at, d.auto_settle_orders
  from public.wallet_observer_devices d
  where d.restaurant_id = p_restaurant_id
  order by d.created_at desc;
end;
$$;

revoke execute on function public.list_wallet_observer_devices(uuid)
  from public, anon;
grant execute on function public.list_wallet_observer_devices(uuid)
  to authenticated;

create or replace function public.set_wallet_observer_device_auto_settle(
  p_device_id uuid,
  p_enabled boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_restaurant_id uuid;
begin
  select restaurant_id into v_restaurant_id
  from public.wallet_observer_devices
  where id = p_device_id;
  if not found then
    raise exception 'wallet observer device not found';
  end if;

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
  set auto_settle_orders = coalesce(p_enabled, false)
  where id = p_device_id;
  return found;
end;
$$;

revoke all on function public.set_wallet_observer_device_auto_settle(uuid, boolean)
  from public, anon;
grant execute on function public.set_wallet_observer_device_auto_settle(uuid, boolean)
  to authenticated;

create or replace function private.try_auto_settle_wallet_observation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_device public.wallet_observer_devices%rowtype;
  v_ids uuid[];
  v_attempt_id uuid;
  v_order_id uuid;
  v_payer text := nullif(private.normalize_person_name(new.sender_name), '');
  v_event_id text;
  v_ext_tx text;
begin
  if new.verification_status <> 'unverified'
    or new.currency <> 'PEN'
    or new.provider not in ('yape', 'lemon', 'plin')
    or new.observed_at < now() - interval '15 minutes' then
    return new;
  end if;

  select d.* into v_device
  from public.wallet_observer_devices d
  where d.id = new.device_id;

  if not found or not v_device.active or not v_device.auto_settle_orders then
    return new;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('suya_obs_autosettle_' || new.restaurant_id::text, 0)
  );

  select array_agg(pa.id) into v_ids
  from public.payment_attempts pa
  join public.orders o on o.id = pa.order_id
  where o.restaurant_id = new.restaurant_id
    and o.status = 'pending_payment'
    and pa.provider = 'static_qr'
    and pa.status = 'pending'
    and pa.expires_at > now()
    and pa.amount_cents = new.amount_cents;

  if coalesce(array_length(v_ids, 1), 0) = 1 then
    v_attempt_id := v_ids[1];
  elsif coalesce(array_length(v_ids, 1), 0) > 1 and v_payer is not null then
    select array_agg(pa.id) into v_ids
    from public.payment_attempts pa
    join public.orders o on o.id = pa.order_id
    where pa.id = any(v_ids)
      and private.normalize_person_name(o.customer_name) <> ''
      and (
        private.normalize_person_name(o.customer_name) = v_payer
        or v_payer like private.normalize_person_name(o.customer_name) || ' %'
        or private.normalize_person_name(o.customer_name) like v_payer || ' %'
      );

    if coalesce(array_length(v_ids, 1), 0) = 1 then
      v_attempt_id := v_ids[1];
    end if;
  end if;

  if v_attempt_id is null then
    return new;
  end if;

  v_event_id := 'android_obs_' || new.device_id::text || '_' || new.event_id;
  v_ext_tx := 'android_' || new.provider || '_' || coalesce(nullif(new.code_fingerprint, ''), new.id::text);

  if exists (
    select 1 from public.payment_attempts pa
    where pa.provider = 'static_qr'
      and pa.external_transaction_id = v_ext_tx
      and pa.id <> v_attempt_id
  ) then
    return new;
  end if;

  if exists (
    select 1 from public.payment_webhook_events w
    where w.provider = 'static_qr'
      and w.event_id = v_event_id
      and w.processing_status = 'processed'
  ) then
    return new;
  end if;

  select pa.order_id into v_order_id
  from public.payment_attempts pa
  where pa.id = v_attempt_id
  for update;

  update public.wallet_observations
  set verification_status = 'verified'
  where id = new.id and verification_status = 'unverified';

  update public.payment_attempts
  set
    status = 'authorized',
    provider_reference = 'android_push:' || new.provider || ':' || new.id::text,
    external_transaction_id = v_ext_tx,
    observed_wallet_observation_id = new.id,
    webhook_verified_at = now(),
    failure_code = null,
    updated_at = now()
  where id = v_attempt_id and status = 'pending';

  insert into public.payment_webhook_events (
    provider, event_id, event_type, external_transaction_id, payment_attempt_id,
    order_id, restaurant_id, signature_verified, api_verified, amount_cents,
    currency, processing_status, raw_payload, processed_at
  ) values (
    'static_qr', v_event_id, 'payment.approved', v_ext_tx, v_attempt_id,
    v_order_id, new.restaurant_id, true, false, new.amount_cents,
    new.currency, 'processed',
    jsonb_build_object(
      'source', 'android_wallet_observer_opt_in',
      'deviceId', new.device_id,
      'walletProvider', new.provider,
      'senderName', new.sender_name
    ),
    now()
  ) on conflict (provider, event_id) do nothing;

  return new;
end;
$$;

revoke all on function private.try_auto_settle_wallet_observation()
  from public, anon, authenticated;

drop trigger if exists wallet_observations_auto_settle_opt_in on public.wallet_observations;
create trigger wallet_observations_auto_settle_opt_in
after insert or update of sender_name, code_fingerprint on public.wallet_observations
for each row
execute function private.try_auto_settle_wallet_observation();
