-- Las observaciones Android y los códigos declarados son indicios, nunca confirmación financiera.
-- No modifica autorizaciones históricas ni borra funciones/observaciones.

create or replace function private.require_trusted_payment_authorization()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.status = 'authorized' and (tg_op = 'INSERT' or old.status is distinct from new.status)
    and (new.provider = 'wallet_observer' or new.provider_reference like 'wallet_observation:%') then
    raise exception 'wallet notifications are unverified evidence; bank confirmation required';
  end if;
  return new;
end;
$$;
revoke all on function private.require_trusted_payment_authorization() from public, anon, authenticated;
create trigger payment_attempts_trusted_authorization_guard
before insert or update on public.payment_attempts
for each row execute function private.require_trusted_payment_authorization();

-- Conserva el contrato de declaración sin autorizar ni cancelar por notificaciones.
create or replace function public.confirm_manual_wallet_payment(
  p_order_id uuid, p_payer_name text, p_guest_access_token text default null
)
returns table (confirmation_status text, payment_attempt_id uuid, observation_id uuid,
  observed_at timestamptz, payer_display_name text)
language plpgsql security definer set search_path = '' as $$
declare v_attempt public.payment_attempts%rowtype;
begin
  perform private.require_payment_actor(p_order_id, p_guest_access_token);
  if length(trim(coalesce(p_payer_name, ''))) not between 2 and 120 then
    raise exception 'valid payer name is required';
  end if;
  select * into v_attempt from public.payment_attempts pa where pa.order_id = p_order_id
    order by pa.created_at desc limit 1 for update;
  if not found or v_attempt.provider <> 'wallet_observer' or v_attempt.method not in ('yape', 'lemon') then
    raise exception 'manual wallet payment required';
  end if;
  if v_attempt.status = 'authorized' then
    return query select 'authorized'::text, v_attempt.id, null::uuid, null::timestamptz, v_attempt.payer_display_name;
    return;
  end if;
  perform public.declare_manual_payment(p_order_id, null, p_payer_name, p_guest_access_token);
  return query select 'pending'::text, v_attempt.id, null::uuid, null::timestamptz, p_payer_name;
end;
$$;

create or replace function public.confirm_manual_wallet_payment_by_code_v2(
  p_order_id uuid, p_confirmation_code text, p_guest_access_token text default null
)
returns table (confirmation_status text, payment_attempt_id uuid, observation_id uuid,
  observed_at timestamptz, payer_display_name text, observed_amount_cents bigint)
language plpgsql security definer set search_path = '' as $$
declare v_attempt public.payment_attempts%rowtype;
begin
  perform private.require_payment_actor(p_order_id, p_guest_access_token);
  if trim(coalesce(p_confirmation_code, '')) !~ '^[0-9]{3}$' then
    raise exception 'valid three digit Yape code is required';
  end if;
  select * into v_attempt from public.payment_attempts pa where pa.order_id = p_order_id
    order by pa.created_at desc limit 1 for update;
  if not found or v_attempt.provider <> 'wallet_observer' or v_attempt.method <> 'yape' then
    raise exception 'manual Yape payment required';
  end if;
  if v_attempt.status = 'authorized' then
    return query select 'authorized'::text, v_attempt.id, null::uuid, null::timestamptz,
      v_attempt.payer_display_name, null::bigint;
    return;
  end if;
  perform public.declare_manual_payment(p_order_id, p_confirmation_code, null, p_guest_access_token);
  return query select 'pending'::text, v_attempt.id, null::uuid, null::timestamptz, null::text, null::bigint;
end;
$$;

create or replace function public.confirm_manual_wallet_payment_by_code(
  p_order_id uuid, p_confirmation_code text, p_guest_access_token text default null
)
returns table (confirmation_status text, payment_attempt_id uuid, observation_id uuid,
  observed_at timestamptz, payer_display_name text)
language plpgsql security definer set search_path = '' as $$
begin
  return query select c.confirmation_status, c.payment_attempt_id, c.observation_id,
    c.observed_at, c.payer_display_name
  from public.confirm_manual_wallet_payment_by_code_v2(p_order_id, p_confirmation_code, p_guest_access_token) c;
end;
$$;

-- Las RPC antiguas de caja tampoco pueden elevar indicios a dinero recibido.
create or replace function public.verify_wallet_payment(p_observation_id uuid, p_payment_attempt_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  raise exception 'La notificación no acredita el abono. Verifica el movimiento en el canal oficial del proveedor; esta vía no permite autorizar pagos.';
end;
$$;
create or replace function public.verify_wallet_payment_by_name(p_observation_id uuid, p_payer_name text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  raise exception 'El nombre y la notificación no acreditan el abono. Se requiere confirmación financiera del proveedor.';
end;
$$;

-- El navegador solo puede comprobar su derecho al intento, nunca obtener una reserva secreta.
create or replace function public.check_culqi_payment_actor_secure(
  p_payment_attempt_id uuid, p_guest_access_token text default null
)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_payment_attempt_actor(p_payment_attempt_id, p_guest_access_token);
  return true;
end;
$$;
revoke all on function public.check_culqi_payment_actor_secure(uuid, text) from public;
grant execute on function public.check_culqi_payment_actor_secure(uuid, text) to anon, authenticated;

create or replace function public.claim_culqi_order_creation_secure(
  p_payment_attempt_id uuid,
  p_method text,
  p_guest_access_token text default null
)
returns table (
  attempt_id uuid,
  order_id uuid,
  order_code text,
  method public.payment_method,
  status public.payment_status,
  amount numeric,
  currency text,
  checkout_reference text,
  expires_at timestamptz,
  provider text,
  provider_reference text,
  qr_payload text,
  claim_token text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.jwt() ->> 'role') is distinct from 'service_role' then
    raise exception 'trusted payment server required';
  end if;
  return query select * from public.claim_culqi_order_creation(
    p_payment_attempt_id, p_method, p_guest_access_token
  );
end;
$$;
revoke all on function public.claim_culqi_order_creation_secure(uuid, text, text) from public, anon, authenticated;
grant execute on function public.claim_culqi_order_creation_secure(uuid, text, text) to service_role;

create or replace function public.claim_culqi_payment_secure(
  p_payment_attempt_id uuid,
  p_method text,
  p_guest_access_token text default null
)
returns table (
  attempt_id uuid,
  order_id uuid,
  order_code text,
  method public.payment_method,
  amount numeric,
  currency text,
  customer_name text,
  customer_phone text,
  claim_token text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.jwt() ->> 'role') is distinct from 'service_role' then
    raise exception 'trusted payment server required';
  end if;
  return query select * from public.claim_culqi_payment(
    p_payment_attempt_id, p_method, p_guest_access_token
  );
end;
$$;
revoke all on function public.claim_culqi_payment_secure(uuid, text, text) from public, anon, authenticated;
grant execute on function public.claim_culqi_payment_secure(uuid, text, text) to service_role;

create or replace function public.authorize_culqi_payment_secure(
  p_payment_attempt_id uuid,
  p_method text,
  p_provider_reference text,
  p_claim_token text,
  p_guest_access_token text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.jwt() ->> 'role') is distinct from 'service_role' then
    raise exception 'trusted payment server required';
  end if;
  return public.authorize_culqi_payment(
    p_payment_attempt_id, p_method, p_provider_reference, p_claim_token, p_guest_access_token
  );
end;
$$;
revoke all on function public.authorize_culqi_payment_secure(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.authorize_culqi_payment_secure(uuid, text, text, text, text) to service_role;

create or replace function public.fail_culqi_payment_claim_secure(
  p_payment_attempt_id uuid,
  p_claim_token text,
  p_failure_code text,
  p_guest_access_token text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.jwt() ->> 'role') is distinct from 'service_role' then
    raise exception 'trusted payment server required';
  end if;
  return public.fail_culqi_payment_claim(
    p_payment_attempt_id, p_claim_token, p_failure_code, p_guest_access_token
  );
end;
$$;
revoke all on function public.fail_culqi_payment_claim_secure(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.fail_culqi_payment_claim_secure(uuid, text, text, text) to service_role;

create or replace function public.claim_culqi_payment(
  p_payment_attempt_id uuid,
  p_method text,
  p_guest_access_token text default null
)
returns table (
  attempt_id uuid,
  order_id uuid,
  order_code text,
  method public.payment_method,
  amount numeric,
  currency text,
  customer_name text,
  customer_phone text,
  claim_token text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_attempt public.payment_attempts%rowtype;
  v_guest_ok boolean := false;
  v_method public.payment_method;
  v_claim_token text;
begin
  if p_payment_attempt_id is null
    or lower(trim(coalesce(p_method, ''))) not in ('card', 'yape') then
    raise exception 'invalid Culqi payment claim';
  end if;
  v_method := lower(trim(p_method))::public.payment_method;

  select * into v_attempt
  from public.payment_attempts
  where id = p_payment_attempt_id
  for update;
  if not found then raise exception 'payment attempt not found'; end if;

  select * into v_order from public.orders where id = v_attempt.order_id;
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
  elsif (select auth.jwt() ->> 'role') is distinct from 'service_role'
    and ((select auth.uid()) is null or v_order.customer_id <> (select auth.uid())) then
    raise exception 'order owner required';
  end if;

  if v_attempt.provider <> 'culqi'
    or v_attempt.method <> v_method
    or v_attempt.status <> 'pending'
    or v_attempt.expires_at <= now() then
    raise exception 'payment attempt is not chargeable';
  end if;
  if v_attempt.gateway_claimed_at is not null then
    raise exception 'payment attempt is already being processed';
  end if;

  v_claim_token := encode(extensions.gen_random_bytes(32), 'hex');
  update public.payment_attempts
  set gateway_claim_digest = encode(extensions.digest(v_claim_token, 'sha256'), 'hex'),
      gateway_claimed_at = now(),
      updated_at = now()
  where id = v_attempt.id;

  return query select v_attempt.id, v_order.id, v_order.code, v_attempt.method,
    v_attempt.amount, 'PEN'::text, v_order.customer_name, v_order.customer_phone,
    v_claim_token;
end;
$$;
revoke all on function public.claim_culqi_payment(uuid, text, text) from public, anon, authenticated;

create or replace function public.claim_culqi_order_creation(
  p_payment_attempt_id uuid,
  p_method text,
  p_guest_access_token text default null
)
returns table (
  attempt_id uuid,
  order_id uuid,
  order_code text,
  method public.payment_method,
  status public.payment_status,
  amount numeric,
  currency text,
  checkout_reference text,
  expires_at timestamptz,
  provider text,
  provider_reference text,
  qr_payload text,
  claim_token text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_attempt public.payment_attempts%rowtype;
  v_guest_ok boolean := false;
  v_method public.payment_method;
  v_claim_token text;
begin
  if p_payment_attempt_id is null
    or lower(trim(coalesce(p_method, ''))) not in ('card', 'yape') then
    raise exception 'invalid Culqi order claim';
  end if;
  v_method := lower(trim(p_method))::public.payment_method;

  select * into v_attempt
  from public.payment_attempts
  where id = p_payment_attempt_id
  for update;
  if not found then raise exception 'payment attempt not found'; end if;

  select * into v_order from public.orders where id = v_attempt.order_id;
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
  elsif (select auth.jwt() ->> 'role') is distinct from 'service_role'
    and ((select auth.uid()) is null or v_order.customer_id <> (select auth.uid())) then
    raise exception 'order owner required';
  end if;

  if v_attempt.provider <> 'culqi' or v_attempt.method <> v_method then
    raise exception 'payment attempt is not a Culqi attempt';
  end if;

  -- An already-authorized attempt is idempotent. Never replace its charge
  -- reference with a new order reference after a page refresh.
  if v_attempt.status = 'authorized' then
    return query select v_attempt.id, v_order.id, v_order.code, v_attempt.method,
      v_attempt.status, v_attempt.amount, 'PEN'::text, v_attempt.checkout_reference,
      v_attempt.expires_at, v_attempt.provider, v_attempt.provider_reference,
      v_attempt.gateway_qr_payload, null::text;
    return;
  end if;
  if v_attempt.status <> 'pending' then
    raise exception 'payment attempt is not pending';
  end if;

  -- A pending gateway order is no longer usable after the local intent
  -- expires. Reset it while holding the row lock, then issue one fresh claim.
  if v_attempt.expires_at <= now() then
    raise exception 'expired gateway order requires reconciliation';
  end if;

  -- A valid stored order is safe to reuse and does not need a new provider
  -- call. The caller must still validate the ord_test/live format.
  if v_attempt.provider_reference is not null then
    return query select v_attempt.id, v_order.id, v_order.code, v_attempt.method,
      v_attempt.status, v_attempt.amount, 'PEN'::text, v_attempt.checkout_reference,
      v_attempt.expires_at, v_attempt.provider, v_attempt.provider_reference,
      v_attempt.gateway_qr_payload, null::text;
    return;
  end if;

  if v_attempt.gateway_order_claimed_at is not null then
    raise exception 'payment attempt is already preparing';
  end if;

  v_claim_token := encode(extensions.gen_random_bytes(32), 'hex');
  update public.payment_attempts
  set gateway_order_claim_digest = encode(extensions.digest(v_claim_token, 'sha256'), 'hex'),
      gateway_order_claimed_at = now(),
      updated_at = now()
  where id = v_attempt.id;

  return query select v_attempt.id, v_order.id, v_order.code, v_attempt.method,
    v_attempt.status, v_attempt.amount, 'PEN'::text, v_attempt.checkout_reference,
    v_attempt.expires_at, v_attempt.provider, v_attempt.provider_reference,
    v_attempt.gateway_qr_payload, v_claim_token;
end;
$$;
revoke all on function public.claim_culqi_order_creation(uuid, text, text) from public, anon, authenticated;


-- Las funciones históricas siguen internas; ningún permiso directo del cliente las recupera.
revoke all on function public.authorize_culqi_payment(uuid,text,text,text,text) from public, anon, authenticated;
revoke all on function public.authorize_culqi_card_payment(uuid,text,text) from public, anon, authenticated;
revoke all on function public.fail_culqi_payment_claim(uuid,text,text,text) from public, anon, authenticated;

comment on function public.confirm_manual_wallet_payment_by_code_v2(uuid,text,text)
  is 'Registra una declaración para revisión. Un código o evento Android nunca autoriza ni cancela el pedido.';
comment on function public.check_culqi_payment_actor_secure(uuid,text)
  is 'Comprobación de propietario/token sin reservas secretas; la autorización final es exclusiva del servidor.';
