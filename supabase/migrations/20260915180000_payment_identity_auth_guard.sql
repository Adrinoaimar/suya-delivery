-- Evita que una comparación con NULL autorice por accidente una orden autenticada.
-- Las funciones SECURITY DEFINER mantienen el acceso guest por token, pero una
-- orden con customer_id exige una sesión autenticada del mismo propietario.

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
  elsif (select auth.uid()) is null or v_order.customer_id <> (select auth.uid()) then
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

revoke all on function public.create_payment_intent(uuid, text, text) from public, anon, authenticated;
grant execute on function public.create_payment_intent(uuid, text, text) to anon, authenticated;
revoke all on function public.get_payment_intent(uuid, text) from public, anon, authenticated;
grant execute on function public.get_payment_intent(uuid, text) to anon, authenticated;
