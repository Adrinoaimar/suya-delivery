-- A wallet notification cannot authorize a payment attempt created after it.
-- Keep this check in the final verification RPC as well as in candidate lookup,
-- because the RPC is callable directly by an authenticated backoffice user.

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
    or v_attempt.created_at > v_observation.observed_at
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

comment on function public.verify_wallet_payment(uuid, uuid)
  is 'Verifies one manual wallet attempt with exact identity and notification time bounds.';
