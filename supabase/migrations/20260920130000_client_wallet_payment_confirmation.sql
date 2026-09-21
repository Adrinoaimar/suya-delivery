-- Client confirmation for manual wallet payments.
-- The client can declare the payer name, but authorization only happens when
-- one observer event matches the receiver, wallet, amount and time window.

create or replace function public.confirm_manual_wallet_payment(
  p_order_id uuid,
  p_payer_name text,
  p_guest_access_token text default null
)
returns table (
  confirmation_status text,
  payment_attempt_id uuid,
  observation_id uuid,
  observed_at timestamptz,
  payer_display_name text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_attempt public.payment_attempts%rowtype;
  v_observation public.wallet_observations%rowtype;
  v_guest_ok boolean := false;
  v_payer_name text := private.normalize_wallet_person_name(p_payer_name);
  v_matching_observations bigint := 0;
begin
  if p_order_id is null or v_payer_name is null
    or length(v_payer_name) < 2 or length(v_payer_name) > 120 then
    raise exception 'valid payer name is required';
  end if;

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

  select * into v_attempt
  from public.payment_attempts pa
  where pa.order_id = v_order.id
  order by pa.created_at desc
  limit 1
  for update;
  if not found then raise exception 'payment attempt not found'; end if;
  if v_attempt.method not in ('yape', 'lemon') then
    raise exception 'confirmation is only valid for wallet payments';
  end if;

  if v_attempt.status = 'authorized' then
    select * into v_observation
    from public.wallet_observations wo
    where wo.id = v_attempt.observed_wallet_observation_id;
    return query select
      'authorized'::text,
      v_attempt.id,
      v_observation.id,
      v_observation.observed_at,
      coalesce(v_observation.sender_name, v_attempt.payer_display_name);
    return;
  end if;
  if v_attempt.status <> 'pending' then
    raise exception 'payment attempt is no longer pending';
  end if;

  -- Stores the declaration and payer name for late/manual review as well.
  perform public.declare_manual_payment(
    p_order_id,
    null,
    p_payer_name,
    p_guest_access_token
  );

  select count(*) into v_matching_observations
  from public.wallet_observations wo
  where wo.restaurant_id = v_order.restaurant_id
    and wo.verification_status in ('unverified', 'under_review')
    and wo.provider = v_attempt.method::text
    and wo.currency = 'PEN'
    and ((v_attempt.receiver_account_id is not null and wo.receiver_account_id = v_attempt.receiver_account_id)
      or (v_attempt.receiver_account_id is null and wo.receiver_account_id is null))
    and round(v_attempt.amount * 100) = wo.amount_cents
    and private.normalize_wallet_person_name(wo.sender_name) = v_payer_name
    and v_attempt.created_at <= wo.observed_at
    and v_attempt.expires_at >= wo.observed_at;

  if v_matching_observations = 0 then
    return query select
      'pending'::text,
      v_attempt.id,
      null::uuid,
      null::timestamptz,
      p_payer_name;
    return;
  end if;
  if v_matching_observations <> 1 then
    return query select
      'ambiguous'::text,
      v_attempt.id,
      null::uuid,
      null::timestamptz,
      p_payer_name;
    return;
  end if;

  select * into v_observation
  from public.wallet_observations wo
  where wo.restaurant_id = v_order.restaurant_id
    and wo.verification_status in ('unverified', 'under_review')
    and wo.provider = v_attempt.method::text
    and wo.currency = 'PEN'
    and ((v_attempt.receiver_account_id is not null and wo.receiver_account_id = v_attempt.receiver_account_id)
      or (v_attempt.receiver_account_id is null and wo.receiver_account_id is null))
    and round(v_attempt.amount * 100) = wo.amount_cents
    and private.normalize_wallet_person_name(wo.sender_name) = v_payer_name
    and v_attempt.created_at <= wo.observed_at
    and v_attempt.expires_at >= wo.observed_at
  limit 1
  for update;

  update public.wallet_observations
  set verification_status = 'verified'
  where id = v_observation.id;

  update public.payment_attempts
  set status = 'authorized',
      payer_display_name = v_observation.sender_name,
      provider_reference = 'wallet_observation:' || v_observation.id::text,
      observed_wallet_observation_id = v_observation.id,
      updated_at = now()
  where id = v_attempt.id;

  return query select
    'authorized'::text,
    v_attempt.id,
    v_observation.id,
    v_observation.observed_at,
    v_observation.sender_name;
end;
$$;

revoke all on function public.confirm_manual_wallet_payment(uuid, text, text) from public;
grant execute on function public.confirm_manual_wallet_payment(uuid, text, text) to anon, authenticated;

comment on function public.confirm_manual_wallet_payment(uuid, text, text)
  is 'Client confirmation records payer name and authorizes only one matching observed wallet event within the attempt time window.';
