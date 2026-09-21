-- Reserve the external Culqi order creation before calling the provider.
-- The provider call happens outside Postgres, so the short-lived digest keeps
-- two browser retries from creating two external orders for one Suya attempt.

alter table public.payment_attempts
  add column if not exists gateway_order_claim_digest text
    check (gateway_order_claim_digest is null or length(gateway_order_claim_digest) = 64),
  add column if not exists gateway_order_claimed_at timestamptz;

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
  elsif v_order.customer_id <> (select auth.uid()) then
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
    update public.payment_attempts
    set provider_reference = null,
        gateway_qr_payload = null,
        expires_at = now() + interval '30 minutes',
        failure_code = null,
        gateway_order_claim_digest = null,
        gateway_order_claimed_at = null,
        updated_at = now()
    where id = v_attempt.id;
    select * into v_attempt from public.payment_attempts where id = v_attempt.id;
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

  if v_attempt.gateway_order_claimed_at is not null
    and v_attempt.gateway_order_claimed_at > now() - interval '10 minutes' then
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

revoke all on function public.claim_culqi_order_creation(uuid, text, text) from public;
grant execute on function public.claim_culqi_order_creation(uuid, text, text) to anon, authenticated;

comment on function public.claim_culqi_order_creation(uuid, text, text)
  is 'Atomically reserves external Culqi order creation and preserves authorized attempts.';
