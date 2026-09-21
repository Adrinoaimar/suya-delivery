-- Bind manual wallet evidence to the payer's operation/security code.
-- Amount and time alone are not a safe order identifier when two customers pay
-- the same total. Only the last four characters are retained.

alter table public.payment_attempts
  add column if not exists payer_code_last4 text
    check (payer_code_last4 is null or length(payer_code_last4) between 1 and 4);

create or replace function public.submit_payment_evidence(
  p_order_id uuid,
  p_code text,
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
  v_code text := lower(regexp_replace(trim(coalesce(p_code, '')), '\s+', '', 'g'));
begin
  if p_order_id is null
    or v_code is null
    or length(v_code) < 3
    or length(v_code) > 64
    or v_code !~ '^[a-z0-9-]+$' then
    raise exception 'invalid payment evidence code';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;
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

  select pa.* into v_attempt
  from public.payment_attempts pa
  where pa.order_id = v_order.id
    and pa.status = 'pending'
  order by pa.created_at desc
  limit 1
  for update;
  if not found then raise exception 'pending payment attempt not found'; end if;
  if v_attempt.method not in ('yape', 'lemon') then
    raise exception 'evidence code is only valid for wallet payments';
  end if;

  update public.payment_attempts
  set payer_code_last4 = right(v_code, 4), updated_at = now()
  where id = v_attempt.id;
  return true;
end;
$$;

create or replace function public.list_wallet_payment_candidates(p_observation_id uuid)
returns table (
  payment_attempt_id uuid,
  order_id uuid,
  order_code text,
  checkout_reference text,
  method public.payment_method,
  amount numeric,
  created_at timestamptz,
  expires_at timestamptz,
  sender_name text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  select pa.id, o.id, o.code, pa.checkout_reference, pa.method, pa.amount,
    pa.created_at, pa.expires_at, wo.sender_name
  from public.wallet_observations wo
  join public.orders o on o.restaurant_id = wo.restaurant_id
  join public.payment_attempts pa on pa.order_id = o.id
  where wo.id = p_observation_id
    and (private.is_platform_admin() or private.has_restaurant_role(
      wo.restaurant_id, array['owner', 'manager']::public.restaurant_role[]
    ))
    and wo.verification_status in ('unverified', 'under_review')
    and wo.provider in ('yape', 'lemon')
    and wo.currency = 'PEN'
    and pa.method::text = wo.provider
    and pa.status = 'pending'
    and pa.payer_code_last4 is not null
    and wo.code_last4 is not null
    and pa.payer_code_last4 = wo.code_last4
    and round(pa.amount * 100) = wo.amount_cents
    and pa.created_at <= wo.observed_at
    and pa.expires_at >= wo.observed_at
  order by abs(extract(epoch from (wo.observed_at - pa.created_at))), pa.created_at desc
  limit 10;
end;
$$;

create or replace function public.verify_wallet_payment(
  p_observation_id uuid,
  p_payment_attempt_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_observation public.wallet_observations%rowtype;
  v_attempt public.payment_attempts%rowtype;
begin
  select * into v_observation
  from public.wallet_observations
  where id = p_observation_id
  for update;
  if not found then raise exception 'wallet observation not found'; end if;
  if not (private.is_platform_admin() or private.has_restaurant_role(
    v_observation.restaurant_id, array['owner', 'manager']::public.restaurant_role[]
  )) then raise exception 'not authorized'; end if;

  select pa.* into v_attempt
  from public.payment_attempts pa
  join public.orders o on o.id = pa.order_id
  where pa.id = p_payment_attempt_id
    and o.restaurant_id = v_observation.restaurant_id
  for update;
  if not found then raise exception 'payment attempt not found'; end if;
  if v_observation.verification_status not in ('unverified', 'under_review')
    or v_observation.provider not in ('yape', 'lemon')
    or v_observation.currency <> 'PEN'
    or round(v_attempt.amount * 100) <> v_observation.amount_cents
    or v_attempt.method::text <> v_observation.provider
    or v_attempt.status <> 'pending'
    or v_attempt.expires_at < v_observation.observed_at
    or v_attempt.payer_code_last4 is null
    or v_observation.code_last4 is null
    or v_attempt.payer_code_last4 <> v_observation.code_last4 then
    raise exception 'wallet observation does not match payment identity';
  end if;

  update public.wallet_observations
  set verification_status = 'verified'
  where id = v_observation.id;
  update public.payment_attempts
  set status = 'authorized',
      provider_reference = 'wallet_observation:' || v_observation.id::text,
      observed_wallet_observation_id = v_observation.id
  where id = v_attempt.id;
  return true;
end;
$$;

revoke execute on function public.submit_payment_evidence(uuid, text, text)
  from public;
grant execute on function public.submit_payment_evidence(uuid, text, text)
  to anon, authenticated;

revoke execute on function public.list_wallet_payment_candidates(uuid)
  from public, anon;
grant execute on function public.list_wallet_payment_candidates(uuid)
  to authenticated;

revoke execute on function public.verify_wallet_payment(uuid, uuid)
  from public, anon;
grant execute on function public.verify_wallet_payment(uuid, uuid)
  to authenticated;

comment on function public.submit_payment_evidence(uuid, text, text)
  is 'Binds a customer-entered wallet operation/security code to the pending attempt; stores only its last four characters.';
