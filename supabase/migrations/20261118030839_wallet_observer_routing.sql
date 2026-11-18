-- El checkout mantiene congelados el QR y su destinatario desde la asignación.
create table private.wallet_observer_checkout (
  restaurant_id uuid primary key references public.restaurants(id) on delete cascade,
  enabled boolean not null default false
);

create table private.wallet_observer_slots (
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  priority smallint not null check (priority between 1 and 3),
  device_id uuid unique references public.wallet_observer_devices(id) on delete set null,
  primary key (restaurant_id, priority)
);

create table private.wallet_observer_routes (
  id uuid primary key default extensions.gen_random_uuid(),
  restaurant_id uuid not null,
  priority smallint not null,
  provider text not null check (provider in ('yape', 'lemon')),
  recipient text not null check (length(recipient) between 2 and 120),
  qr_payload text not null check (length(qr_payload) between 12 and 2000),
  version uuid not null default extensions.gen_random_uuid(),
  configured_at timestamptz not null default now(),
  tested_at timestamptz,
  enabled boolean not null default false,
  unique (restaurant_id, priority, provider),
  foreign key (restaurant_id, priority)
    references private.wallet_observer_slots(restaurant_id, priority) on delete cascade
);

create unique index wallet_observer_routes_qr_uidx
  on private.wallet_observer_routes (restaurant_id, extensions.digest(qr_payload, 'sha256'));

alter table private.wallet_observer_checkout enable row level security;
alter table private.wallet_observer_slots enable row level security;
alter table private.wallet_observer_routes enable row level security;
revoke all on private.wallet_observer_checkout, private.wallet_observer_slots,
  private.wallet_observer_routes from public, anon, authenticated;

alter table public.wallet_observer_devices
  add column heartbeat_at timestamptz,
  add column listener_ready boolean not null default false,
  add column ready_wallets text[] not null default '{}',
  add column pending_observations integer not null default 0;

alter table public.wallet_observer_pairings
  alter column receiver_account_id drop not null,
  add column observer_priority smallint check (observer_priority between 1 and 3),
  add column routed_code_digest bytea unique,
  add constraint wallet_observer_pairing_target check (
    (receiver_account_id is null) <> (observer_priority is null)
  );

alter table public.payment_attempts
  add column observer_route_id uuid,
  add column observer_route_version uuid,
  add column observer_recipient text;

alter table public.wallet_observations
  add column observer_route_id uuid,
  add column observer_route_version uuid;

create index payment_attempts_observer_route_idx
  on public.payment_attempts (observer_route_id, observer_route_version, amount_cents)
  where observer_route_id is not null and status = 'pending';
create index wallet_observations_observer_route_idx
  on public.wallet_observations (observer_route_id, observer_route_version, amount_cents, observed_at desc)
  where observer_route_id is not null;

drop trigger if exists wallet_observations_auto_settle_opt_in on public.wallet_observations;
drop function if exists private.try_auto_settle_wallet_observation();

create function private.require_wallet_route_admin(p_restaurant_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or not (
    private.is_platform_admin() or private.has_restaurant_role(
      p_restaurant_id, array['owner', 'manager']::public.restaurant_role[]
    )
  ) then raise exception 'No tienes permiso para administrar estas billeteras.'; end if;
end;
$$;

create function private.audit_observer_routing(p_restaurant_id uuid, p_action text, p_details jsonb)
returns void language sql security definer set search_path = '' as $$
  insert into public.audit_log (actor_id, table_name, row_id, action, new_data)
  values ((select auth.uid()), 'wallet_observer_routing', p_restaurant_id::text, p_action, p_details);
$$;

create function private.wallet_route_health(
  p_route private.wallet_observer_routes, p_device public.wallet_observer_devices
)
returns text language sql stable set search_path = '' as $$
  select case
    when p_route.id is null then 'missing_qr'
    when p_device.id is null then 'unpaired'
    when not p_device.active then 'device_paused'
    when p_device.heartbeat_at is null or p_device.heartbeat_at <= now() - interval '3 minutes' then 'offline'
    when not p_device.listener_ready then 'listener_unavailable'
    when not (p_route.provider = any(p_device.ready_wallets)) then 'wallet_unavailable'
    when p_device.pending_observations > 0 then 'sync_pending'
    when p_route.tested_at is null then 'needs_test'
    when not p_route.enabled then 'paused'
    else 'ready'
  end;
$$;

create function private.observer_checkout_enabled(p_restaurant_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from private.wallet_observer_checkout where restaurant_id = p_restaurant_id and enabled
  );
$$;

create function private.pick_wallet_observer_route(p_restaurant_id uuid, p_provider text)
returns private.wallet_observer_routes language sql security definer set search_path = '' as $$
  select r.*
  from private.wallet_observer_routes r
  join private.wallet_observer_slots s using (restaurant_id, priority)
  join public.wallet_observer_devices d on d.id = s.device_id and d.restaurant_id = s.restaurant_id
  where r.restaurant_id = p_restaurant_id and r.provider = p_provider
    and private.wallet_route_health(r, d) = 'ready'
  order by r.priority
  limit 1
$$;

create function public.list_wallet_observer_routes(p_restaurant_id uuid)
returns table (
  priority integer, provider text, device_id uuid, heartbeat_at timestamptz, auto_settle boolean,
  recipient text, qr_payload text, version uuid, enabled boolean, checkout_enabled boolean, health text
)
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_wallet_route_admin(p_restaurant_id);
  return query
  select n, w, d.id, d.heartbeat_at, coalesce(d.auto_settle_orders, false),
    r.recipient, r.qr_payload, r.version, coalesce(r.enabled, false),
    private.observer_checkout_enabled(p_restaurant_id), private.wallet_route_health(r, d)
  from generate_series(1, 3) n cross join (values ('yape'::text), ('lemon'::text)) wallet(w)
  left join private.wallet_observer_slots s on s.restaurant_id = p_restaurant_id and s.priority = n
  left join public.wallet_observer_devices d on d.id = s.device_id and d.restaurant_id = p_restaurant_id
  left join private.wallet_observer_routes r
    on r.restaurant_id = p_restaurant_id and r.priority = n and r.provider = w
  order by n, w desc;
end;
$$;

create function public.save_wallet_observer_route(
  p_restaurant_id uuid, p_priority integer, p_provider text, p_recipient text, p_qr_payload text
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_qr text := trim(p_qr_payload);
  v_recipient text := trim(p_recipient);
begin
  perform private.require_wallet_route_admin(p_restaurant_id);
  if p_priority is null or p_priority not between 1 and 3 or p_provider is null
    or p_provider not in ('lemon', 'yape') or v_recipient is null
    or length(v_recipient) not between 2 and 120 or v_qr is null
    or length(v_qr) not between 12 and 2000
    or v_qr ~ '[[:cntrl:]]' or v_qr ~* '^(data|javascript|file|blob):' then
    raise exception 'Revisa el nombre y el contenido del QR oficial.';
  end if;
  insert into private.wallet_observer_slots (restaurant_id, priority)
  values (p_restaurant_id, p_priority) on conflict do nothing;
  insert into private.wallet_observer_routes as r (restaurant_id, priority, provider, recipient, qr_payload)
  values (p_restaurant_id, p_priority, p_provider, v_recipient, v_qr)
  on conflict (restaurant_id, priority, provider) do update
  set recipient = excluded.recipient, qr_payload = excluded.qr_payload,
      configured_at = now(), tested_at = null, enabled = false, version = extensions.gen_random_uuid()
  where (r.recipient, r.qr_payload) is distinct from (excluded.recipient, excluded.qr_payload);
  if found then
    perform private.audit_observer_routing(p_restaurant_id, 'UPDATE',
      jsonb_build_object('priority', p_priority, 'provider', p_provider, 'change', 'qr'));
  end if;
end;
$$;

create function public.set_wallet_observer_route_enabled(
  p_restaurant_id uuid, p_priority integer, p_provider text, p_version uuid, p_enabled boolean
)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_wallet_route_admin(p_restaurant_id);
  update private.wallet_observer_routes r
  set enabled = p_enabled, tested_at = case when p_enabled then coalesce(r.tested_at, now()) else r.tested_at end
  where r.restaurant_id = p_restaurant_id and r.priority = p_priority
    and r.provider = p_provider and r.version = p_version and (
      not p_enabled or exists (
        select 1 from private.wallet_observer_slots s
        join public.wallet_observer_devices d on d.id = s.device_id and d.restaurant_id = s.restaurant_id
        where s.restaurant_id = r.restaurant_id and s.priority = r.priority
          and d.active and d.listener_ready and d.pending_observations = 0
          and d.heartbeat_at > now() - interval '3 minutes' and r.provider = any(d.ready_wallets)
          and (r.tested_at is not null or exists (
            select 1 from public.wallet_observations o
            where o.device_id = d.id and o.observer_route_id = r.id and o.observer_route_version = r.version
              and o.currency = 'PEN' and o.observed_at between greatest(r.configured_at, now() - interval '7 days') and now()
          ))
      )
    );
  if not found then raise exception 'Se necesita un QR vigente, Suya Caja conectada y un abono de prueba observado.'; end if;
  perform private.audit_observer_routing(p_restaurant_id, 'UPDATE',
    jsonb_build_object('priority', p_priority, 'provider', p_provider, 'enabled', p_enabled));
end;
$$;

create function public.set_wallet_observer_checkout(
  p_restaurant_id uuid, p_enabled boolean
)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_wallet_route_admin(p_restaurant_id);
  if p_enabled and (private.pick_wallet_observer_route(p_restaurant_id, 'yape')).id is null
    and (private.pick_wallet_observer_route(p_restaurant_id, 'lemon')).id is null then
    raise exception 'Prueba y activa al menos una billetera con Suya Caja conectada.';
  end if;
  insert into private.wallet_observer_checkout (restaurant_id, enabled)
  values (p_restaurant_id, p_enabled)
  on conflict (restaurant_id) do update set enabled = excluded.enabled;
  perform private.audit_observer_routing(p_restaurant_id, 'UPDATE',
    jsonb_build_object('checkout_enabled', p_enabled));
end;
$$;

create function private.bind_wallet_observer_slot(p_restaurant_id uuid, p_priority integer, p_device_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_previous uuid;
begin
  if not exists (
    select 1 from public.wallet_observer_devices d
    where d.id = p_device_id and d.restaurant_id = p_restaurant_id and d.active
  ) then raise exception 'Elige un dispositivo activo de este restaurante.'; end if;
  insert into private.wallet_observer_slots (restaurant_id, priority)
  values (p_restaurant_id, p_priority) on conflict do nothing;
  select s.device_id into v_previous from private.wallet_observer_slots s
  where s.restaurant_id = p_restaurant_id and s.priority = p_priority for update;
  if v_previous is not distinct from p_device_id then return; end if;
  -- Bloquea las rutas antes de cambiar su dispositivo y exige una nueva validación en caja.
  update private.wallet_observer_routes r
  set enabled = false, configured_at = now(), tested_at = null, version = extensions.gen_random_uuid()
  where r.restaurant_id = p_restaurant_id and r.priority = p_priority;
  update private.wallet_observer_slots s set device_id = p_device_id
  where s.restaurant_id = p_restaurant_id and s.priority = p_priority;
  perform private.audit_observer_routing(p_restaurant_id, 'UPDATE',
    jsonb_build_object('priority', p_priority, 'device_id', p_device_id));
end;
$$;

create function public.bind_wallet_observer_slot(p_restaurant_id uuid, p_priority integer, p_device_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_wallet_route_admin(p_restaurant_id);
  perform private.bind_wallet_observer_slot(p_restaurant_id, p_priority, p_device_id);
end;
$$;

create function public.create_routed_wallet_observer_pairing(p_restaurant_id uuid, p_priority integer, p_label text)
returns table (pairing_code text, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  v_code text := upper(encode(extensions.gen_random_bytes(8), 'hex'));
  v_label text := trim(p_label);
  v_expires timestamptz := now() + interval '10 minutes';
begin
  perform private.require_wallet_route_admin(p_restaurant_id);
  if v_label is null or length(v_label) not between 1 and 80 or p_priority is null or p_priority not between 1 and 3 then
    raise exception 'Selecciona un puesto y escribe el nombre del dispositivo.';
  end if;
  insert into private.wallet_observer_slots (restaurant_id, priority)
  values (p_restaurant_id, p_priority) on conflict do nothing;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_restaurant_id::text || ':observer_pair:' || p_priority::text, 0)
  );
  update public.wallet_observer_pairings p set consumed_at = now()
  where p.restaurant_id = p_restaurant_id and p.observer_priority = p_priority and p.consumed_at is null;
  insert into public.wallet_observer_pairings (restaurant_id, observer_priority, label, code_hash, routed_code_digest, expires_at, created_by)
  values (p_restaurant_id, p_priority, v_label, extensions.crypt(lower(v_code), extensions.gen_salt('bf')),
    extensions.digest(lower(v_code), 'sha256'), v_expires, (select auth.uid()));
  return query select v_code, v_expires;
end;
$$;

create function public.report_wallet_observer_health(
  p_device_token text, p_listener_ready boolean, p_wallets text[], p_pending integer
)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_token text := trim(p_device_token);
begin
  if v_token is null or length(v_token) not between 48 and 128 then return false; end if;
  begin
    v_id := split_part(v_token, '.', 1)::uuid;
  exception when invalid_text_representation then
    return false;
  end;
  update public.wallet_observer_devices d
  set heartbeat_at = now(), listener_ready = coalesce(p_listener_ready, false),
      ready_wallets = array(select w from unnest(array['yape', 'lemon']) w where w = any(p_wallets)),
      pending_observations = least(500, greatest(0, coalesce(p_pending, 500)))
  where d.id = v_id and d.active
    and extensions.crypt(v_token, d.token_hash) = d.token_hash;
  return found;
end;
$$;

revoke all on function private.require_wallet_route_admin(uuid), private.audit_observer_routing(uuid, text, jsonb),
  private.wallet_route_health(private.wallet_observer_routes, public.wallet_observer_devices),
  private.observer_checkout_enabled(uuid), private.pick_wallet_observer_route(uuid, text),
  private.bind_wallet_observer_slot(uuid, integer, uuid) from public, anon, authenticated;

revoke all on function public.list_wallet_observer_routes(uuid),
  public.save_wallet_observer_route(uuid, integer, text, text, text),
  public.set_wallet_observer_route_enabled(uuid, integer, text, uuid, boolean),
  public.set_wallet_observer_checkout(uuid, boolean),
  public.bind_wallet_observer_slot(uuid, integer, uuid),
  public.create_routed_wallet_observer_pairing(uuid, integer, text) from public, anon, authenticated;
grant execute on function public.list_wallet_observer_routes(uuid),
  public.save_wallet_observer_route(uuid, integer, text, text, text),
  public.set_wallet_observer_route_enabled(uuid, integer, text, uuid, boolean),
  public.set_wallet_observer_checkout(uuid, boolean),
  public.bind_wallet_observer_slot(uuid, integer, uuid),
  public.create_routed_wallet_observer_pairing(uuid, integer, text) to authenticated;
revoke all on function public.report_wallet_observer_health(text, boolean, text[], integer) from public, anon, authenticated;
grant execute on function public.report_wallet_observer_health(text, boolean, text[], integer) to anon, authenticated;

create or replace function public.complete_wallet_observer_pairing(
  p_pairing_code text,
  p_device_label text default null
)
returns table (
  device_id uuid,
  device_label text,
  device_token text,
  restaurant_id uuid,
  receiver_account_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text := lower(regexp_replace(trim(coalesce(p_pairing_code, '')), '\s+', '', 'g'));
  v_pairing public.wallet_observer_pairings%rowtype;
  v_device_id uuid := extensions.gen_random_uuid();
  v_device_token text := v_device_id::text || '.' || encode(extensions.gen_random_bytes(32), 'hex');
  v_label text;
begin
  if v_code !~ '^([a-f0-9]{8}|[a-f0-9]{16})$' then
    raise exception 'invalid or expired pairing code';
  end if;

  select pairing.* into v_pairing
  from public.wallet_observer_pairings pairing
  where pairing.consumed_at is null
    and pairing.expires_at > now()
    and (
      (length(v_code) = 16 and pairing.routed_code_digest = extensions.digest(v_code, 'sha256'))
      or (length(v_code) = 8 and pairing.observer_priority is null
        and extensions.crypt(v_code, pairing.code_hash) = pairing.code_hash)
    )
  order by pairing.created_at desc
  limit 1
  for update;
  if not found then raise exception 'invalid or expired pairing code'; end if;

  v_label := nullif(left(regexp_replace(trim(coalesce(p_device_label, '')), '\s+', ' ', 'g'), 80), '');
  v_label := coalesce(v_label, v_pairing.label);

  insert into public.wallet_observer_devices (
    id, restaurant_id, receiver_account_id, label, token_hash, token_last4, created_by
  ) values (
    v_device_id,
    v_pairing.restaurant_id,
    v_pairing.receiver_account_id,
    v_label,
    extensions.crypt(v_device_token, extensions.gen_salt('bf')),
    right(v_device_token, 4),
    null
  );

  update public.wallet_observer_pairings
  set consumed_at = now()
  where id = v_pairing.id;

  if v_pairing.observer_priority is not null then
    perform private.bind_wallet_observer_slot(v_pairing.restaurant_id, v_pairing.observer_priority, v_device_id);
  end if;

  return query select
    v_device_id,
    v_label,
    v_device_token,
    v_pairing.restaurant_id,
    v_pairing.receiver_account_id;
end;
$$;

create or replace function public.get_public_checkout_payment_options(p_restaurant_id uuid)
returns table (
  active_provider text,
  verification_mode text,
  account_label text,
  supports_yape boolean,
  supports_lemon boolean,
  supports_card boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cfg public.payment_gateway_configs%rowtype;
  v_has_legacy_yape boolean := false;
  v_has_legacy_lemon boolean := false;
begin
  if p_restaurant_id is null then return; end if;

  if private.observer_checkout_enabled(p_restaurant_id) then
    return query select 'observer_routing'::text, 'assisted_manual'::text, null::text,
      (private.pick_wallet_observer_route(p_restaurant_id, 'yape')).id is not null,
      (private.pick_wallet_observer_route(p_restaurant_id, 'lemon')).id is not null,
      exists (select 1 from public.payment_gateway_configs c where c.restaurant_id = p_restaurant_id
        and c.active and c.provider in ('mercado_pago', 'culqi', 'izipay'));
    return;
  end if;

  select * into v_cfg
  from public.payment_gateway_configs c
  where c.restaurant_id = p_restaurant_id
    and c.active = true
  order by c.updated_at desc
  limit 1;

  if found then
    return query select
      v_cfg.provider,
      v_cfg.verification_mode,
      v_cfg.account_label,
      (v_cfg.provider in ('static_qr', 'mercado_pago', 'taypi_qr', 'culqi', 'izipay')),
      (v_cfg.provider in ('static_qr', 'taypi_qr', 'izipay')),
      (v_cfg.provider in ('mercado_pago', 'culqi', 'izipay'));
    return;
  end if;

  select exists (
    select 1 from public.restaurant_payment_accounts rpa
    where rpa.restaurant_id = p_restaurant_id and rpa.provider = 'yape' and rpa.active
  ) into v_has_legacy_yape;

  select exists (
    select 1 from public.restaurant_payment_accounts rpa
    where rpa.restaurant_id = p_restaurant_id and rpa.provider = 'lemon' and rpa.active
  ) into v_has_legacy_lemon;

  return query select
    case when v_has_legacy_yape or v_has_legacy_lemon then 'wallet_observer'::text else 'cash_only'::text end,
    'assisted_manual'::text,
    null::text,
    v_has_legacy_yape,
    v_has_legacy_lemon,
    false;
end;
$$;

create or replace function private.require_wallet_account(p_restaurant_id uuid, p_method text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_method text := lower(trim(coalesce(p_method, '')));
  v_id uuid;
begin
  if v_method in ('yape', 'lemon') and private.observer_checkout_enabled(p_restaurant_id) then
    -- create_payment_intent elige la ruta en la misma transacción del checkout.
    -- Posponer la comprobación permite recuperar un pedido idempotente ya asignado.
    return p_restaurant_id;
  end if;

  select c.id into v_id
  from public.payment_gateway_configs c
  where c.restaurant_id = p_restaurant_id
    and c.active = true
    and (
      (v_method in ('yape', 'lemon') and c.provider in ('static_qr', 'mercado_pago', 'taypi_qr', 'culqi', 'izipay'))
      or (v_method = 'card' and c.provider in ('mercado_pago', 'culqi', 'izipay'))
    )
  order by c.updated_at desc
  limit 1
  for share;

  if v_id is not null then
    return v_id;
  end if;

  select id into v_id from public.restaurant_payment_accounts
  where restaurant_id = p_restaurant_id and provider = v_method and active
  for share;
  if v_id is null then raise exception 'restaurant payment account is not configured'; end if;
  return v_id;
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
  v_cfg public.payment_gateway_configs%rowtype;
  v_route private.wallet_observer_routes;
  v_assigned_at timestamptz;
  v_qr_payload text;
  v_receiver_account_id uuid;
  v_gateway_config_id uuid;
  v_guest_ok boolean := false;
  v_idempotency text;
  v_has_prior_attempt boolean := false;
  v_unique_cents bigint;
  v_static_network text := null;
begin
  if p_order_id is null then raise exception 'order is required'; end if;
  if lower(trim(coalesce(p_method, ''))) not in ('yape', 'lemon', 'card') then
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
  elsif (select auth.uid()) is null or v_order.customer_id <> (select auth.uid()) then
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
    if v_attempt.observer_route_id is not null then
      return query select v_attempt.id, v_attempt.order_id, v_attempt.method, v_attempt.status,
        v_attempt.amount, 'PEN'::text, v_attempt.checkout_reference, v_attempt.expires_at,
        v_attempt.provider, v_attempt.gateway_qr_payload;
      return;
    end if;
    if v_attempt.gateway_config_id is not null then
      select * into v_cfg
      from public.payment_gateway_configs c
      where c.id = v_attempt.gateway_config_id
        and c.restaurant_id = v_order.restaurant_id
        and c.active;
      if not found then raise exception 'gateway config is no longer active'; end if;
      v_qr_payload := coalesce(v_attempt.synthesized_qr_payload, v_attempt.gateway_qr_payload, v_cfg.qr_payload);
      return query select v_attempt.id, v_attempt.order_id, v_attempt.method, v_attempt.status,
        case
          when v_attempt.provider = 'static_qr' and v_attempt.unique_conciliation_amount_cents is not null
            then round(v_attempt.unique_conciliation_amount_cents / 100.0, 2)
          else v_attempt.amount
        end,
        'PEN'::text, v_attempt.checkout_reference, v_attempt.expires_at,
        v_attempt.provider, v_qr_payload;
      return;
    end if;

    if v_attempt.receiver_account_id is not null then
      select rpa.id, rpa.qr_payload into v_receiver_account_id, v_qr_payload
      from public.restaurant_payment_accounts rpa
      where rpa.id = v_attempt.receiver_account_id
        and rpa.restaurant_id = v_order.restaurant_id
        and rpa.active;
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
  select exists (
    select 1 from public.payment_attempts pa where pa.order_id = v_order.id
  ) into v_has_prior_attempt;
  v_idempotency := 'order:' || v_order.id::text || ':' || v_method::text
    || case when v_has_prior_attempt then ':retry:' || extensions.gen_random_uuid()::text else '' end;

  if exists (
    select 1 from public.payment_attempts pa
    where pa.order_id = v_order.id and pa.observer_route_id is not null
  ) then
    raise exception 'El QR de este pedido ya fue asignado. Contacta a Caja para revisar el pago.';
  end if;

  if v_method in ('yape', 'lemon') and private.observer_checkout_enabled(v_order.restaurant_id) then
    v_route := private.pick_wallet_observer_route(v_order.restaurant_id, v_method::text);
    if v_route.id is null then raise exception 'wallet_observer_unavailable'; end if;
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_route.id::text, 1));
    v_assigned_at := clock_timestamp();

    perform set_config('suya.payment_method_mutation', '1', true);
    update public.orders set payment_method = v_method where id = v_order.id;
    insert into public.payment_attempts (
      order_id, provider, method, status, amount, idempotency_key, expires_at, created_at,
      observer_route_id, observer_route_version, observer_recipient, gateway_qr_payload
    ) values (
      v_order.id, 'wallet_observer', v_method, 'pending', v_order.total, v_idempotency,
      v_assigned_at + interval '30 minutes', v_assigned_at,
      v_route.id, v_route.version, v_route.recipient, v_route.qr_payload
    ) returning * into v_attempt;
    return query select v_attempt.id, v_attempt.order_id, v_attempt.method, v_attempt.status,
      v_attempt.amount, 'PEN'::text, v_attempt.checkout_reference, v_attempt.expires_at,
      v_attempt.provider, v_attempt.gateway_qr_payload;
    return;
  end if;

  -- Preferir pasarela / AutoCloud configurada en payment_gateway_configs
  select * into v_cfg
  from public.payment_gateway_configs c
  where c.restaurant_id = v_order.restaurant_id
    and c.active = true
    and (
      (v_method::text in ('yape', 'lemon') and c.provider in ('static_qr', 'mercado_pago', 'taypi_qr', 'culqi', 'izipay'))
      or (v_method::text = 'card' and c.provider in ('mercado_pago', 'culqi', 'izipay'))
    )
  order by c.updated_at desc
  limit 1;

  if found then
    v_gateway_config_id := v_cfg.id;
    v_qr_payload := v_cfg.qr_payload;
    if v_cfg.provider = 'static_qr' then
      v_static_network := case
        when lower(coalesce(v_cfg.qr_payload, '')) like '%izipay%' then 'izipayya'
        when lower(coalesce(v_cfg.qr_payload, '')) ~ '(lemon|gmoney|dale)' then 'lemon'
        when lower(coalesce(v_cfg.qr_payload, '')) ~ '(plin|interbank|bbva|scotiabank)' then 'plin'
        else 'yape'
      end;
      v_unique_cents := private.allocate_static_qr_conciliation_cents(
        v_cfg.id,
        round(v_order.total * 100)::bigint,
        v_static_network
      );
    else
      v_static_network := null;
      v_unique_cents := round(v_order.total * 100)::bigint;
    end if;

    perform set_config('suya.payment_method_mutation', '1', true);
    update public.orders set payment_method = v_method where id = v_order.id;

    insert into public.payment_attempts (
      order_id, gateway_config_id, provider, method, status, amount,
      unique_conciliation_amount_cents, static_wallet_network, verification_mode, idempotency_key, expires_at
    ) values (
      v_order.id, v_gateway_config_id, v_cfg.provider, v_method, 'pending', v_order.total,
      v_unique_cents, v_static_network, v_cfg.verification_mode, v_idempotency, now() + interval '30 minutes'
    ) returning * into v_attempt;

    return query select v_attempt.id, v_attempt.order_id, v_attempt.method, v_attempt.status,
      case
        when v_attempt.provider = 'static_qr' and v_attempt.unique_conciliation_amount_cents is not null
          then round(v_attempt.unique_conciliation_amount_cents / 100.0, 2)
        else v_attempt.amount
      end,
      'PEN'::text, v_attempt.checkout_reference, v_attempt.expires_at,
      v_attempt.provider, v_qr_payload;
    return;
  end if;

  if v_method::text = 'card' then
    raise exception 'card gateway is not configured for this restaurant';
  end if;

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
  v_keep_assignment boolean;
begin
  select * into v_intent
  from public.create_payment_intent(p_order_id, p_method, p_guest_access_token);
  if not found then return; end if;

  select (pa.payment_declared_at is not null or pa.observer_route_id is not null) into v_keep_assignment
  from public.payment_attempts pa
  where pa.id = v_intent.attempt_id;

  if v_intent.status = 'pending' and v_intent.expires_at <= now() then
    if v_keep_assignment then
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

    return query
    select * from public.create_payment_intent(p_order_id, p_method, p_guest_access_token);
    return;
  end if;

  return query select v_intent.attempt_id, v_intent.order_id, v_intent.method, v_intent.status,
    v_intent.amount, v_intent.currency, v_intent.checkout_reference, v_intent.expires_at,
    v_intent.provider, v_intent.qr_payload;
end;
$$;

drop function public.get_payment_intent(uuid, text);

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
  qr_payload text,
  observer_routed boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_attempt public.payment_attempts%rowtype;
  v_cfg public.payment_gateway_configs%rowtype;
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
  elsif (select auth.uid()) is null or v_order.customer_id <> (select auth.uid()) then
    return;
  end if;

  select pa.* into v_attempt from public.payment_attempts pa
  where pa.order_id = p_order_id order by pa.created_at desc limit 1;
  if not found then return; end if;

  if v_attempt.observer_route_id is not null then
    v_qr_payload := v_attempt.gateway_qr_payload;
  elsif v_attempt.gateway_config_id is not null then
    select * into v_cfg
    from public.payment_gateway_configs c
    where c.id = v_attempt.gateway_config_id
      and c.restaurant_id = v_order.restaurant_id
      and c.active;
    v_qr_payload := coalesce(
      v_attempt.synthesized_qr_payload,
      v_attempt.gateway_qr_payload,
      v_cfg.qr_payload
    );
  elsif v_attempt.receiver_account_id is not null then
    select rpa.qr_payload into v_qr_payload
    from public.restaurant_payment_accounts rpa
    where rpa.id = v_attempt.receiver_account_id
      and rpa.restaurant_id = v_order.restaurant_id
      and rpa.active;
  else
    select rpa.qr_payload into v_qr_payload
    from public.restaurant_payment_accounts rpa
    where rpa.restaurant_id = v_order.restaurant_id
      and rpa.provider = v_attempt.method::text and rpa.active;
    if v_qr_payload is null then
      v_qr_payload := coalesce(v_attempt.synthesized_qr_payload, v_attempt.gateway_qr_payload);
    end if;
  end if;

  return query select
    v_attempt.id,
    v_attempt.order_id,
    v_attempt.method,
    v_attempt.status,
    case
      when v_attempt.provider = 'static_qr' and v_attempt.unique_conciliation_amount_cents is not null
        then round(v_attempt.unique_conciliation_amount_cents / 100.0, 2)
      else v_attempt.amount
    end,
    'PEN'::text,
    v_attempt.checkout_reference,
    v_attempt.expires_at,
    v_attempt.provider,
    v_attempt.provider_reference,
    v_qr_payload,
    v_attempt.observer_route_id is not null;
end;
$$;

revoke all on function public.get_payment_intent(uuid, text) from public, anon, authenticated;
grant execute on function public.get_payment_intent(uuid, text) to anon, authenticated;

create or replace function public.get_payment_receiver_label(
  p_order_id uuid,
  p_guest_access_token text default null
)
returns table (account_label text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_attempt public.payment_attempts%rowtype;
  v_guest_ok boolean := false;
  v_label text;
begin
  select * into v_order from public.orders where id = p_order_id;
  if not found then return; end if;

  if v_order.customer_id is null then
    select exists (
      select 1
      from private.order_secrets s
      where s.order_id = v_order.id
        and p_guest_access_token is not null
        and length(p_guest_access_token) between 32 and 128
        and s.guest_access_token_hash is not null
        and extensions.crypt(p_guest_access_token, s.guest_access_token_hash) = s.guest_access_token_hash
    ) into v_guest_ok;
    if not v_guest_ok then return; end if;
  elsif (select auth.uid()) is null or v_order.customer_id <> (select auth.uid()) then
    return;
  end if;

  select pa.* into v_attempt
  from public.payment_attempts pa
  where pa.order_id = v_order.id
  order by pa.created_at desc
  limit 1;
  if not found then return; end if;

  if v_attempt.observer_route_id is not null then
    v_label := v_attempt.observer_recipient;
  elsif v_attempt.gateway_config_id is not null then
    select c.account_label into v_label
    from public.payment_gateway_configs c
    where c.id = v_attempt.gateway_config_id
      and c.restaurant_id = v_order.restaurant_id
      and c.active;
  elsif v_attempt.receiver_account_id is not null then
    select rpa.account_label into v_label
    from public.restaurant_payment_accounts rpa
    where rpa.id = v_attempt.receiver_account_id
      and rpa.restaurant_id = v_order.restaurant_id
      and rpa.active;
  else
    select rpa.account_label into v_label
    from public.restaurant_payment_accounts rpa
    where rpa.restaurant_id = v_order.restaurant_id
      and rpa.provider = v_attempt.method::text
      and rpa.active;
  end if;

  if v_label is null then return; end if;
  return query select v_label;
end;
$$;

-- La identidad del destino sale del dispositivo autenticado y del paquete de origen.
create function private.bind_routed_wallet_observation()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  select r.id, r.version into new.observer_route_id, new.observer_route_version
  from private.wallet_observer_slots s
  join private.wallet_observer_routes r using (restaurant_id, priority)
  where s.device_id = new.device_id and s.restaurant_id = new.restaurant_id and r.provider = new.provider
    and new.observed_at >= r.configured_at
    and new.origin_metadata ->> 'operationKind' = 'incoming_payment'
    and (
      (r.provider = 'lemon' and new.origin_metadata ->> 'packageName' = 'com.applemoncash')
      or (r.provider = 'yape' and new.origin_metadata ->> 'packageName'
        in ('com.bcp.innovacxion.yapeapp', 'com.bcp.yape.app'))
    );
  return new;
end;
$$;

create trigger wallet_observation_bind_route before insert on public.wallet_observations
for each row execute function private.bind_routed_wallet_observation();

-- Un mismo abono solo puede quedar aplicado una vez. La clave cubre el replay de
-- la notificación incluso si Android se empareja de nuevo durante el mismo día.
create table private.wallet_observer_settlements (
  observation_id uuid primary key references public.wallet_observations(id),
  payment_attempt_id uuid not null unique references public.payment_attempts(id),
  route_id uuid not null,
  event_id text not null,
  unique (route_id, event_id)
);
alter table private.wallet_observer_settlements enable row level security;
revoke all on private.wallet_observer_settlements from public, anon, authenticated;

create function private.settle_routed_wallet_observation(
  p_observation_id uuid, p_expected_attempt_id uuid default null, p_manual boolean default false
)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_obs public.wallet_observations%rowtype;
  v_order public.orders%rowtype;
  v_attempt public.payment_attempts%rowtype;
  v_ids uuid[];
  v_payer text;
  v_saved uuid;
begin
  -- Si una declaración y un abono llegan a la vez, el siguiente sondeo reintenta.
  select * into v_obs from public.wallet_observations o
  where o.id = p_observation_id and o.verification_status in ('unverified', 'under_review')
  for update skip locked;
  if not found or v_obs.observer_route_id is null or v_obs.currency <> 'PEN' then return false; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_obs.observer_route_id::text, 1));

  if not p_manual then
    if v_obs.observed_at < now() - interval '15 minutes' or v_obs.observed_at > clock_timestamp()
      or not exists (
        select 1 from public.wallet_observer_devices d
        where d.id = v_obs.device_id and d.active and d.auto_settle_orders
      ) then return false; end if;

    v_payer := private.normalize_person_name(v_obs.sender_name);
    if v_payer not like '% %' then return false; end if;

    -- Un código declarado tiene prioridad sobre la coincidencia por nombre.
    select array_agg(pa.id) into v_ids
    from public.payment_attempts pa join public.orders o on o.id = pa.order_id
    where o.restaurant_id = v_obs.restaurant_id and o.status = 'pending_payment'
      and pa.provider = 'wallet_observer' and pa.status = 'pending'
      and pa.observer_route_id = v_obs.observer_route_id
      and pa.observer_route_version = v_obs.observer_route_version
      and pa.method::text = v_obs.provider and pa.amount_cents = v_obs.amount_cents
      and v_obs.observed_at between pa.created_at and pa.expires_at
      and pa.expires_at > now()
      and (
        private.normalize_person_name(o.customer_name) = v_payer
        or (pa.payer_code_hmac = v_obs.code_hmac and private.normalize_person_name(pa.payer_display_name) = v_payer)
      )
      and (pa.payer_code_hmac is null or pa.payer_code_hmac = v_obs.code_hmac);

    if coalesce(cardinality(v_ids), 0) <> 1 then
      -- Si hay homónimos, solo una declaración con el mismo código puede decidir.
      select array_agg(pa.id) into v_ids from public.payment_attempts pa
      where pa.id = any(v_ids) and pa.payer_code_hmac = v_obs.code_hmac;
    end if;
    if coalesce(cardinality(v_ids), 0) <> 1 then return false; end if;
  else
    v_ids := array[p_expected_attempt_id];
  end if;

  if p_expected_attempt_id is not null and v_ids[1] <> p_expected_attempt_id then return false; end if;

  select o.* into v_order from public.orders o join public.payment_attempts pa on pa.order_id = o.id
  where pa.id = v_ids[1] and o.status = 'pending_payment' and o.restaurant_id = v_obs.restaurant_id
  for update of o skip locked;
  if not found then return false; end if;

  select pa.* into v_attempt from public.payment_attempts pa
  where pa.id = v_ids[1] and pa.order_id = v_order.id and pa.status = 'pending'
    and pa.provider = 'wallet_observer' and pa.observer_route_id = v_obs.observer_route_id
    and pa.observer_route_version = v_obs.observer_route_version and pa.method::text = v_obs.provider
    and pa.amount_cents = v_obs.amount_cents
    and v_obs.observed_at >= pa.created_at
    and (p_manual or (v_obs.observed_at <= pa.expires_at and pa.expires_at > now()))
  for update skip locked;
  if not found then return false; end if;

  -- Ante posibles reemisiones con otro ID de Android, los casos dudosos pasan a Caja.
  if not p_manual and exists (
    select 1 from private.wallet_observer_settlements s
    join public.wallet_observations previous on previous.id = s.observation_id
    where s.route_id = v_obs.observer_route_id
      and previous.amount_cents = v_obs.amount_cents
      and previous.observed_at between v_obs.observed_at - interval '15 minutes' and v_obs.observed_at + interval '15 minutes'
      and private.normalize_person_name(previous.sender_name) = v_payer
      and (v_obs.code_hmac is null or previous.code_hmac is null or previous.code_hmac = v_obs.code_hmac)
  ) then return false; end if;

  insert into private.wallet_observer_settlements (observation_id, payment_attempt_id, route_id, event_id)
  values (v_obs.id, v_attempt.id, v_obs.observer_route_id, v_obs.event_id)
  on conflict do nothing returning observation_id into v_saved;
  if v_saved is null then return false; end if;

  perform set_config('suya.operator_cashier_verification', '1', true);
  update public.payment_attempts
  set status = 'authorized', observed_wallet_observation_id = v_obs.id,
      provider_reference = 'observer_push:' || v_obs.id::text, updated_at = now(), failure_code = null
  where id = v_attempt.id;
  perform set_config('suya.operator_cashier_verification', '0', true);

  update public.wallet_observations set verification_status = 'verified' where id = v_obs.id;
  if p_manual then
    perform private.audit_observer_routing(v_obs.restaurant_id, 'UPDATE',
      jsonb_build_object('observation_id', v_obs.id, 'payment_attempt_id', v_attempt.id, 'change', 'cashier_verified'));
  end if;
  return true;
end;
$$;

create function private.auto_settle_routed_wallet_observation()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.observer_route_id is not null then
    perform private.settle_routed_wallet_observation(new.id);
  end if;
  return new;
end;
$$;

create trigger wallet_observation_reconcile_route
after insert or update of code_hmac, sender_name on public.wallet_observations
for each row execute function private.auto_settle_routed_wallet_observation();

create function private.retry_routed_wallet_attempt(p_attempt_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_observation_id uuid;
begin
  for v_observation_id in
    select o.id from public.wallet_observations o
    join public.payment_attempts pa on pa.observer_route_id = o.observer_route_id
      and pa.observer_route_version = o.observer_route_version
    where pa.id = p_attempt_id and pa.status = 'pending' and pa.expires_at > now()
      and o.amount_cents = pa.amount_cents and o.currency = 'PEN'
      and o.observed_at between greatest(pa.created_at, now() - interval '15 minutes') and pa.expires_at
      and o.verification_status in ('unverified', 'under_review')
    order by o.observed_at desc limit 20
  loop
    if private.settle_routed_wallet_observation(v_observation_id, p_attempt_id) then return true; end if;
  end loop;
  return false;
end;
$$;

create function private.reconcile_routed_wallet_claim()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.retry_routed_wallet_attempt(new.id);
  return new;
end;
$$;

create trigger payment_attempt_reconcile_routed_claim
after update of payer_code_hmac, payer_display_name, payment_declared_at on public.payment_attempts
for each row
when (new.observer_route_id is not null and new.status = 'pending')
execute function private.reconcile_routed_wallet_claim();

create function public.retry_routed_wallet_payment(p_order_id uuid, p_guest_access_token text default null)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_attempt_id uuid;
begin
  perform private.require_payment_actor(p_order_id, p_guest_access_token);
  select id into v_attempt_id from public.payment_attempts
  where order_id = p_order_id and status = 'pending' and observer_route_id is not null;
  if not found then return false; end if;
  return private.retry_routed_wallet_attempt(v_attempt_id);
end;
$$;

revoke all on function private.retry_routed_wallet_attempt(uuid), private.reconcile_routed_wallet_claim()
  from public, anon, authenticated;

create function public.verify_routed_wallet_payment(p_observation_id uuid, p_payment_attempt_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_restaurant uuid;
begin
  select restaurant_id into v_restaurant from public.wallet_observations where id = p_observation_id;
  perform private.require_wallet_route_admin(v_restaurant);
  return private.settle_routed_wallet_observation(p_observation_id, p_payment_attempt_id, true);
end;
$$;

revoke all on function private.bind_routed_wallet_observation(),
  private.settle_routed_wallet_observation(uuid, uuid, boolean), private.auto_settle_routed_wallet_observation()
  from public, anon, authenticated;
revoke all on function public.retry_routed_wallet_payment(uuid, text),
  public.verify_routed_wallet_payment(uuid, uuid) from public, anon, authenticated;
grant execute on function public.retry_routed_wallet_payment(uuid, text) to anon, authenticated;
grant execute on function public.verify_routed_wallet_payment(uuid, uuid) to authenticated;

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
    and pa.provider = 'wallet_observer' and pa.status = 'pending'
    and pa.method::text = wo.provider
    and round(pa.amount * 100) = wo.amount_cents and pa.created_at <= wo.observed_at
    and (
      (o.status = 'pending_payment' and wo.observer_route_id is not null and pa.observer_route_id = wo.observer_route_id
        and pa.observer_route_version = wo.observer_route_version)
      or (o.status not in ('cancelled', 'delivered') and wo.observer_route_id is null
        and pa.observer_route_id is null and pa.receiver_account_id is not distinct from wo.receiver_account_id
        and pa.expires_at >= wo.observed_at
        and ((pa.payer_code_digest is not null and wo.code_fingerprint is not null and pa.payer_code_digest = wo.code_fingerprint)
          or ((pa.payer_code_digest is null or wo.code_fingerprint is null) and pa.payer_code_last4 = wo.code_last4)))
    )
  order by abs(extract(epoch from (wo.observed_at - pa.created_at))), pa.created_at desc;
end;
$$;

-- P-02: reuse protection must compare the strongest available identity.
-- Last-four digits are only a fallback when no full fingerprint/HMAC exists;
-- different payments sharing a suffix must remain independently reviewable.

create or replace function private.prevent_wallet_evidence_reuse()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_observation public.wallet_observations%rowtype;
  evidence_key text;
begin
  if new.status <> 'authorized' or new.observed_wallet_observation_id is null then
    return new;
  end if;

  select * into current_observation
  from public.wallet_observations
  where id = new.observed_wallet_observation_id;
  if new.observer_route_id is not null then
    if not exists (
      select 1 from private.wallet_observer_settlements s
      where s.observation_id = new.observed_wallet_observation_id
        and s.payment_attempt_id = new.id and s.route_id = new.observer_route_id
    ) then raise exception 'routed wallet evidence is not reserved for this attempt'; end if;
    return new;
  end if;
  if not found or current_observation.code_last4 is null then
    return new;
  end if;

  evidence_key := coalesce(
    current_observation.code_hmac,
    current_observation.code_hmac_context,
    current_observation.code_fingerprint,
    current_observation.code_last4
  );
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    concat_ws('|',
      current_observation.restaurant_id::text,
      coalesce(current_observation.receiver_account_id::text, ''),
      current_observation.provider,
      current_observation.currency,
      current_observation.amount_cents::text,
      evidence_key
    ),
    0
  ));

  if exists (
    select 1
    from public.payment_attempts previous_attempt
    join public.wallet_observations previous_observation
      on previous_observation.id = previous_attempt.observed_wallet_observation_id
    where previous_attempt.id <> new.id
      and previous_attempt.status = 'authorized'
      and previous_attempt.observer_route_id is null
      and previous_observation.verification_status = 'verified'
      and previous_observation.restaurant_id = current_observation.restaurant_id
      and previous_observation.receiver_account_id is not distinct from current_observation.receiver_account_id
      and previous_observation.provider = current_observation.provider
      and previous_observation.currency = current_observation.currency
      and previous_observation.amount_cents = current_observation.amount_cents
      and previous_observation.observed_at between current_observation.observed_at - interval '7 days'
        and current_observation.observed_at + interval '7 days'
      and (
        (
          previous_observation.code_hmac_context is not null
          and current_observation.code_hmac_context is not null
          and previous_observation.code_hmac_context = current_observation.code_hmac_context
        )
        or (
          (previous_observation.code_hmac_context is null or current_observation.code_hmac_context is null)
          and previous_observation.code_hmac is not null
          and current_observation.code_hmac is not null
          and previous_observation.code_hmac = current_observation.code_hmac
        )
        or (
          (previous_observation.code_hmac_context is null or current_observation.code_hmac_context is null)
          and (previous_observation.code_hmac is null or current_observation.code_hmac is null)
          and (
            (
              previous_observation.code_fingerprint is not null
              and current_observation.code_fingerprint is not null
              and previous_observation.code_fingerprint = current_observation.code_fingerprint
            )
            or (
              (previous_observation.code_fingerprint is null or current_observation.code_fingerprint is null)
              and previous_observation.code_last4 = current_observation.code_last4
            )
          )
        )
      )
  ) then
    raise exception 'wallet evidence already consumed; review duplicate';
  end if;

  return new;
end;
$$;

create function private.reset_wallet_observer_health()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.token_hash is distinct from old.token_hash or new.active is distinct from old.active then
    new.heartbeat_at := null;
    new.listener_ready := false;
    new.ready_wallets := '{}';
    new.pending_observations := 0;
  end if;
  return new;
end;
$$;
revoke all on function private.reset_wallet_observer_health() from public, anon, authenticated;
create trigger wallet_observer_reset_health
before update of token_hash, active on public.wallet_observer_devices
for each row execute function private.reset_wallet_observer_health();
