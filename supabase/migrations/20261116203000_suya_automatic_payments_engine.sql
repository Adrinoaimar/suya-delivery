-- =============================================================================
-- SUYA DELIVERY — MOTOR DESACOPLADO DE PAGOS AUTOMÁTICOS Y AUTOCLOUD QR ESTÁTICO
-- =============================================================================
-- 1. Almacena importes exactos en céntimos (amount_cents), monto único de
--    conciliación AutoCloud (unique_conciliation_amount_cents) y moneda PEN.
-- 2. Bloquea que indicios no verificados (notificaciones Android o capturas)
--    marquen automáticamente un pago como autorizado sin verificación criptográfica.
-- 3. Soporta múltiples proveedores (static_qr AutoCloud 0%, mercado_pago, taypi_qr,
--    culqi, izipay) con credenciales secretas cifradas en private.payment_gateway_secrets.
-- 4. Deduplica eventos de webhook/correo DKIM, previene reutilización de transacciones,
--    gestiona expiración, pagos tardíos, pedidos cancelados y excepciones de caja,
--    y ejecuta la confirmación atómica de pago + pedido.

-- 1. Ampliar columnas de integridad y AutoCloud en public.payment_attempts
alter table public.payment_attempts
  add column if not exists gateway_config_id uuid,
  add column if not exists amount_cents bigint,
  add column if not exists unique_conciliation_amount_cents bigint,
  add column if not exists synthesized_qr_payload text
    check (synthesized_qr_payload is null or length(trim(synthesized_qr_payload)) between 12 and 4000),
  add column if not exists static_wallet_network text
    check (static_wallet_network is null or static_wallet_network in ('yape', 'plin', 'lemon', 'izipayya')),
  add column if not exists verification_mode text not null default 'assisted_manual'
    check (verification_mode in ('automatic_cloud', 'assisted_manual')),
  add column if not exists external_transaction_id text
    check (external_transaction_id is null or length(trim(external_transaction_id)) between 2 and 160),
  add column if not exists webhook_verified_at timestamptz,
  add column if not exists attempt_number integer not null default 1
    check (attempt_number >= 1);

update public.payment_attempts
set
  unique_conciliation_amount_cents = coalesce(unique_conciliation_amount_cents, round(amount * 100)::bigint)
where unique_conciliation_amount_cents is null;

alter table public.payment_attempts
  alter column amount_cents set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'payment_attempts_amount_cents_exact_check'
  ) then
    alter table public.payment_attempts
      add constraint payment_attempts_amount_cents_exact_check
      check (amount_cents > 0 and amount_cents = round(amount * 100)::bigint);
  end if;
end
$$;

create or replace function private.sync_payment_attempt_amount_cents()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.unique_conciliation_amount_cents is null then
    new.unique_conciliation_amount_cents := round(new.amount * 100)::bigint;
  end if;
  if new.provider in ('mercado_pago', 'taypi_qr', 'culqi', 'izipay', 'static_qr') then
    new.verification_mode := 'automatic_cloud';
  else
    new.verification_mode := 'assisted_manual';
  end if;
  return new;
end;
$$;

revoke all on function private.sync_payment_attempt_amount_cents() from public, anon, authenticated;
drop trigger if exists payment_attempts_sync_amount_cents on public.payment_attempts;
create trigger payment_attempts_sync_amount_cents
before insert or update of amount, provider on public.payment_attempts
for each row execute function private.sync_payment_attempt_amount_cents();

-- Índice único estricto: ninguna transacción externa puede reutilizarse en 2 intentos/pedidos
create unique index if not exists payment_attempts_provider_external_tx_uidx
  on public.payment_attempts (provider, external_transaction_id)
  where external_transaction_id is not null;

-- Índice único parcial por configuración (y global por red cuando opera AutoCloud) para que dos pedidos simultáneos en static_qr nunca colisionen
create unique index if not exists payment_attempts_static_autocloud_unique_amount_uidx
  on public.payment_attempts (gateway_config_id, unique_conciliation_amount_cents)
  where status = 'pending'
    and provider = 'static_qr'
    and gateway_config_id is not null
    and unique_conciliation_amount_cents is not null;

create unique index if not exists payment_attempts_static_autocloud_network_unique_uidx
  on public.payment_attempts (coalesce(static_wallet_network, 'yape'), unique_conciliation_amount_cents)
  where status = 'pending'
    and provider = 'static_qr'
    and verification_mode = 'automatic_cloud'
    and unique_conciliation_amount_cents is not null;

-- 2. Guarda de seguridad: prohibir que un cliente o notificación Android auto-autorice un pago
--    En static_qr solo se permite autorizar cuando proviene de settle_verified_gateway_payment
--    (con webhook_verified_at y external_transaction_id verificados por DKIM) o de Caja.
create or replace function private.require_trusted_payment_authorization()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.status = 'authorized' and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    if new.provider_reference like 'wallet_observation:%' then
      raise exception 'wallet notifications are unverified evidence; bank confirmation required';
    end if;
    if new.provider = 'wallet_observer'
      and current_setting('suya.operator_cashier_verification', true) is distinct from '1' then
      raise exception 'unverified wallet notifications or static QR scans cannot auto-authorize payments; verified provider confirmation is required';
    end if;
    if new.provider = 'static_qr'
      and current_setting('suya.operator_cashier_verification', true) is distinct from '1'
      and (new.webhook_verified_at is null or new.external_transaction_id is null) then
      raise exception 'unverified wallet notifications or static QR scans cannot auto-authorize payments; verified provider confirmation is required';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.require_trusted_payment_authorization() from public, anon, authenticated;
drop trigger if exists payment_attempts_trusted_authorization_guard on public.payment_attempts;
create trigger payment_attempts_trusted_authorization_guard
before insert or update of status on public.payment_attempts
for each row execute function private.require_trusted_payment_authorization();

-- 3. Tablas de Configuración de Cobros y Secretos Cifrados
create table if not exists public.payment_gateway_configs (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  provider text not null check (provider in ('mercado_pago', 'taypi_qr', 'culqi', 'izipay', 'static_qr')),
  environment text not null default 'sandbox' check (environment in ('sandbox', 'production')),
  verification_mode text not null default 'automatic_cloud'
    check (verification_mode in ('automatic_cloud', 'assisted_manual')),
  account_label text not null check (length(trim(account_label)) between 2 and 120),
  public_key text check (
    public_key is null or (
      length(trim(public_key)) between 4 and 300
      and public_key !~* '^sk_(test|live)_'
    )
  ),
  merchant_code text check (merchant_code is null or length(trim(merchant_code)) between 2 and 120),
  qr_payload text check (qr_payload is null or length(trim(qr_payload)) between 12 and 4000),
  active boolean not null default false,
  connection_status text not null default 'untested'
    check (connection_status in ('untested', 'connected', 'failed')),
  last_verified_at timestamptz,
  last_safe_test_passed boolean not null default false,
  last_safe_test_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, provider)
);

alter table public.payment_gateway_configs enable row level security;
revoke all on public.payment_gateway_configs from public, anon, authenticated;

create table if not exists private.payment_gateway_secrets (
  config_id uuid primary key references public.payment_gateway_configs(id) on delete cascade,
  secret_key_ciphertext bytea,
  secret_key_last4 text,
  webhook_secret_ciphertext bytea,
  webhook_secret_last4 text,
  updated_at timestamptz not null default now()
);

revoke all on private.payment_gateway_secrets from public, anon, authenticated;

create or replace function private.enforce_gateway_config_integrity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_has_secret boolean := false;
  v_has_webhook boolean := false;
begin
  select
    s.secret_key_ciphertext is not null,
    s.webhook_secret_ciphertext is not null
  into v_has_secret, v_has_webhook
  from private.payment_gateway_secrets s
  where s.config_id = new.id;

  if new.provider = 'static_qr' then
    -- Si tiene configurado el secreto del puente AutoCloud (Cloudflare Email Worker / Gmail API DKIM),
    -- opera en modo 100% automático en la nube; si no, opera en modo asistido manual.
    new.verification_mode := case when coalesce(v_has_webhook, false) then 'automatic_cloud' else 'assisted_manual' end;
    if new.active and (new.qr_payload is null or length(trim(new.qr_payload)) < 12) then
      raise exception 'static QR cannot be activated without a valid QR payload';
    end if;
  else
    new.verification_mode := 'automatic_cloud';
    if new.active then
      if new.public_key is null or length(trim(new.public_key)) < 4 then
        raise exception 'automatic gateway requires a valid public key before activation';
      end if;
      if new.connection_status <> 'connected' then
        raise exception 'automatic gateway connection must be verified before activation';
      end if;
      if not coalesce(v_has_secret, false) or not coalesce(v_has_webhook, false) then
        raise exception 'automatic gateway requires secret key and webhook secret before activation';
      end if;
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.enforce_gateway_config_integrity() from public, anon, authenticated;
drop trigger if exists payment_gateway_configs_integrity_guard on public.payment_gateway_configs;
create trigger payment_gateway_configs_integrity_guard
before insert or update on public.payment_gateway_configs
for each row execute function private.enforce_gateway_config_integrity();

-- 4. Tablas de Eventos de Webhook / AutoCloud DKIM y Excepciones de Conciliación
create table if not exists public.payment_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('mercado_pago', 'taypi_qr', 'culqi', 'izipay', 'static_qr')),
  event_id text not null check (length(trim(event_id)) between 2 and 180),
  event_type text not null default 'payment.updated',
  external_transaction_id text,
  payment_attempt_id uuid references public.payment_attempts(id) on delete set null,
  order_id uuid references public.orders(id) on delete set null,
  restaurant_id uuid references public.restaurants(id) on delete set null,
  signature_verified boolean not null default false,
  api_verified boolean not null default false,
  amount_cents bigint,
  currency text not null default 'PEN',
  processing_status text not null check (
    processing_status in (
      'processed',
      'duplicate',
      'ignored',
      'unreconciled',
      'failed',
      'rejected_signature',
      'amount_mismatch',
      'late_payment'
    )
  ),
  failure_reason text,
  raw_payload jsonb,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (provider, event_id)
);

alter table public.payment_webhook_events enable row level security;
revoke all on public.payment_webhook_events from public, anon, authenticated;

create table if not exists public.payment_reconciliation_exceptions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  payment_attempt_id uuid references public.payment_attempts(id) on delete set null,
  webhook_event_id uuid references public.payment_webhook_events(id) on delete set null,
  provider text not null,
  external_transaction_id text,
  expected_amount_cents bigint,
  received_amount_cents bigint,
  exception_type text not null check (
    exception_type in (
      'amount_mismatch',
      'late_payment',
      'order_cancelled',
      'orphan_transaction',
      'duplicate_payment',
      'transaction_reused',
      'refund_required'
    )
  ),
  resolution_status text not null default 'open' check (
    resolution_status in ('open', 'refund_pending', 'refunded', 'resolved_dismissed')
  ),
  resolution_note text,
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.payment_reconciliation_exceptions enable row level security;
revoke all on public.payment_reconciliation_exceptions from public, anon, authenticated;

-- 5. RPCs Administrativas para Configuración de Cobros — SUYA Delivery
create or replace function public.list_payment_gateway_configs(p_restaurant_id uuid)
returns table (
  id uuid,
  restaurant_id uuid,
  provider text,
  environment text,
  active boolean,
  verification_mode text,
  account_label text,
  public_key text,
  merchant_code text,
  qr_payload text,
  has_secret_key boolean,
  secret_key_last4 text,
  has_webhook_secret boolean,
  webhook_secret_last4 text,
  connection_status text,
  last_verified_at timestamptz,
  last_safe_test_passed boolean,
  last_safe_test_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (
    private.is_platform_admin() or private.has_restaurant_role(
      p_restaurant_id, array['owner', 'manager']::public.restaurant_role[]
    )
  ) then
    raise exception 'not authorized';
  end if;

  return query
  select
    c.id,
    c.restaurant_id,
    c.provider,
    c.environment,
    c.active,
    c.verification_mode,
    c.account_label,
    c.public_key,
    c.merchant_code,
    c.qr_payload,
    (s.secret_key_ciphertext is not null) as has_secret_key,
    s.secret_key_last4,
    (s.webhook_secret_ciphertext is not null) as has_webhook_secret,
    s.webhook_secret_last4,
    c.connection_status,
    c.last_verified_at,
    c.last_safe_test_passed,
    c.last_safe_test_at,
    c.updated_at
  from public.payment_gateway_configs c
  left join private.payment_gateway_secrets s on s.config_id = c.id
  where c.restaurant_id = p_restaurant_id
  order by c.provider;
end;
$$;

create or replace function public.upsert_payment_gateway_config(
  p_restaurant_id uuid,
  p_provider text,
  p_environment text,
  p_account_label text,
  p_public_key text default null,
  p_secret_key text default null,
  p_webhook_secret text default null,
  p_merchant_code text default null,
  p_qr_payload text default null,
  p_active boolean default false
)
returns table (
  id uuid,
  restaurant_id uuid,
  provider text,
  environment text,
  active boolean,
  verification_mode text,
  account_label text,
  public_key text,
  merchant_code text,
  qr_payload text,
  has_secret_key boolean,
  secret_key_last4 text,
  has_webhook_secret boolean,
  webhook_secret_last4 text,
  connection_status text,
  last_verified_at timestamptz,
  last_safe_test_passed boolean,
  last_safe_test_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_provider text := lower(trim(coalesce(p_provider, '')));
  v_env text := lower(trim(coalesce(p_environment, 'sandbox')));
  v_label text := nullif(left(regexp_replace(trim(coalesce(p_account_label, '')), '\s+', ' ', 'g'), 120), '');
  v_pub text := nullif(trim(coalesce(p_public_key, '')), '');
  v_sec text := nullif(trim(coalesce(p_secret_key, '')), '');
  v_wh text := nullif(trim(coalesce(p_webhook_secret, '')), '');
  v_merch text := nullif(trim(coalesce(p_merchant_code, '')), '');
  v_qr text := nullif(trim(coalesce(p_qr_payload, '')), '');
  v_enc_key text;
  v_config_id uuid;
begin
  if not (
    private.is_platform_admin() or private.has_restaurant_role(
      p_restaurant_id, array['owner', 'manager']::public.restaurant_role[]
    )
  ) then
    raise exception 'not authorized';
  end if;

  if v_provider not in ('mercado_pago', 'taypi_qr', 'culqi', 'izipay', 'static_qr') or v_label is null then
    raise exception 'invalid payment gateway configuration';
  end if;
  if v_env not in ('sandbox', 'production') then
    raise exception 'invalid environment';
  end if;
  if v_pub is not null and v_pub ~* '^sk_(test|live)_' then
    raise exception 'secret key must never be stored in public_key';
  end if;

  select encode(hmac_key, 'hex') into v_enc_key
  from private.payment_claim_secrets
  where id = true;
  if v_enc_key is null then
    raise exception 'payment encryption key is not configured';
  end if;

  insert into public.payment_gateway_configs as c (
    restaurant_id, provider, environment, verification_mode, account_label,
    public_key, merchant_code, qr_payload, active
  ) values (
    p_restaurant_id,
    v_provider,
    v_env,
    'automatic_cloud',
    v_label,
    v_pub,
    v_merch,
    v_qr,
    false
  )
  on conflict (restaurant_id, provider) do update set
    environment = excluded.environment,
    account_label = excluded.account_label,
    public_key = coalesce(excluded.public_key, c.public_key),
    merchant_code = coalesce(excluded.merchant_code, c.merchant_code),
    qr_payload = excluded.qr_payload,
    updated_at = now()
  returning c.id into v_config_id;

  insert into private.payment_gateway_secrets as s (
    config_id,
    secret_key_ciphertext,
    secret_key_last4,
    webhook_secret_ciphertext,
    webhook_secret_last4,
    updated_at
  ) values (
    v_config_id,
    case when v_sec is null then null else extensions.pgp_sym_encrypt(v_sec, v_enc_key) end,
    case when v_sec is null then null else right(v_sec, 4) end,
    case when v_wh is null then null else extensions.pgp_sym_encrypt(v_wh, v_enc_key) end,
    case when v_wh is null then null else right(v_wh, 4) end,
    now()
  )
  on conflict (config_id) do update set
    secret_key_ciphertext = coalesce(excluded.secret_key_ciphertext, s.secret_key_ciphertext),
    secret_key_last4 = coalesce(excluded.secret_key_last4, s.secret_key_last4),
    webhook_secret_ciphertext = coalesce(excluded.webhook_secret_ciphertext, s.webhook_secret_ciphertext),
    webhook_secret_last4 = coalesce(excluded.webhook_secret_last4, s.webhook_secret_last4),
    updated_at = now();

  if coalesce(p_active, false) then
    update public.payment_gateway_configs
    set active = false, updated_at = now()
    where public.payment_gateway_configs.restaurant_id = p_restaurant_id
      and public.payment_gateway_configs.id <> v_config_id
      and public.payment_gateway_configs.active = true;

    update public.payment_gateway_configs
    set
      active = true,
      connection_status = case
        when v_provider = 'static_qr' and qr_payload is not null and length(trim(qr_payload)) >= 12
          then 'connected'
        else connection_status
      end,
      last_verified_at = case
        when v_provider = 'static_qr' then coalesce(last_verified_at, now())
        else last_verified_at
      end,
      updated_at = now()
    where public.payment_gateway_configs.id = v_config_id;
  else
    update public.payment_gateway_configs
    set
      active = false,
      connection_status = case
        when v_provider = 'static_qr' and qr_payload is not null and length(trim(qr_payload)) >= 12
          then 'connected'
        else connection_status
      end,
      updated_at = now()
    where public.payment_gateway_configs.id = v_config_id;
  end if;

  return query
  select * from public.list_payment_gateway_configs(p_restaurant_id) l
  where l.id = v_config_id;
end;
$$;

create or replace function public.record_payment_gateway_test_result(
  p_restaurant_id uuid,
  p_provider text,
  p_connection_ok boolean,
  p_safe_test_ok boolean default false
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (
    private.is_platform_admin() or private.has_restaurant_role(
      p_restaurant_id, array['owner', 'manager']::public.restaurant_role[]
    )
  ) then
    raise exception 'not authorized';
  end if;

  update public.payment_gateway_configs
  set
    connection_status = case when p_connection_ok then 'connected' else 'failed' end,
    last_verified_at = case when p_connection_ok then now() else last_verified_at end,
    last_safe_test_passed = case when p_safe_test_ok then true else last_safe_test_passed end,
    last_safe_test_at = case when p_safe_test_ok then now() else last_safe_test_at end,
    updated_at = now()
  where restaurant_id = p_restaurant_id
    and provider = lower(trim(coalesce(p_provider, '')));

  return found;
end;
$$;

create or replace function public.list_payment_reconciliation_exceptions(p_restaurant_id uuid)
returns table (
  id uuid,
  restaurant_id uuid,
  order_id uuid,
  payment_attempt_id uuid,
  provider text,
  external_transaction_id text,
  expected_amount_cents bigint,
  received_amount_cents bigint,
  exception_type text,
  resolution_status text,
  resolution_note text,
  created_at timestamptz,
  resolved_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (
    private.is_platform_admin() or private.has_restaurant_role(
      p_restaurant_id, array['owner', 'manager']::public.restaurant_role[]
    )
  ) then
    raise exception 'not authorized';
  end if;

  return query
  select
    e.id,
    e.restaurant_id,
    e.order_id,
    e.payment_attempt_id,
    e.provider,
    e.external_transaction_id,
    e.expected_amount_cents,
    e.received_amount_cents,
    e.exception_type,
    e.resolution_status,
    e.resolution_note,
    e.created_at,
    e.resolved_at
  from public.payment_reconciliation_exceptions e
  where e.restaurant_id = p_restaurant_id
  order by e.created_at desc
  limit 100;
end;
$$;

create or replace function public.resolve_payment_reconciliation_exception(
  p_exception_id uuid,
  p_resolution_status text,
  p_resolution_note text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_exc public.payment_reconciliation_exceptions%rowtype;
  v_status text := lower(trim(coalesce(p_resolution_status, '')));
  v_note text := nullif(left(trim(coalesce(p_resolution_note, '')), 500), '');
begin
  select * into v_exc
  from public.payment_reconciliation_exceptions
  where id = p_exception_id
  for update;
  if not found then raise exception 'exception not found'; end if;

  if not (
    private.is_platform_admin() or private.has_restaurant_role(
      v_exc.restaurant_id, array['owner', 'manager']::public.restaurant_role[]
    )
  ) then
    raise exception 'not authorized';
  end if;

  if v_status not in ('refund_pending', 'refunded', 'resolved_dismissed') or v_note is null then
    raise exception 'valid resolution status and audit note are required';
  end if;

  update public.payment_reconciliation_exceptions
  set
    resolution_status = v_status,
    resolution_note = v_note,
    resolved_by = (select auth.uid()),
    resolved_at = now()
  where id = v_exc.id;

  return true;
end;
$$;

-- 6. Localizador estricto de intento pendiente para AutoCloud QR Estático (prohíbe ambigüedades y cruces de proveedor/red/restaurante)
drop function if exists public.find_pending_static_qr_attempt_for_autocloud(uuid, text, bigint);
drop function if exists public.find_pending_static_qr_attempt_for_autocloud(uuid[], text, bigint, text);

create or replace function public.find_pending_static_qr_attempt_for_autocloud(
  p_restaurant_ids uuid[] default null,
  p_checkout_reference text default null,
  p_amount_cents bigint default null,
  p_wallet_network text default null
)
returns table (
  payment_attempt_id uuid,
  order_id uuid,
  expected_amount_cents bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ref text := nullif(upper(trim(coalesce(p_checkout_reference, ''))), '');
  v_network text := nullif(lower(trim(coalesce(p_wallet_network, ''))), '');
  v_match_count integer := 0;
begin
  if current_user not in ('service_role', 'postgres') then
    raise exception 'only backend service_role can query autocloud candidates';
  end if;

  if v_ref is not null then
    select count(*) into v_match_count
    from public.payment_attempts pa
    join public.orders o on o.id = pa.order_id
    join public.payment_gateway_configs c on c.id = pa.gateway_config_id
    where pa.provider = 'static_qr'
      and pa.verification_mode = 'automatic_cloud'
      and c.provider = 'static_qr'
      and c.active = true
      and pa.checkout_reference = v_ref
      and (p_restaurant_ids is null or o.restaurant_id = any(p_restaurant_ids))
      and (v_network is null or pa.static_wallet_network is null or pa.static_wallet_network = v_network);

    if v_match_count = 1 then
      return query
      select
        pa.id,
        pa.order_id,
        coalesce(pa.unique_conciliation_amount_cents, pa.amount_cents)
      from public.payment_attempts pa
      join public.orders o on o.id = pa.order_id
      join public.payment_gateway_configs c on c.id = pa.gateway_config_id
      where pa.provider = 'static_qr'
        and pa.verification_mode = 'automatic_cloud'
        and c.provider = 'static_qr'
        and c.active = true
        and pa.checkout_reference = v_ref
        and (p_restaurant_ids is null or o.restaurant_id = any(p_restaurant_ids))
        and (v_network is null or pa.static_wallet_network is null or pa.static_wallet_network = v_network)
      limit 1;
      return;
    end if;
    return;
  end if;

  if p_amount_cents is not null then
    select count(*) into v_match_count
    from public.payment_attempts pa
    join public.orders o on o.id = pa.order_id
    join public.payment_gateway_configs c on c.id = pa.gateway_config_id
    where pa.provider = 'static_qr'
      and pa.verification_mode = 'automatic_cloud'
      and pa.status = 'pending'
      and o.status <> 'cancelled'
      and c.provider = 'static_qr'
      and c.active = true
      and (p_restaurant_ids is null or o.restaurant_id = any(p_restaurant_ids))
      and (v_network is null or pa.static_wallet_network is null or pa.static_wallet_network = v_network)
      and coalesce(pa.unique_conciliation_amount_cents, pa.amount_cents) = p_amount_cents;

    if v_match_count = 1 then
      return query
      select
        pa.id,
        pa.order_id,
        coalesce(pa.unique_conciliation_amount_cents, pa.amount_cents)
      from public.payment_attempts pa
      join public.orders o on o.id = pa.order_id
      join public.payment_gateway_configs c on c.id = pa.gateway_config_id
      where pa.provider = 'static_qr'
        and pa.verification_mode = 'automatic_cloud'
        and pa.status = 'pending'
        and o.status <> 'cancelled'
        and c.provider = 'static_qr'
        and c.active = true
        and (p_restaurant_ids is null or o.restaurant_id = any(p_restaurant_ids))
        and (v_network is null or pa.static_wallet_network is null or pa.static_wallet_network = v_network)
        and coalesce(pa.unique_conciliation_amount_cents, pa.amount_cents) = p_amount_cents
      limit 1;
    end if;
  end if;
end;
$$;

-- 7. Liquidación Server-to-Server Atómica (incluye static_qr verificado por DKIM)
create or replace function public.settle_verified_gateway_payment(
  p_provider text,
  p_event_id text,
  p_external_transaction_id text,
  p_payment_attempt_id uuid,
  p_amount_cents bigint,
  p_currency text,
  p_provider_status text,
  p_raw_payload jsonb default '{}'::jsonb
)
returns table (
  settlement_status text,
  order_id uuid,
  order_status public.order_status,
  payment_attempt_id uuid,
  exception_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_provider text := lower(trim(coalesce(p_provider, '')));
  v_event_id text := trim(coalesce(p_event_id, ''));
  v_ext_tx text := trim(coalesce(p_external_transaction_id, ''));
  v_currency text := upper(trim(coalesce(p_currency, 'PEN')));
  v_prov_status text := lower(trim(coalesce(p_provider_status, '')));
  v_attempt public.payment_attempts%rowtype;
  v_order public.orders%rowtype;
  v_existing_wh public.payment_webhook_events%rowtype;
  v_wh_id uuid;
  v_exc_id uuid;
  v_other_attempt_id uuid;
  v_expected_cents bigint;
begin
  if current_user not in ('service_role', 'postgres') then
    raise exception 'only backend service_role can settle verified gateway payments';
  end if;

  if v_provider not in ('mercado_pago', 'taypi_qr', 'culqi', 'izipay', 'static_qr')
    or v_event_id = '' or v_ext_tx = '' or p_payment_attempt_id is null then
    raise exception 'invalid verified payment parameters';
  end if;

  -- 1. Deduplicación por (provider, event_id)
  select * into v_existing_wh
  from public.payment_webhook_events
  where provider = v_provider and event_id = v_event_id;
  if found and v_existing_wh.processing_status = 'processed' then
    select * into v_attempt from public.payment_attempts where id = p_payment_attempt_id;
    select * into v_order from public.orders where id = v_attempt.order_id;
    return query select 'duplicate'::text, v_order.id, v_order.status, v_attempt.id, null::uuid;
    return;
  end if;

  -- 2. Bloquear el intento y el pedido en orden determinístico
  select * into v_attempt
  from public.payment_attempts
  where id = p_payment_attempt_id
  for update;
  if not found then
    raise exception 'payment attempt not found';
  end if;

  select * into v_order
  from public.orders
  where id = v_attempt.order_id
  for update;
  if not found then
    raise exception 'order not found';
  end if;

  if v_attempt.provider is distinct from v_provider then
    raise exception 'verified provider does not match payment attempt';
  end if;
  v_expected_cents := coalesce(v_attempt.unique_conciliation_amount_cents, v_attempt.amount_cents);

  -- 3. Protección contra reutilización de external_transaction_id en otro intento/pedido
  select pa.id into v_other_attempt_id
  from public.payment_attempts pa
  where pa.provider = v_provider
    and pa.external_transaction_id = v_ext_tx
    and pa.id <> v_attempt.id
  limit 1;

  if v_other_attempt_id is not null then
    insert into public.payment_reconciliation_exceptions (
      restaurant_id, order_id, payment_attempt_id, provider, external_transaction_id,
      expected_amount_cents, received_amount_cents, exception_type, resolution_status, resolution_note
    ) values (
      v_order.restaurant_id, v_order.id, v_attempt.id, v_provider, v_ext_tx,
      v_expected_cents, p_amount_cents, 'transaction_reused', 'open',
      'Intento de reutilizar transacción externa ya vinculada a otro intento.'
    ) returning id into v_exc_id;

    return query select 'transaction_reused'::text, v_order.id, v_order.status, v_attempt.id, v_exc_id;
    return;
  end if;

  -- 4. Si el intento ya fue autorizado con esta misma transacción, responder de forma idempotente
  if v_attempt.status = 'authorized' and v_attempt.external_transaction_id = v_ext_tx then
    return query select 'duplicate'::text, v_order.id, v_order.status, v_attempt.id, null::uuid;
    return;
  end if;

  -- 5. Si el proveedor reporta fallo o expiración
  if v_prov_status in ('rejected', 'expired', 'failed', 'cancelled') then
    update public.payment_attempts
    set
      status = 'failed',
      failure_code = 'provider_' || v_prov_status,
      external_transaction_id = v_ext_tx,
      updated_at = now()
    where id = v_attempt.id and status = 'pending';

    insert into public.payment_webhook_events (
      provider, event_id, event_type, external_transaction_id, payment_attempt_id,
      order_id, restaurant_id, signature_verified, api_verified, amount_cents,
      currency, processing_status, failure_reason, raw_payload, processed_at
    ) values (
      v_provider, v_event_id, 'payment.' || v_prov_status, v_ext_tx, v_attempt.id,
      v_order.id, v_order.restaurant_id, true, true, p_amount_cents,
      v_currency, 'processed', 'provider_' || v_prov_status, p_raw_payload, now()
    ) on conflict (provider, event_id) do nothing;

    return query select 'provider_rejected'::text, v_order.id, v_order.status, v_attempt.id, null::uuid;
    return;
  end if;

  if v_prov_status <> 'approved' and v_prov_status <> 'paid' then
    return query select 'pending'::text, v_order.id, v_order.status, v_attempt.id, null::uuid;
    return;
  end if;

  -- 6. Validar importe exacto esperado (en céntimos) y moneda PEN
  if v_currency <> 'PEN' or p_amount_cents is distinct from v_expected_cents then
    update public.payment_attempts
    set
      status = 'failed',
      failure_code = 'amount_mismatch',
      external_transaction_id = v_ext_tx,
      updated_at = now()
    where id = v_attempt.id;

    insert into public.payment_webhook_events (
      provider, event_id, event_type, external_transaction_id, payment_attempt_id,
      order_id, restaurant_id, signature_verified, api_verified, amount_cents,
      currency, processing_status, failure_reason, raw_payload, processed_at
    ) values (
      v_provider, v_event_id, 'payment.amount_mismatch', v_ext_tx, v_attempt.id,
      v_order.id, v_order.restaurant_id, true, true, p_amount_cents,
      v_currency, 'amount_mismatch', 'amount_mismatch', p_raw_payload, now()
    ) on conflict (provider, event_id) do nothing
    returning id into v_wh_id;

    insert into public.payment_reconciliation_exceptions (
      restaurant_id, order_id, payment_attempt_id, webhook_event_id, provider,
      external_transaction_id, expected_amount_cents, received_amount_cents,
      exception_type, resolution_status, resolution_note
    ) values (
      v_order.restaurant_id, v_order.id, v_attempt.id, v_wh_id, v_provider,
      v_ext_tx, v_expected_cents, p_amount_cents,
      'amount_mismatch', 'refund_pending',
      'El monto confirmado por el proveedor no coincide con el total del pedido.'
    ) returning id into v_exc_id;

    return query select 'amount_mismatch'::text, v_order.id, v_order.status, v_attempt.id, v_exc_id;
    return;
  end if;

  -- 7. Si el pedido ya estaba cancelado
  if v_order.status = 'cancelled' then
    update public.payment_attempts
    set
      status = 'failed',
      failure_code = 'order_already_cancelled',
      external_transaction_id = v_ext_tx,
      updated_at = now()
    where id = v_attempt.id;

    insert into public.payment_reconciliation_exceptions (
      restaurant_id, order_id, payment_attempt_id, provider, external_transaction_id,
      expected_amount_cents, received_amount_cents, exception_type, resolution_status, resolution_note
    ) values (
      v_order.restaurant_id, v_order.id, v_attempt.id, v_provider, v_ext_tx,
      v_expected_cents, p_amount_cents, 'order_cancelled', 'refund_pending',
      'Abono confirmado recibido para un pedido que ya se encontraba cancelado.'
    ) returning id into v_exc_id;

    return query select 'order_cancelled'::text, v_order.id, v_order.status, v_attempt.id, v_exc_id;
    return;
  end if;

  if v_attempt.expires_at < now() then
    insert into public.payment_reconciliation_exceptions (
      restaurant_id, order_id, payment_attempt_id, provider, external_transaction_id,
      expected_amount_cents, received_amount_cents, exception_type, resolution_status, resolution_note
    ) values (
      v_order.restaurant_id, v_order.id, v_attempt.id, v_provider, v_ext_tx,
      v_expected_cents, p_amount_cents, 'late_payment', 'open',
      'Confirmación de pago recibida después del vencimiento del intento.'
    ) returning id into v_exc_id;

    return query select 'late_payment'::text, v_order.id, v_order.status, v_attempt.id, v_exc_id;
    return;
  end if;

  -- 8. Autorizar intento (el trigger confirm_order_after_payment_authorized confirma el pedido atómicamente)
  update public.payment_attempts
  set
    status = 'authorized',
    provider_reference = v_ext_tx,
    external_transaction_id = v_ext_tx,
    webhook_verified_at = now(),
    failure_code = null,
    updated_at = now()
  where id = v_attempt.id;

  select * into v_order from public.orders where id = v_order.id;

  insert into public.payment_webhook_events (
    provider, event_id, event_type, external_transaction_id, payment_attempt_id,
    order_id, restaurant_id, signature_verified, api_verified, amount_cents,
    currency, processing_status, raw_payload, processed_at
  ) values (
    v_provider, v_event_id, 'payment.approved', v_ext_tx, v_attempt.id,
    v_order.id, v_order.restaurant_id, true, true, p_amount_cents,
    v_currency, 'processed', p_raw_payload, now()
  ) on conflict (provider, event_id) do nothing;

  return query select 'authorized'::text, v_order.id, v_order.status, v_attempt.id, null::uuid;
end;
$$;

-- Permisos explícitos
revoke all on function public.list_payment_gateway_configs(uuid) from public, anon;
grant execute on function public.list_payment_gateway_configs(uuid) to authenticated;

revoke all on function public.upsert_payment_gateway_config(
  uuid, text, text, text, text, text, text, text, text, boolean
) from public, anon;
grant execute on function public.upsert_payment_gateway_config(
  uuid, text, text, text, text, text, text, text, text, boolean
) to authenticated;

revoke all on function public.record_payment_gateway_test_result(uuid, text, boolean, boolean) from public, anon;
grant execute on function public.record_payment_gateway_test_result(uuid, text, boolean, boolean) to authenticated;

revoke all on function public.list_payment_reconciliation_exceptions(uuid) from public, anon;
grant execute on function public.list_payment_reconciliation_exceptions(uuid) to authenticated;

revoke all on function public.resolve_payment_reconciliation_exception(uuid, text, text) from public, anon;
grant execute on function public.resolve_payment_reconciliation_exception(uuid, text, text) to authenticated;

revoke all on function public.find_pending_static_qr_attempt_for_autocloud(uuid[], text, bigint, text) from public, anon, authenticated;
grant execute on function public.find_pending_static_qr_attempt_for_autocloud(uuid[], text, bigint, text) to service_role;

revoke all on function public.settle_verified_gateway_payment(
  text, text, text, uuid, bigint, text, text, jsonb
) from public, anon, authenticated;
grant execute on function public.settle_verified_gateway_payment(
  text, text, text, uuid, bigint, text, text, jsonb
) to service_role;

-- =============================================================================
-- 8. CONEXIÓN REAL END-TO-END: CHECKOUT, RUNTIME DE EDGE FUNCTIONS Y AUTOCLOUD
-- =============================================================================

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'payment_attempts_gateway_config_id_fkey'
  ) then
    alter table public.payment_attempts
      add constraint payment_attempts_gateway_config_id_fkey
      foreign key (gateway_config_id)
      references public.payment_gateway_configs(id)
      on delete set null;
  end if;
end
$$;

-- 8.1. Asignador atómico de céntimo único en SQL para pedidos simultáneos static_qr (aislado por red y bloqueado con advisory lock)
drop function if exists private.allocate_static_qr_conciliation_cents(uuid, bigint);

create or replace function private.allocate_static_qr_conciliation_cents(
  p_gateway_config_id uuid,
  p_base_amount_cents bigint,
  p_wallet_network text default 'yape'
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_offset integer := 0;
  v_candidate bigint;
  v_network text := coalesce(nullif(lower(trim(coalesce(p_wallet_network, ''))), ''), 'yape');
  v_verification_mode text := 'assisted_manual';
begin
  if p_base_amount_cents is null or p_base_amount_cents <= 0 then
    raise exception 'positive amount is required';
  end if;

  select coalesce(c.verification_mode, 'assisted_manual')
  into v_verification_mode
  from public.payment_gateway_configs c
  where c.id = p_gateway_config_id;

  perform pg_advisory_xact_lock(
    hashtext('suya_static_qr_' || v_network),
    (p_base_amount_cents % 2147483647)::integer
  );

  for v_offset in 0..99 loop
    v_candidate := p_base_amount_cents - v_offset;
    exit when v_candidate <= 100;
    if not exists (
      select 1
      from public.payment_attempts pa
      where pa.provider = 'static_qr'
        and pa.status = 'pending'
        and pa.unique_conciliation_amount_cents = v_candidate
        and (
          pa.gateway_config_id = p_gateway_config_id
          or (
            v_verification_mode = 'automatic_cloud'
            and pa.verification_mode = 'automatic_cloud'
            and coalesce(pa.static_wallet_network, 'yape') = v_network
          )
        )
    ) then
      return v_candidate;
    end if;
  end loop;
  raise exception 'all unique conciliation cent slots are temporarily occupied';
end;
$$;

revoke all on function private.allocate_static_qr_conciliation_cents(uuid, bigint, text) from public, anon, authenticated;

-- 8.2. Lectura segura de credenciales descifradas exclusivamente para Edge Functions (service_role)
create or replace function public.get_payment_gateway_runtime_config(
  p_restaurant_id uuid default null,
  p_provider text default null
)
returns table (
  config_id uuid,
  restaurant_id uuid,
  provider text,
  environment text,
  verification_mode text,
  account_label text,
  public_key text,
  secret_key text,
  webhook_secret text,
  merchant_code text,
  qr_payload text,
  active boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_provider text := nullif(lower(trim(coalesce(p_provider, ''))), '');
  v_enc_key text;
begin
  if current_user not in ('service_role', 'postgres') then
    raise exception 'only backend service_role can read decrypted gateway credentials';
  end if;

  select encode(hmac_key, 'hex') into v_enc_key
  from private.payment_claim_secrets
  where id = true;
  if v_enc_key is null then
    raise exception 'payment encryption key is not configured';
  end if;

  return query
  select
    c.id,
    c.restaurant_id,
    c.provider,
    c.environment,
    c.verification_mode,
    c.account_label,
    c.public_key,
    case
      when s.secret_key_ciphertext is null then null
      else extensions.pgp_sym_decrypt(s.secret_key_ciphertext, v_enc_key)
    end,
    case
      when s.webhook_secret_ciphertext is null then null
      else extensions.pgp_sym_decrypt(s.webhook_secret_ciphertext, v_enc_key)
    end,
    c.merchant_code,
    c.qr_payload,
    c.active
  from public.payment_gateway_configs c
  left join private.payment_gateway_secrets s on s.config_id = c.id
  where (p_restaurant_id is null or c.restaurant_id = p_restaurant_id)
    and (v_provider is null or c.provider = v_provider)
  order by c.active desc, c.updated_at desc;
end;
$$;

revoke all on function public.get_payment_gateway_runtime_config(uuid, text) from public, anon, authenticated;
grant execute on function public.get_payment_gateway_runtime_config(uuid, text) to service_role;

-- 8.3. Capacidades públicas de checkout por restaurante (sin exponer claves ni secretos)
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

revoke all on function public.get_public_checkout_payment_options(uuid) from public;
grant execute on function public.get_public_checkout_payment_options(uuid) to anon, authenticated;

-- 8.4. Actualizar require_wallet_account para aceptar pasarelas activas en payment_gateway_configs
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

revoke all on function private.require_wallet_account(uuid, text) from public, anon, authenticated;

-- 8.5. Actualizar create_payment_intent, refresh_payment_intent, get_payment_intent y get_payment_receiver_label
--      para usar la pasarela o AutoCloud configurada en payment_gateway_configs (con fallback legacy seguro)
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

    return query
    select * from public.create_payment_intent(p_order_id, p_method, p_guest_access_token);
    return;
  end if;

  return query select v_intent.attempt_id, v_intent.order_id, v_intent.method, v_intent.status,
    v_intent.amount, v_intent.currency, v_intent.checkout_reference, v_intent.expires_at,
    v_intent.provider, v_intent.qr_payload;
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

  if v_attempt.gateway_config_id is not null then
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
    v_qr_payload;
end;
$$;

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

  if v_attempt.gateway_config_id is not null then
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

revoke all on function public.create_payment_intent(uuid, text, text) from public;
grant execute on function public.create_payment_intent(uuid, text, text) to anon, authenticated;

revoke all on function public.refresh_payment_intent(uuid, text, text) from public;
grant execute on function public.refresh_payment_intent(uuid, text, text) to anon, authenticated;

revoke all on function public.get_payment_intent(uuid, text) from public;
grant execute on function public.get_payment_intent(uuid, text) to anon, authenticated;

revoke all on function public.get_payment_receiver_label(uuid, text) from public;
grant execute on function public.get_payment_receiver_label(uuid, text) to anon, authenticated;
