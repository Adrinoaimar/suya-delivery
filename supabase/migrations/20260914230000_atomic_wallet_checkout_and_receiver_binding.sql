-- Integridad de checkout sin pasarela comercial.
-- El pedido, descuento, intento wallet y coordenadas nacen en una sola transacción.
-- La notificación del teléfono sigue siendo evidencia: nunca autoriza por sí sola.

alter table public.payment_attempts
  add column if not exists receiver_account_id uuid
    references public.restaurant_payment_accounts(id) on delete set null;

alter table public.wallet_observer_devices
  add column if not exists receiver_account_id uuid
    references public.restaurant_payment_accounts(id) on delete set null;

alter table public.wallet_observations
  add column if not exists receiver_account_id uuid
    references public.restaurant_payment_accounts(id) on delete set null;

create index if not exists payment_attempts_receiver_pending_idx
  on public.payment_attempts (receiver_account_id, status, created_at desc)
  where status = 'pending';

create index if not exists wallet_observations_receiver_observed_idx
  on public.wallet_observations (receiver_account_id, observed_at desc);

create unique index if not exists payment_attempts_observed_wallet_uidx
  on public.payment_attempts (observed_wallet_observation_id)
  where observed_wallet_observation_id is not null;

-- Conserva la compatibilidad de intentos antiguos sin cuenta receptora. Los nuevos
-- intentos almacenan el ID de la cuenta concreta, no solo el proveedor elegido.
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
  v_receiver_account_id uuid;
  v_guest_ok boolean := false;
  v_idempotency text;
begin
  if p_order_id is null then raise exception 'order is required'; end if;
  if lower(trim(coalesce(p_method, ''))) not in ('yape', 'lemon') then
    raise exception 'digital wallet is not configured for this method';
  end if;
  v_method := lower(trim(p_method))::public.payment_method;

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

  if v_order.payment_method <> 'cash' and v_order.payment_method <> v_method then
    raise exception 'order already uses another payment method';
  end if;

  select pa.* into v_attempt
  from public.payment_attempts pa
  where pa.order_id = v_order.id and pa.status in ('pending', 'authorized')
  order by pa.created_at desc
  limit 1 for update;
  if found then
    if v_attempt.method <> v_method then raise exception 'order already has another payment attempt'; end if;
    if v_attempt.receiver_account_id is not null then
      select rpa.id, rpa.qr_payload into v_receiver_account_id, v_qr_payload
      from public.restaurant_payment_accounts rpa
      where rpa.id = v_attempt.receiver_account_id and rpa.active;
      if not found then raise exception 'receiver payment account is no longer active'; end if;
    else
      select rpa.id, rpa.qr_payload into v_receiver_account_id, v_qr_payload
      from public.restaurant_payment_accounts rpa
      where rpa.restaurant_id = v_order.restaurant_id
        and rpa.provider = v_method::text and rpa.active;
    end if;
    return query select v_attempt.id, v_attempt.order_id, v_attempt.method, v_attempt.status,
      v_attempt.amount, 'PEN'::text, v_attempt.checkout_reference, v_attempt.expires_at,
      v_attempt.provider, v_qr_payload;
    return;
  end if;

  if v_order.total <= 0 then raise exception 'order total must be positive'; end if;
  v_idempotency := 'order:' || v_order.id::text || ':' || v_method::text;
  select rpa.id, rpa.qr_payload into v_receiver_account_id, v_qr_payload
  from public.restaurant_payment_accounts rpa
  where rpa.restaurant_id = v_order.restaurant_id
    and rpa.provider = v_method::text and rpa.active;
  if v_receiver_account_id is null then
    raise exception 'restaurant payment account is not configured';
  end if;

  perform set_config('suya.payment_method_mutation', '1', true);
  update public.orders set payment_method = v_method where id = v_order.id;

  insert into public.payment_attempts (
    order_id, receiver_account_id, provider, method, status, amount, idempotency_key, expires_at
  ) values (
    v_order.id, v_receiver_account_id, 'wallet_observer', v_method, 'pending', v_order.total,
    v_idempotency, now() + interval '30 minutes'
  ) returning * into v_attempt;

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
  provider_reference text,
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
        and s.guest_access_token_hash is not null
        and extensions.crypt(p_guest_access_token, s.guest_access_token_hash) = s.guest_access_token_hash
    ) into v_guest_ok;
    if not v_guest_ok then return; end if;
  elsif v_order.customer_id <> (select auth.uid()) then
    return;
  end if;
  select pa.* into v_attempt from public.payment_attempts pa
  where pa.order_id = p_order_id order by pa.created_at desc limit 1;
  if not found then return; end if;
  if v_attempt.receiver_account_id is not null then
    select rpa.qr_payload into v_qr_payload
    from public.restaurant_payment_accounts rpa
    where rpa.id = v_attempt.receiver_account_id;
  else
    select rpa.qr_payload into v_qr_payload
    from public.restaurant_payment_accounts rpa
    where rpa.restaurant_id = v_order.restaurant_id
      and rpa.provider = v_attempt.method::text and rpa.active;
  end if;
  return query select v_attempt.id, v_attempt.order_id, v_attempt.method, v_attempt.status,
    v_attempt.amount, 'PEN'::text, v_attempt.checkout_reference, v_attempt.expires_at,
    v_attempt.provider, v_attempt.provider_reference, v_qr_payload;
end;
$$;

-- Las renovaciones deben conservar la cuenta receptora y no dejar un intento
-- nuevo sin destino después de que el anterior expire.
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
begin
  select * into v_intent from public.create_payment_intent(p_order_id, p_method, p_guest_access_token);
  if not found then return; end if;
  if v_intent.status = 'pending' and v_intent.expires_at <= now() then
    update public.payment_attempts
    set status = 'failed', failure_code = 'expired', updated_at = now()
    where id = v_intent.attempt_id and status = 'pending' and expires_at <= now();

    select pa.receiver_account_id into v_receiver_account_id
    from public.payment_attempts pa
    where pa.id = v_intent.attempt_id;
    if v_receiver_account_id is not null then
      select rpa.qr_payload into v_qr_payload
      from public.restaurant_payment_accounts rpa
      where rpa.id = v_receiver_account_id and rpa.active;
      if not found then
        raise exception 'receiver payment account is no longer active';
      end if;
    else
      select rpa.id, rpa.qr_payload into v_receiver_account_id, v_qr_payload
      from public.restaurant_payment_accounts rpa
      join public.orders o on o.id = p_order_id and o.restaurant_id = rpa.restaurant_id
      where rpa.provider = v_intent.method::text and rpa.active;
      if v_receiver_account_id is null then
        raise exception 'restaurant payment account is not configured';
      end if;
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

-- Helpers de checkout. La cuenta wallet activa se exige antes de crear el pedido:
-- si falta configuración, no queda una orden huérfana esperando un QR inexistente.
create or replace function private.require_wallet_account(p_restaurant_id uuid, p_method text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  select id into v_id from public.restaurant_payment_accounts
  where restaurant_id = p_restaurant_id and provider = lower(trim(p_method)) and active
  for share;
  if v_id is null then raise exception 'restaurant payment account is not configured'; end if;
  return v_id;
end;
$$;

create or replace function private.set_checkout_coordinates(
  p_order_id uuid, p_latitude double precision, p_longitude double precision
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (p_latitude is null) is distinct from (p_longitude is null) then
    raise exception 'delivery coordinates must be provided together';
  end if;
  if p_latitude is null then return; end if;
  if p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then
    raise exception 'invalid delivery coordinates';
  end if;
  update public.orders
  set delivery_latitude = p_latitude, delivery_longitude = p_longitude
  where id = p_order_id;
end;
$$;

create or replace function public.create_delivery_order_with_payment(
  p_restaurant_id uuid, p_items jsonb, p_customer_phone text, p_delivery_address text,
  p_delivery_reference text, p_request_id uuid, p_method text, p_offer_code text default null,
  p_delivery_latitude double precision default null, p_delivery_longitude double precision default null
)
returns table (order_id uuid, delivery_code text, cancel_code text)
language plpgsql security definer set search_path = '' as $$
declare result record; intent record;
begin
  perform private.require_wallet_account(p_restaurant_id, p_method);
  select * into result from private.create_order_internal(
    p_restaurant_id, p_items, null, p_customer_phone, p_delivery_address,
    p_delivery_reference, p_request_id, false, 'delivery', null, null
  );
  perform private.apply_app_offer(result.order_id, p_offer_code);
  perform private.set_checkout_coordinates(result.order_id, p_delivery_latitude, p_delivery_longitude);
  select * into intent from public.create_payment_intent(result.order_id, p_method, null);
  return query select result.order_id, result.delivery_code, result.cancel_code;
end;
$$;

create or replace function public.create_menu_order_with_payment(
  p_restaurant_id uuid, p_items jsonb, p_customer_name text, p_customer_phone text,
  p_delivery_address text, p_delivery_reference text, p_request_id uuid, p_method text,
  p_offer_code text default null, p_delivery_latitude double precision default null,
  p_delivery_longitude double precision default null
)
returns table (order_id uuid, delivery_code text, cancel_code text, guest_access_token text)
language plpgsql security definer set search_path = '' as $$
declare result record; intent record;
begin
  if not exists (
    select 1 from public.restaurant_menu_settings m
    join public.restaurants r on r.id = m.restaurant_id
    where m.restaurant_id = p_restaurant_id and m.published and r.active
  ) then raise exception 'menu is unavailable'; end if;
  perform private.require_wallet_account(p_restaurant_id, p_method);
  select * into result from private.create_order_internal(
    p_restaurant_id, p_items, p_customer_name, p_customer_phone, p_delivery_address,
    p_delivery_reference, p_request_id, true, 'menu', null, null
  );
  perform private.apply_app_offer(result.order_id, p_offer_code);
  perform private.set_checkout_coordinates(result.order_id, p_delivery_latitude, p_delivery_longitude);
  select * into intent from public.create_payment_intent(result.order_id, p_method, result.guest_access_token);
  return query select result.order_id, result.delivery_code, result.cancel_code, result.guest_access_token;
end;
$$;

create or replace function public.create_table_order_with_payment(
  p_restaurant_id uuid, p_items jsonb, p_customer_name text, p_customer_phone text,
  p_delivery_address text, p_delivery_reference text, p_request_id uuid,
  p_table_id uuid, p_table_session_id uuid,
  p_method text, p_offer_code text default null
)
returns table (order_id uuid, delivery_code text, cancel_code text, guest_access_token text)
language plpgsql security definer set search_path = '' as $$
declare v_session uuid; result record; intent record;
begin
  if p_table_id is null then raise exception 'table is required'; end if;
  select s.id into v_session from public.table_sessions s
  join public.restaurant_tables t on t.id = s.table_id
  where s.table_id = p_table_id and s.restaurant_id = p_restaurant_id and t.active
    and s.status in ('open', 'payment_pending')
    and (p_table_session_id is null or s.id = p_table_session_id)
  order by s.opened_at desc limit 1;
  if v_session is null then raise exception 'active table session is required'; end if;
  perform private.require_wallet_account(p_restaurant_id, p_method);
  select * into result from private.create_order_internal(
    p_restaurant_id, p_items, p_customer_name, p_customer_phone, p_delivery_address,
    p_delivery_reference, p_request_id, true, 'table_qr', p_table_id, v_session
  );
  perform private.apply_app_offer(result.order_id, p_offer_code);
  select * into intent from public.create_payment_intent(result.order_id, p_method, result.guest_access_token);
  return query select result.order_id, result.delivery_code, result.cancel_code, result.guest_access_token;
end;
$$;

revoke all on function private.require_wallet_account(uuid, text) from public, anon, authenticated;
revoke all on function private.set_checkout_coordinates(uuid, double precision, double precision) from public, anon, authenticated;
revoke all on function public.create_delivery_order_with_payment(uuid, jsonb, text, text, text, uuid, text, text, double precision, double precision) from public, anon;
grant execute on function public.create_delivery_order_with_payment(uuid, jsonb, text, text, text, uuid, text, text, double precision, double precision) to authenticated;
revoke all on function public.create_menu_order_with_payment(uuid, jsonb, text, text, text, text, uuid, text, text, double precision, double precision) from public;
grant execute on function public.create_menu_order_with_payment(uuid, jsonb, text, text, text, text, uuid, text, text, double precision, double precision) to anon, authenticated;
revoke all on function public.create_table_order_with_payment(uuid, jsonb, text, text, text, text, uuid, uuid, uuid, text, text) from public;
grant execute on function public.create_table_order_with_payment(uuid, jsonb, text, text, text, text, uuid, uuid, uuid, text, text) to anon, authenticated;

-- Device binding: only the new account-aware creator is used by the UI. The old
-- function remains for legacy devices and produces observations without binding.
create or replace function public.create_wallet_observer_device_for_account(
  p_restaurant_id uuid, p_receiver_account_id uuid, p_label text
)
returns table (device_id uuid, device_label text, device_token text)
language plpgsql security definer set search_path = '' as $$
declare v_token text; v_id uuid; v_label text;
begin
  if not (private.is_platform_admin() or private.has_restaurant_role(
    p_restaurant_id, array['owner', 'manager']::public.restaurant_role[]
  )) then raise exception 'not authorized'; end if;
  if not exists (
    select 1 from public.restaurant_payment_accounts a
    where a.id = p_receiver_account_id and a.restaurant_id = p_restaurant_id
  ) then raise exception 'receiver payment account is invalid'; end if;
  v_label := nullif(left(regexp_replace(trim(coalesce(p_label, '')), '\s+', ' ', 'g'), 80), '');
  if v_label is null then raise exception 'device label is required'; end if;
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.wallet_observer_devices (
    restaurant_id, receiver_account_id, label, token_hash, token_last4, created_by
  ) values (
    p_restaurant_id, p_receiver_account_id, v_label,
    extensions.crypt(v_token, extensions.gen_salt('bf')), right(v_token, 4), auth.uid()
  ) returning id into v_id;
  return query select v_id, v_label, v_token;
end;
$$;

revoke all on function public.create_wallet_observer_device_for_account(uuid, uuid, text) from public, anon;
grant execute on function public.create_wallet_observer_device_for_account(uuid, uuid, text) to authenticated;

-- El dispositivo de caja determina la cuenta receptora. El provider observado
-- queda como fuente de evidencia y ya no se usa como sustituto del destinatario.
create or replace function public.ingest_wallet_observation(
  p_device_token text, p_event_id text, p_provider text, p_sender_name text, p_code text,
  p_amount_cents bigint, p_currency text, p_observed_at timestamptz
)
returns table (observation_id uuid, was_inserted boolean)
language plpgsql security definer set search_path = '' as $$
declare
  v_device public.wallet_observer_devices%rowtype;
  v_event_id text := nullif(left(trim(coalesce(p_event_id, '')), 160), '');
  v_provider text := lower(trim(coalesce(p_provider, '')));
  v_currency text := upper(trim(coalesce(p_currency, 'PEN')));
  v_name text := nullif(left(regexp_replace(trim(coalesce(p_sender_name, '')), '\s+', ' ', 'g'), 120), '');
  v_code text := nullif(left(lower(regexp_replace(trim(coalesce(p_code, '')), '\s+', '', 'g')), 160), '');
  v_observation_id uuid;
begin
  if length(trim(coalesce(p_device_token, ''))) < 48 then raise exception 'invalid device token'; end if;
  if v_event_id is null or v_provider not in ('yape', 'lemon', 'plin', 'mercado_pago', 'generic') then raise exception 'invalid wallet observation'; end if;
  if p_amount_cents is null or p_amount_cents <= 0 or p_amount_cents > 100000000 then raise exception 'invalid amount'; end if;
  if v_currency not in ('PEN', 'ARS', 'USD') then raise exception 'unsupported currency'; end if;
  if p_observed_at is null or p_observed_at < now() - interval '7 days' or p_observed_at > now() + interval '5 minutes' then raise exception 'invalid observed_at'; end if;
  if v_code is not null and v_code !~ '^[a-z0-9-]+$' then v_code := null; end if;

  select d.* into v_device from public.wallet_observer_devices d
  where d.active and extensions.crypt(trim(p_device_token), d.token_hash) = d.token_hash
  limit 1;
  if not found then raise exception 'invalid device token'; end if;

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
    select o.id into v_observation_id from public.wallet_observations o where o.device_id = v_device.id and o.event_id = v_event_id;
    return query select v_observation_id, false;
  end if;
  return query select v_observation_id, true;
end;
$$;

-- Full code collisions are ambiguous too. Verification re-counts every matching
-- pending attempt; the UI list is only a hint and never grants authority.
create or replace function public.list_wallet_payment_candidates(p_observation_id uuid)
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
    and pa.created_at <= wo.observed_at and pa.expires_at >= wo.observed_at
    and (((pa.payer_code_digest is not null and wo.code_fingerprint is not null) and pa.payer_code_digest = wo.code_fingerprint)
      or ((pa.payer_code_digest is null or wo.code_fingerprint is null) and pa.payer_code_last4 is not null and wo.code_last4 is not null and pa.payer_code_last4 = wo.code_last4))
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
  v_full_identity boolean;
begin
  select * into v_observation from public.wallet_observations where id = p_observation_id for update;
  if not found then raise exception 'wallet observation not found'; end if;
  if not (private.is_platform_admin() or private.has_restaurant_role(v_observation.restaurant_id, array['owner', 'manager']::public.restaurant_role[])) then raise exception 'not authorized'; end if;
  select pa.* into v_attempt from public.payment_attempts pa join public.orders o on o.id = pa.order_id
  where pa.id = p_payment_attempt_id and o.restaurant_id = v_observation.restaurant_id for update;
  if not found then raise exception 'payment attempt not found'; end if;
  select o.status into v_order_status from public.orders o where o.id = v_attempt.order_id;
  if v_order_status in ('cancelled', 'delivered') then raise exception 'cancelled order cannot be verified'; end if;

  v_full_identity := v_attempt.payer_code_digest is not null and v_observation.code_fingerprint is not null;
  if v_observation.verification_status not in ('unverified', 'under_review')
    or v_observation.provider not in ('yape', 'lemon') or v_observation.currency <> 'PEN'
    or v_attempt.provider <> 'wallet_observer' or round(v_attempt.amount * 100) <> v_observation.amount_cents
    or (v_attempt.receiver_account_id is not null and v_attempt.receiver_account_id <> v_observation.receiver_account_id)
    or (v_attempt.receiver_account_id is null and v_observation.receiver_account_id is not null)
    or (v_attempt.receiver_account_id is null and v_observation.receiver_account_id is null and v_attempt.method::text <> v_observation.provider)
    or v_attempt.status <> 'pending' or v_attempt.created_at > v_observation.observed_at or v_attempt.expires_at < v_observation.observed_at
    or v_observation.code_last4 is null
    or (v_full_identity and v_attempt.payer_code_digest <> v_observation.code_fingerprint)
    or (not v_full_identity and (v_attempt.payer_code_last4 is null or v_attempt.payer_code_last4 <> v_observation.code_last4))
  then raise exception 'wallet observation does not match payment identity'; end if;

  select count(*) into v_matching_attempts
  from public.payment_attempts pa join public.orders o on o.id = pa.order_id
  where o.restaurant_id = v_observation.restaurant_id and o.status not in ('cancelled', 'delivered')
    and pa.provider = 'wallet_observer' and pa.status = 'pending'
    and ((pa.receiver_account_id is not null and pa.receiver_account_id = v_observation.receiver_account_id)
      or (pa.receiver_account_id is null and v_observation.receiver_account_id is null and pa.method::text = v_observation.provider))
    and round(pa.amount * 100) = v_observation.amount_cents
    and pa.created_at <= v_observation.observed_at and pa.expires_at >= v_observation.observed_at
    and (((v_full_identity) and pa.payer_code_digest = v_observation.code_fingerprint)
      or ((not v_full_identity) and pa.payer_code_last4 = v_observation.code_last4));
  if v_matching_attempts <> 1 then raise exception 'payment identity is ambiguous; full operation code required'; end if;

  update public.wallet_observations set verification_status = 'verified' where id = v_observation.id;
  update public.payment_attempts set status = 'authorized', provider_reference = 'wallet_observation:' || v_observation.id::text,
    observed_wallet_observation_id = v_observation.id, updated_at = now() where id = v_attempt.id;
  return true;
end;
$$;

revoke all on function private.require_wallet_account(uuid, text) from public, anon, authenticated;
revoke all on function private.set_checkout_coordinates(uuid, double precision, double precision) from public, anon, authenticated;
revoke execute on function public.list_wallet_payment_candidates(uuid) from public, anon;
grant execute on function public.list_wallet_payment_candidates(uuid) to authenticated;
revoke execute on function public.verify_wallet_payment(uuid, uuid) from public, anon;
grant execute on function public.verify_wallet_payment(uuid, uuid) to authenticated;

comment on column public.payment_attempts.receiver_account_id is 'Cuenta receptora exacta usada para el QR; no se infiere del proveedor notificado.';
comment on column public.wallet_observations.receiver_account_id is 'Cuenta receptora a la que está vinculado el dispositivo observador.';
comment on function public.verify_wallet_payment(uuid, uuid) is 'Verifica una sola observación contra una sola cuenta receptora e identidad de constancia; nunca confía solo en monto o notificación.';
