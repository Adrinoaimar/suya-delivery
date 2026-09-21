-- Manual wallet approval by payer name.
-- A typed name is never sufficient by itself: the notification sender, receiver,
-- provider, amount, time window and one unique pending order must all agree.

create or replace function private.normalize_wallet_person_name(p_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(
    translate(
      lower(regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g')),
      'áéíóúüñ',
      'aeiouun'
    ),
    ''
  );
$$;

revoke all on function private.normalize_wallet_person_name(text) from public, anon, authenticated;

create or replace function public.verify_wallet_payment_by_name(
  p_observation_id uuid,
  p_payer_name text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_observation public.wallet_observations%rowtype;
  v_attempt public.payment_attempts%rowtype;
  v_order_status public.order_status;
  v_payer_name text := private.normalize_wallet_person_name(p_payer_name);
  v_sender_name text;
  v_attempt_id uuid;
  v_matching_attempts bigint := 0;
begin
  if p_observation_id is null or v_payer_name is null
    or length(v_payer_name) < 2 or length(v_payer_name) > 120 then
    raise exception 'invalid payer name';
  end if;

  select * into v_observation
  from public.wallet_observations
  where id = p_observation_id
  for update;
  if not found then raise exception 'wallet observation not found'; end if;
  if not (
    private.is_platform_admin()
    or private.has_restaurant_role(
      v_observation.restaurant_id,
      array['owner', 'manager']::public.restaurant_role[]
    )
  ) then
    raise exception 'not authorized';
  end if;

  v_sender_name := private.normalize_wallet_person_name(v_observation.sender_name);
  if v_observation.verification_status not in ('unverified', 'under_review')
    or v_observation.provider not in ('yape', 'lemon')
    or v_observation.currency <> 'PEN'
    or v_sender_name is null
    or v_sender_name <> v_payer_name then
    raise exception 'payer name does not match wallet observation';
  end if;

  select count(*) into v_matching_attempts
  from public.payment_attempts pa
  join public.orders o on o.id = pa.order_id
  where o.restaurant_id = v_observation.restaurant_id
    and o.status not in ('cancelled', 'delivered')
    and pa.provider = 'wallet_observer'
    and pa.status = 'pending'
    and pa.method::text = v_observation.provider
    and ((pa.receiver_account_id is not null and pa.receiver_account_id = v_observation.receiver_account_id)
      or (pa.receiver_account_id is null and v_observation.receiver_account_id is null))
    and round(pa.amount * 100) = v_observation.amount_cents
    and pa.created_at <= v_observation.observed_at
    and (
      pa.expires_at >= v_observation.observed_at
      or (
        pa.payment_declared_at is not null
        and pa.payment_declared_at <= pa.expires_at
        and v_observation.observed_at <= pa.expires_at + interval '24 hours'
      )
    )
    -- The typed name must match the notification sender. It is persisted on
    -- the attempt below; the order customer name is not a reliable payer
    -- identity for a wallet transfer.
    ;

  if v_matching_attempts <> 1 then
    raise exception 'payment identity is ambiguous; choose the operation code';
  end if;

  select pa.id into v_attempt_id
  from public.payment_attempts pa
  join public.orders o on o.id = pa.order_id
  where o.restaurant_id = v_observation.restaurant_id
    and o.status not in ('cancelled', 'delivered')
    and pa.provider = 'wallet_observer'
    and pa.status = 'pending'
    and pa.method::text = v_observation.provider
    and ((pa.receiver_account_id is not null and pa.receiver_account_id = v_observation.receiver_account_id)
      or (pa.receiver_account_id is null and v_observation.receiver_account_id is null))
    and round(pa.amount * 100) = v_observation.amount_cents
    and pa.created_at <= v_observation.observed_at
    and (
      pa.expires_at >= v_observation.observed_at
      or (
        pa.payment_declared_at is not null
        and pa.payment_declared_at <= pa.expires_at
        and v_observation.observed_at <= pa.expires_at + interval '24 hours'
      )
    )

  limit 1;

  select * into v_attempt
  from public.payment_attempts
  where id = v_attempt_id
  for update;
  select status into v_order_status from public.orders where id = v_attempt.order_id;
  if v_order_status in ('cancelled', 'delivered') then
    raise exception 'cancelled order cannot be verified';
  end if;

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
  return true;
end;
$$;

revoke all on function public.verify_wallet_payment_by_name(uuid, text) from public, anon;
grant execute on function public.verify_wallet_payment_by_name(uuid, text) to authenticated;

comment on function public.verify_wallet_payment_by_name(uuid, text)
  is 'Manual approval by exact notification payer name; requires one unique pending attempt with matching receiver, method, amount and time window.';
