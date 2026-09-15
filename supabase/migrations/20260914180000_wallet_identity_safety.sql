-- Wallet observations may reconcile only manual wallet attempts.
-- If the full operation code is unavailable, never choose between two
-- same-amount candidates using the last four characters alone.

drop function if exists public.list_wallet_payment_candidates(uuid);

create function public.list_wallet_payment_candidates(p_observation_id uuid)
returns table (
  payment_attempt_id uuid,
  order_id uuid,
  order_code text,
  customer_name text,
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
  select pa.id, o.id, o.code, o.customer_name, pa.checkout_reference, pa.method, pa.amount,
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
    and pa.provider = 'wallet_observer'
    and pa.method::text = wo.provider
    and pa.status = 'pending'
    and round(pa.amount * 100) = wo.amount_cents
    and pa.created_at <= wo.observed_at
    and pa.expires_at >= wo.observed_at
    and (
      (pa.payer_code_digest is not null and wo.code_fingerprint is not null
        and pa.payer_code_digest = wo.code_fingerprint)
      or (
        (pa.payer_code_digest is null or wo.code_fingerprint is null)
        and pa.payer_code_last4 is not null and wo.code_last4 is not null
        and pa.payer_code_last4 = wo.code_last4
      )
    )
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
  v_matching_attempts bigint := 0;
begin
  select * into v_observation from public.wallet_observations where id = p_observation_id for update;
  if not found then raise exception 'wallet observation not found'; end if;
  if not (private.is_platform_admin() or private.has_restaurant_role(
    v_observation.restaurant_id, array['owner', 'manager']::public.restaurant_role[]
  )) then raise exception 'not authorized'; end if;

  select pa.* into v_attempt
  from public.payment_attempts pa
  join public.orders o on o.id = pa.order_id
  where pa.id = p_payment_attempt_id and o.restaurant_id = v_observation.restaurant_id
  for update;
  if not found then raise exception 'payment attempt not found'; end if;
  if v_observation.verification_status not in ('unverified', 'under_review')
    or v_observation.provider not in ('yape', 'lemon')
    or v_observation.currency <> 'PEN'
    or v_attempt.provider <> 'wallet_observer'
    or round(v_attempt.amount * 100) <> v_observation.amount_cents
    or v_attempt.method::text <> v_observation.provider
    or v_attempt.status <> 'pending'
    or v_attempt.expires_at < v_observation.observed_at
    or v_observation.code_last4 is null
    or (
      v_attempt.payer_code_digest is not null and v_observation.code_fingerprint is not null
      and v_attempt.payer_code_digest <> v_observation.code_fingerprint
    )
    or (
      (v_attempt.payer_code_digest is null or v_observation.code_fingerprint is null)
      and (v_attempt.payer_code_last4 is null or v_attempt.payer_code_last4 <> v_observation.code_last4)
    ) then
    raise exception 'wallet observation does not match payment identity';
  end if;

  -- A suffix-only match is acceptable only when it identifies one pending
  -- manual-wallet attempt in the same restaurant, amount and time window.
  if v_attempt.payer_code_digest is null or v_observation.code_fingerprint is null then
    select count(*) into v_matching_attempts
    from public.payment_attempts pa
    join public.orders o on o.id = pa.order_id
    where o.restaurant_id = v_observation.restaurant_id
      and pa.provider = 'wallet_observer'
      and pa.method::text = v_observation.provider
      and pa.status = 'pending'
      and round(pa.amount * 100) = v_observation.amount_cents
      and pa.created_at <= v_observation.observed_at
      and pa.expires_at >= v_observation.observed_at
      and pa.payer_code_last4 = v_observation.code_last4;
    if v_matching_attempts > 1 then
      raise exception 'payment identity is ambiguous; full operation code required';
    end if;
  end if;

  update public.wallet_observations set verification_status = 'verified' where id = v_observation.id;
  update public.payment_attempts
  set status = 'authorized',
      provider_reference = 'wallet_observation:' || v_observation.id::text,
      observed_wallet_observation_id = v_observation.id,
      updated_at = now()
  where id = v_attempt.id;
  return true;
end;
$$;

revoke execute on function public.list_wallet_payment_candidates(uuid) from public, anon;
grant execute on function public.list_wallet_payment_candidates(uuid) to authenticated;
revoke execute on function public.verify_wallet_payment(uuid, uuid) from public, anon;
grant execute on function public.verify_wallet_payment(uuid, uuid) to authenticated;

comment on function public.verify_wallet_payment(uuid, uuid)
  is 'Verifies one manual wallet attempt; suffix-only identity is rejected when ambiguous.';
