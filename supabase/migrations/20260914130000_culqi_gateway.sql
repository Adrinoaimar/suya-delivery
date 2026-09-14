-- Culqi gateway: server-owned order and charge lifecycle.
-- The browser never chooses the amount and never receives a secret key.

alter table public.payment_attempts
  add column if not exists gateway_qr_payload text
    check (gateway_qr_payload is null or length(gateway_qr_payload) between 1 and 4000);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'payment_attempts'
  ) then
    alter publication supabase_realtime add table public.payment_attempts;
  end if;
end
$$;

create or replace function public.create_culqi_payment_intent(
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
  provider_reference text,
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
  v_guest_ok boolean := false;
begin
  if p_order_id is null then raise exception 'order is required'; end if;
  if lower(trim(coalesce(p_method, ''))) not in ('yape', 'card') then
    raise exception 'Culqi solo admite Yape o tarjeta en este flujo';
  end if;
  v_method := lower(trim(p_method))::public.payment_method;

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
  elsif v_order.customer_id <> (select auth.uid()) then
    raise exception 'order owner required';
  end if;

  if v_order.payment_method <> 'cash' and v_order.payment_method <> v_method then
    raise exception 'order already uses another payment method';
  end if;

  select pa.* into v_attempt
  from public.payment_attempts pa
  where pa.order_id = v_order.id
    and (
      pa.status in ('pending', 'authorized')
      or (pa.status = 'failed' and pa.provider = 'culqi' and pa.provider_reference is null)
    )
  order by pa.created_at desc
  limit 1
  for update;
  if found then
    if v_attempt.method <> v_method then raise exception 'order already has another payment attempt'; end if;
    if v_attempt.provider <> 'culqi' then
      raise exception 'order already uses manual wallet verification';
    end if;
    if v_attempt.status = 'failed' then
      update public.payment_attempts
      set status = 'pending', expires_at = now() + interval '30 minutes',
          failure_code = null, gateway_qr_payload = null, updated_at = now()
      where id = v_attempt.id;
      select * into v_attempt from public.payment_attempts where id = v_attempt.id;
    end if;
    return query select v_attempt.id, v_attempt.order_id, v_attempt.method, v_attempt.status,
      v_attempt.amount, 'PEN'::text, v_attempt.checkout_reference, v_attempt.expires_at,
      v_attempt.provider, v_attempt.provider_reference, v_attempt.gateway_qr_payload;
    return;
  end if;

  if v_order.total < 6 then raise exception 'Culqi requires an order total of at least S/ 6.00'; end if;
  if v_method = 'yape' and v_order.total > 500 then
    raise exception 'Culqi Yape supports orders up to S/ 500.00';
  end if;
  perform set_config('suya.payment_method_mutation', '1', true);
  update public.orders set payment_method = v_method where id = v_order.id;

  insert into public.payment_attempts (
    order_id, provider, method, status, amount, idempotency_key, expires_at
  ) values (
    v_order.id, 'culqi', v_method, 'pending', v_order.total,
    'order:' || v_order.id::text || ':culqi:' || v_method::text,
    now() + interval '30 minutes'
  ) returning * into v_attempt;

  return query select v_attempt.id, v_attempt.order_id, v_attempt.method, v_attempt.status,
    v_attempt.amount, 'PEN'::text, v_attempt.checkout_reference, v_attempt.expires_at,
    v_attempt.provider, v_attempt.provider_reference, v_attempt.gateway_qr_payload;
end;
$$;

create or replace function public.get_culqi_card_payment_context(
  p_payment_attempt_id uuid,
  p_guest_access_token text default null
)
returns table (
  attempt_id uuid,
  order_id uuid,
  order_code text,
  checkout_reference text,
  amount numeric,
  currency text,
  customer_name text,
  customer_phone text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_attempt public.payment_attempts%rowtype;
  v_guest_ok boolean := false;
begin
  select pa.* into v_attempt
  from public.payment_attempts pa
  where pa.id = p_payment_attempt_id
  for update;
  if not found then return; end if;

  select * into v_order from public.orders where id = v_attempt.order_id;
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
  if v_attempt.provider <> 'culqi' or v_attempt.method <> 'card'
    or v_attempt.status <> 'pending' then return; end if;

  return query select v_attempt.id, v_order.id, v_order.code, v_attempt.checkout_reference,
    v_attempt.amount, 'PEN'::text, v_order.customer_name, v_order.customer_phone;
end;
$$;

create or replace function public.authorize_culqi_card_payment(
  p_payment_attempt_id uuid,
  p_provider_reference text,
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
  v_reference text := nullif(trim(coalesce(p_provider_reference, '')), '');
begin
  if v_reference is null or length(v_reference) > 200 then
    raise exception 'invalid Culqi provider reference';
  end if;
  select pa.* into v_attempt
  from public.payment_attempts pa
  where pa.id = p_payment_attempt_id
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
  elsif v_order.customer_id <> (select auth.uid()) then
    raise exception 'order owner required';
  end if;
  if v_attempt.provider <> 'culqi' or v_attempt.method <> 'card'
    or v_attempt.status <> 'pending' then
    raise exception 'payment attempt is not chargeable';
  end if;

  update public.payment_attempts
  set status = 'authorized', provider_reference = v_reference, updated_at = now()
  where id = v_attempt.id;
  return true;
end;
$$;

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
        and extensions.crypt(p_guest_access_token, s.guest_access_token_hash) = s.guest_access_token_hash
    ) into v_guest_ok;
    if not v_guest_ok then return; end if;
  elsif v_order.customer_id <> (select auth.uid()) then
    return;
  end if;
  select pa.* into v_attempt from public.payment_attempts pa
  where pa.order_id = p_order_id order by pa.created_at desc limit 1;
  if not found then return; end if;
  select coalesce(v_attempt.gateway_qr_payload, rpa.qr_payload) into v_qr_payload
  from public.restaurant_payment_accounts rpa
  where rpa.restaurant_id = v_order.restaurant_id
    and rpa.provider = v_attempt.method::text
    and rpa.active;
  if v_attempt.gateway_qr_payload is not null then v_qr_payload := v_attempt.gateway_qr_payload; end if;
  return query select v_attempt.id, v_attempt.order_id, v_attempt.method, v_attempt.status,
    v_attempt.amount, 'PEN'::text, v_attempt.checkout_reference, v_attempt.expires_at,
    v_attempt.provider, v_attempt.provider_reference, v_qr_payload;
end;
$$;

revoke all on function public.create_culqi_payment_intent(uuid, text, text) from public;
grant execute on function public.create_culqi_payment_intent(uuid, text, text) to anon, authenticated;
revoke all on function public.get_culqi_card_payment_context(uuid, text) from public;
grant execute on function public.get_culqi_card_payment_context(uuid, text) to anon, authenticated;
revoke all on function public.authorize_culqi_card_payment(uuid, text, text) from public;
grant execute on function public.authorize_culqi_card_payment(uuid, text, text) to anon, authenticated;
revoke all on function public.get_payment_intent(uuid, text) from public;
grant execute on function public.get_payment_intent(uuid, text) to anon, authenticated;

comment on function public.create_culqi_payment_intent(uuid, text, text)
  is 'Creates a server-owned Culqi order intent for exact Yape or card amount.';
comment on function public.get_culqi_card_payment_context(uuid, text)
  is 'Returns charge context only to the order owner or a valid guest token.';
comment on function public.authorize_culqi_card_payment(uuid, text, text)
  is 'Marks a card attempt authorized only after the server receives a successful Culqi charge.';
