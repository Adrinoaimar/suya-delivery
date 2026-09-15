-- Claim the local payment attempt before calling Culqi.
-- This prevents concurrent browser retries from creating two charges.

alter table public.payment_attempts
  add column if not exists gateway_claim_digest text
    check (gateway_claim_digest is null or length(gateway_claim_digest) = 64),
  add column if not exists gateway_claimed_at timestamptz;

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
  elsif v_order.customer_id <> (select auth.uid()) then
    raise exception 'order owner required';
  end if;

  if v_attempt.provider <> 'culqi'
    or v_attempt.method <> v_method
    or v_attempt.status <> 'pending'
    or v_attempt.expires_at <= now() then
    raise exception 'payment attempt is not chargeable';
  end if;
  if v_attempt.gateway_claimed_at is not null
    and v_attempt.gateway_claimed_at > now() - interval '10 minutes' then
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

create or replace function public.authorize_culqi_payment(
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
declare
  v_order public.orders%rowtype;
  v_attempt public.payment_attempts%rowtype;
  v_guest_ok boolean := false;
  v_method public.payment_method;
  v_reference text := nullif(trim(coalesce(p_provider_reference, '')), '');
  v_claim_digest text;
begin
  if p_payment_attempt_id is null
    or lower(trim(coalesce(p_method, ''))) not in ('card', 'yape')
    or v_reference is null
    or v_reference !~ '^chr_(test|live)_[A-Za-z0-9_-]+$'
    or p_claim_token is null
    or length(p_claim_token) < 32 then
    raise exception 'invalid Culqi authorization';
  end if;
  v_method := lower(trim(p_method))::public.payment_method;
  v_claim_digest := encode(extensions.digest(p_claim_token, 'sha256'), 'hex');

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

  if v_attempt.status = 'authorized' and v_attempt.provider_reference = v_reference then
    return true;
  end if;
  if v_attempt.provider <> 'culqi'
    or v_attempt.method <> v_method
    or v_attempt.status <> 'pending'
    or v_attempt.gateway_claim_digest is distinct from v_claim_digest
    or v_attempt.gateway_claimed_at is null
    or v_attempt.gateway_claimed_at < now() - interval '15 minutes' then
    raise exception 'payment claim is invalid or expired';
  end if;

  update public.payment_attempts
  set status = 'authorized',
      provider_reference = v_reference,
      gateway_claim_digest = null,
      gateway_claimed_at = null,
      updated_at = now()
  where id = v_attempt.id;
  return true;
end;
$$;

create or replace function public.fail_culqi_payment_claim(
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
declare
  v_order public.orders%rowtype;
  v_attempt public.payment_attempts%rowtype;
  v_guest_ok boolean := false;
  v_claim_digest text;
  v_failure_code text := left(nullif(trim(coalesce(p_failure_code, '')), ''), 120);
begin
  if p_payment_attempt_id is null or p_claim_token is null or length(p_claim_token) < 32
    or v_failure_code is null or v_failure_code !~ '^[a-z0-9_-]+$' then
    raise exception 'invalid Culqi failure';
  end if;
  v_claim_digest := encode(extensions.digest(p_claim_token, 'sha256'), 'hex');
  select * into v_attempt from public.payment_attempts where id = p_payment_attempt_id for update;
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
  if v_attempt.status <> 'pending'
    or v_attempt.gateway_claim_digest is distinct from v_claim_digest
    or v_attempt.gateway_claimed_at is null
    or v_attempt.gateway_claimed_at < now() - interval '15 minutes' then
    raise exception 'payment claim is invalid or expired';
  end if;

  update public.payment_attempts
  set status = 'failed', failure_code = v_failure_code,
      gateway_claim_digest = null, gateway_claimed_at = null, updated_at = now()
  where id = v_attempt.id;
  return true;
end;
$$;

revoke all on function public.claim_culqi_payment(uuid, text, text) from public;
grant execute on function public.claim_culqi_payment(uuid, text, text) to anon, authenticated;
revoke all on function public.authorize_culqi_payment(uuid, text, text, text, text) from public;
grant execute on function public.authorize_culqi_payment(uuid, text, text, text, text) to anon, authenticated;
revoke all on function public.fail_culqi_payment_claim(uuid, text, text, text) from public;
grant execute on function public.fail_culqi_payment_claim(uuid, text, text, text) to anon, authenticated;
revoke all on function public.authorize_culqi_card_payment(uuid, text, text) from public, anon, authenticated;

comment on function public.claim_culqi_payment(uuid, text, text)
  is 'Atomically reserves one pending Culqi attempt before an external charge.';
comment on function public.authorize_culqi_payment(uuid, text, text, text, text)
  is 'Authorizes a Culqi card or Yape token only with its short-lived claim.';
