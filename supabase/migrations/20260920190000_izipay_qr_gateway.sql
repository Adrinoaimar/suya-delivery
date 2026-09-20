-- Izipay QR gateway. Merchant credentials stay in Edge Function secrets.
-- The client receives a short-lived checkout session only after the server
-- locks the exact order total and creates one idempotent payment attempt.

-- Keep this migration deployable on the public baseline as well as on the
-- newer wallet/Culqi schema, where these columns already exist.
alter table public.payment_attempts
  add column if not exists receiver_account_id uuid,
  add column if not exists gateway_qr_payload text;

create or replace function public.create_izipay_payment_intent(
  p_order_id uuid,
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
  customer_name text,
  customer_phone text,
  delivery_address text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_attempt public.payment_attempts%rowtype;
  v_guest_ok boolean := false;
  v_transaction_id text;
  v_order_number text;
begin
  if p_order_id is null then raise exception 'order is required'; end if;

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;
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

  if v_order.payment_method <> 'cash' and v_order.payment_method <> 'yape' then
    raise exception 'order already uses another payment method';
  end if;
  if v_order.total <= 0 then raise exception 'order total must be positive'; end if;

  select pa.* into v_attempt
  from public.payment_attempts pa
  where pa.order_id = v_order.id
    and pa.provider = 'izipay'
    and pa.status in ('pending', 'authorized', 'failed')
  order by pa.created_at desc
  limit 1
  for update;
  if found then
    if v_attempt.status = 'failed' then
      v_transaction_id := 'SUYA' || upper(substr(replace(extensions.gen_random_uuid()::text, '-', ''), 1, 28));
      v_order_number := 'SUYA' || upper(substr(replace(extensions.gen_random_uuid()::text, '-', ''), 1, 11));
      update public.payment_attempts
      set status = 'pending', provider_reference = v_transaction_id,
          checkout_reference = v_order_number,
          failure_code = null, expires_at = now() + interval '30 minutes', updated_at = now()
      where id = v_attempt.id;
      select * into v_attempt from public.payment_attempts where id = v_attempt.id;
    end if;
    return query select v_attempt.id, v_order.id, v_order.code, v_attempt.method,
      v_attempt.status, v_attempt.amount, 'PEN'::text, v_attempt.checkout_reference,
      v_attempt.expires_at, v_attempt.provider, v_attempt.provider_reference,
      v_order.customer_name, v_order.customer_phone, v_order.delivery_address;
    return;
  end if;

  if exists (
    select 1 from public.payment_attempts pa
    where pa.order_id = v_order.id and pa.status in ('pending', 'authorized')
      and pa.provider <> 'izipay'
  ) then
    raise exception 'order already has another payment attempt';
  end if;

  v_transaction_id := 'SUYA' || upper(substr(replace(extensions.gen_random_uuid()::text, '-', ''), 1, 28));
  v_order_number := 'SUYA' || upper(substr(replace(extensions.gen_random_uuid()::text, '-', ''), 1, 11));
  perform set_config('suya.payment_method_mutation', '1', true);
  update public.orders set payment_method = 'yape' where id = v_order.id;

  insert into public.payment_attempts (
    order_id, provider, provider_reference, checkout_reference, method, status, amount, idempotency_key, expires_at
  ) values (
    v_order.id, 'izipay', v_transaction_id, v_order_number, 'yape', 'pending', v_order.total,
    'order:' || v_order.id::text || ':izipay:qr', now() + interval '30 minutes'
  ) returning * into v_attempt;

  return query select v_attempt.id, v_order.id, v_order.code, v_attempt.method,
    v_attempt.status, v_attempt.amount, 'PEN'::text, v_attempt.checkout_reference,
    v_attempt.expires_at, v_attempt.provider, v_attempt.provider_reference,
    v_order.customer_name, v_order.customer_phone, v_order.delivery_address;
end;
$$;

create or replace function public.apply_izipay_webhook(
  p_transaction_id text,
  p_payload jsonb
)
returns table (
  payment_attempt_id uuid,
  payment_status public.payment_status,
  authorized boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempt public.payment_attempts%rowtype;
  v_order_data jsonb;
  v_code text := nullif(trim(coalesce(p_payload->>'code', '')), '');
  v_currency text;
  v_amount numeric;
  v_state text;
  v_order_number text;
  v_order_status text;
  v_provider_reference text := nullif(trim(coalesce(p_transaction_id, '')), '');
  v_next_status public.payment_status;
  v_failure_code text;
begin
  if (select auth.role()) <> 'service_role' then
    raise exception 'service role required';
  end if;
  if v_provider_reference is null or length(v_provider_reference) not between 5 and 40 then
    raise exception 'invalid Izipay transaction id';
  end if;
  if nullif(trim(coalesce(p_payload->>'transactionId', '')), '') is not null
    and trim(p_payload->>'transactionId') <> v_provider_reference then
    raise exception 'Izipay transaction id mismatch';
  end if;

  select pa.* into v_attempt
  from public.payment_attempts pa
  where pa.provider = 'izipay' and pa.provider_reference = v_provider_reference
  for update;
  if not found then
    return;
  end if;

  select o.status::text into v_order_status
  from public.orders o
  where o.id = v_attempt.order_id;

  v_order_data := coalesce(
    case jsonb_typeof(p_payload->'response'->'order')
      when 'array' then p_payload->'response'->'order'->0
      when 'object' then p_payload->'response'->'order'
      else null
    end,
    '{}'::jsonb
  );
  v_currency := upper(trim(coalesce(v_order_data->>'currency', '')));
  v_order_number := lower(trim(coalesce(v_order_data->>'orderNumber', '')));
  begin
    v_amount := (v_order_data->>'amount')::numeric;
  exception when others then
    v_amount := null;
  end;
  v_state := lower(trim(coalesce(v_order_data->>'stateMessage', '')));

  if v_attempt.status <> 'authorized' and v_order_status in ('cancelled', 'delivered') then
    v_next_status := 'failed';
    v_failure_code := 'izipay_order_closed';
  elsif v_currency <> 'PEN' or v_amount is null or round(v_amount, 2) <> round(v_attempt.amount, 2) then
    v_next_status := 'failed';
    v_failure_code := 'izipay_amount_or_currency_mismatch';
  elsif v_order_number <> lower(trim(v_attempt.checkout_reference)) then
    v_next_status := 'failed';
    v_failure_code := 'izipay_order_reference_mismatch';
  elsif v_code = '00' and v_state in ('autorizado', 'authorized', 'aprobado', 'approved') then
    v_next_status := 'authorized';
    v_failure_code := null;
  elsif v_state in (
    'rechazado', 'rejected', 'denegado', 'declined', 'fallido', 'failed',
    'no autorizado', 'not authorized', 'cancelado', 'cancelled', 'anulado',
    'voided', 'expirado', 'expired'
  ) then
    v_next_status := 'failed';
    v_failure_code := left('izipay_' || lower(regexp_replace(coalesce(v_code, v_state), '[^a-z0-9_-]+', '_', 'g')), 120);
  else
    return query select v_attempt.id, v_attempt.status, false;
    return;
  end if;

  update public.payment_attempts
  set status = case when status = 'authorized' then status else v_next_status end,
      failure_code = case when status = 'authorized' then failure_code else v_failure_code end,
      updated_at = now()
  where id = v_attempt.id;

  select pa.status into v_next_status from public.payment_attempts pa where pa.id = v_attempt.id;
  return query select v_attempt.id, v_next_status, v_next_status = 'authorized';
end;
$$;

-- The previous wallet RPC has a different OUT-parameter list (Izipay also
-- returns provider_reference), so PostgreSQL requires dropping the signature
-- before recreating it.
drop function if exists public.get_payment_intent(uuid, text);

create function public.get_payment_intent(
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
  elsif (select auth.uid()) is null or v_order.customer_id <> (select auth.uid()) then
    return;
  end if;
  select pa.* into v_attempt from public.payment_attempts pa
  where pa.order_id = p_order_id order by pa.created_at desc limit 1;
  if not found then return; end if;
  if v_attempt.provider <> 'izipay' then
    if v_attempt.receiver_account_id is not null then
      select rpa.qr_payload into v_qr_payload
      from public.restaurant_payment_accounts rpa
      where rpa.id = v_attempt.receiver_account_id
        and rpa.restaurant_id = v_order.restaurant_id and rpa.active;
    else
      select rpa.qr_payload into v_qr_payload
      from public.restaurant_payment_accounts rpa
      where rpa.restaurant_id = v_order.restaurant_id
        and rpa.provider = v_attempt.method::text and rpa.active;
    end if;
  else
    v_qr_payload := v_attempt.gateway_qr_payload;
  end if;
  return query select v_attempt.id, v_attempt.order_id, v_attempt.method, v_attempt.status,
    v_attempt.amount, 'PEN'::text, v_attempt.checkout_reference, v_attempt.expires_at,
    v_attempt.provider, v_attempt.provider_reference, v_qr_payload;
end;
$$;

revoke all on function public.create_izipay_payment_intent(uuid, text) from public, authenticated;
grant execute on function public.create_izipay_payment_intent(uuid, text) to anon;
grant execute on function public.create_izipay_payment_intent(uuid, text) to authenticated;
revoke all on function public.apply_izipay_webhook(text, jsonb) from public, anon, authenticated;
grant execute on function public.apply_izipay_webhook(text, jsonb) to service_role;
revoke all on function public.get_payment_intent(uuid, text) from public, anon, authenticated;
grant execute on function public.get_payment_intent(uuid, text) to anon, authenticated;

comment on function public.create_izipay_payment_intent(uuid, text) is
  'Creates one server-total Izipay QR attempt. Credentials never enter public tables.';
comment on function public.apply_izipay_webhook(text, jsonb) is
  'Applies an HMAC-verified Izipay result with exact PEN amount matching.';
