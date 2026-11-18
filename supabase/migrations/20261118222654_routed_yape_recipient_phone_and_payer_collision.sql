-- El número de cobro pertenece a la versión exacta del QR. Un cambio de destino
-- requiere registrar su propio número y no altera los pedidos previos.
create table private.wallet_observer_route_phones (
  route_id uuid not null references private.wallet_observer_routes(id) on delete cascade,
  route_version uuid not null,
  phone text not null check (phone ~ '^9[0-9]{8}$'),
  primary key (route_id, route_version)
);

alter table private.wallet_observer_route_phones enable row level security;
revoke all on private.wallet_observer_route_phones from public, anon, authenticated;

create function public.get_payment_receiver_phone(
  p_order_id uuid, p_guest_access_token text default null
)
returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  v_phone text;
begin
  perform private.require_payment_actor(p_order_id, p_guest_access_token);
  select phone.phone into v_phone
  from public.payment_attempts pa
  join private.wallet_observer_route_phones phone
    on phone.route_id = pa.observer_route_id and phone.route_version = pa.observer_route_version
  where pa.order_id = p_order_id and pa.method = 'yape' and pa.status = 'pending'
    and pa.expires_at > now()
  order by pa.created_at desc limit 1;
  return v_phone;
end;
$$;

revoke all on function public.get_payment_receiver_phone(uuid, text) from public, anon, authenticated;
grant execute on function public.get_payment_receiver_phone(uuid, text) to anon, authenticated;

-- La autorización del pago y la cancelación comparten el bloqueo del pedido.
create function public.cancel_unpaid_order_with_code(target_order uuid, supplied_code text)
returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.orders o
  where o.id = target_order and o.customer_id = (select auth.uid())
    and o.status = 'pending_payment' and o.payment_method <> 'cash'
  for update;
  if not found then return false; end if;

  if exists (select 1 from public.payment_attempts pa
    where pa.order_id = target_order and pa.status = 'authorized') then return false; end if;
  return public.cancel_order_with_code(target_order, supplied_code);
end;
$$;

revoke all on function public.cancel_unpaid_order_with_code(uuid, text) from public, anon, authenticated;
grant execute on function public.cancel_unpaid_order_with_code(uuid, text) to authenticated;

create or replace function private.settle_routed_wallet_observation(
  p_observation_id uuid, p_expected_attempt_id uuid default null, p_manual boolean default false
)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_obs public.wallet_observations%rowtype;
  v_order public.orders%rowtype;
  v_attempt public.payment_attempts%rowtype;
  v_ids uuid[];
  v_payer text;
  v_code_only boolean := false;
  v_saved uuid;
  v_collision_names text[];
begin
  -- Si una declaración y un abono llegan a la vez, el siguiente sondeo reintenta.
  select * into v_obs from public.wallet_observations o
  where o.id = p_observation_id and o.verification_status in ('unverified', 'under_review')
  for update skip locked;
  if not found or v_obs.observer_route_id is null or v_obs.currency <> 'PEN' then return false; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_obs.observer_route_id::text, 1));

  if not p_manual then
    if v_obs.observed_at < now() - interval '15 minutes' or v_obs.observed_at > clock_timestamp()
      or not exists (
        select 1 from public.wallet_observer_devices d
        where d.id = v_obs.device_id and d.active and d.auto_settle_orders
      ) then return false; end if;

    v_payer := private.normalize_person_name(v_obs.sender_name);
    v_code_only := v_payer = '' and v_obs.provider = 'yape'
      and v_obs.code_hmac is not null and v_obs.code_last4 ~ '^[0-9]{3}$';
    if not v_code_only and v_payer not like '% %' then return false; end if;

    -- Un código corto repetido o varios pedidos con el mismo monto requieren revisión.
    if v_code_only and exists (
      select 1 from public.wallet_observations candidate
      where candidate.id <> v_obs.id and candidate.observer_route_id = v_obs.observer_route_id
        and candidate.observer_route_version = v_obs.observer_route_version
        and candidate.provider = 'yape' and candidate.currency = v_obs.currency
        and candidate.amount_cents = v_obs.amount_cents and candidate.code_hmac = v_obs.code_hmac
        and candidate.observed_at between v_obs.observed_at - interval '30 minutes' and v_obs.observed_at + interval '30 minutes'
    ) then return false; end if;

    -- Un código declarado tiene prioridad sobre la coincidencia por nombre.
    select array_agg(pa.id) into v_ids
    from public.payment_attempts pa join public.orders o on o.id = pa.order_id
    where o.restaurant_id = v_obs.restaurant_id and o.status = 'pending_payment'
      and pa.provider = 'wallet_observer' and pa.status = 'pending'
      and pa.observer_route_id = v_obs.observer_route_id
      and pa.observer_route_version = v_obs.observer_route_version
      and pa.method::text = v_obs.provider and pa.amount_cents = v_obs.amount_cents
      and v_obs.observed_at between pa.created_at and pa.expires_at
      and pa.expires_at > now()
      and (
        (v_code_only and pa.payment_declared_at is not null and pa.payer_code_hmac = v_obs.code_hmac)
        or (not v_code_only and (
          private.normalize_person_name(o.customer_name) = v_payer
          or (pa.payer_code_hmac = v_obs.code_hmac and private.normalize_person_name(pa.payer_display_name) = v_payer)
        ))
      )
      and (pa.payer_code_hmac is null or pa.payer_code_hmac = v_obs.code_hmac);

    if coalesce(cardinality(v_ids), 0) <> 1 then
      -- Si hay homónimos, solo una declaración con el mismo código puede decidir.
      select array_agg(pa.id) into v_ids from public.payment_attempts pa
      where pa.id = any(v_ids) and pa.payer_code_hmac = v_obs.code_hmac;
    end if;
    if coalesce(cardinality(v_ids), 0) <> 1 then return false; end if;

    if v_code_only and exists (
      select 1 from public.payment_attempts other
      where other.id <> v_ids[1] and other.observer_route_id = v_obs.observer_route_id
        and other.observer_route_version = v_obs.observer_route_version
        and other.amount_cents = v_obs.amount_cents and other.status = 'pending'
        and v_obs.observed_at between other.created_at and other.expires_at
    ) then return false; end if;
  else
    v_ids := array[p_expected_attempt_id];
  end if;

  if p_expected_attempt_id is not null and v_ids[1] <> p_expected_attempt_id then return false; end if;

  select o.* into v_order from public.orders o join public.payment_attempts pa on pa.order_id = o.id
  where pa.id = v_ids[1] and o.status = 'pending_payment' and o.restaurant_id = v_obs.restaurant_id
  for update of o skip locked;
  if not found then return false; end if;

  select pa.* into v_attempt from public.payment_attempts pa
  where pa.id = v_ids[1] and pa.order_id = v_order.id and pa.status = 'pending'
    and pa.provider = 'wallet_observer' and pa.observer_route_id = v_obs.observer_route_id
    and pa.observer_route_version = v_obs.observer_route_version and pa.method::text = v_obs.provider
    and pa.amount_cents = v_obs.amount_cents
    and (not v_code_only or pa.payer_code_hmac = v_obs.code_hmac)
    and v_obs.observed_at >= pa.created_at
    and (p_manual or (v_obs.observed_at <= pa.expires_at and pa.expires_at > now()))
  for update skip locked;
  if not found then return false; end if;

  -- Un código repetido exige un nombre explícito que identifique a un solo abono.
  if not p_manual and not v_code_only and v_obs.provider = 'yape'
    and v_obs.code_hmac is not null and v_obs.code_last4 ~ '^[0-9]{3}$' then
    select array_agg(coalesce(private.normalize_person_name(other.sender_name), ''))
      into v_collision_names
    from public.wallet_observations other
    join public.wallet_observer_devices d on d.id = other.device_id and d.active and d.auto_settle_orders
    where other.id <> v_obs.id and other.observer_route_id = v_obs.observer_route_id
      and other.observer_route_version = v_obs.observer_route_version
      and other.provider = 'yape' and other.currency = v_obs.currency
      and other.amount_cents = v_obs.amount_cents and other.code_hmac = v_obs.code_hmac
      and other.code_last4 ~ '^[0-9]{3}$'
      and other.verification_status in ('unverified', 'under_review')
      and other.observed_at between greatest(v_attempt.created_at, now() - interval '15 minutes')
        and least(v_attempt.expires_at, clock_timestamp());
    if coalesce(cardinality(v_collision_names), 0) > 0 and (
      v_attempt.payer_code_hmac is distinct from v_obs.code_hmac
      or private.normalize_person_name(v_attempt.payer_display_name) is distinct from v_payer
      or exists (select 1 from unnest(v_collision_names) peer(name) where peer.name = v_payer or peer.name not like '% %')
    ) then return false; end if;
  end if;

  -- Ante posibles reemisiones con otro ID de Android, los casos dudosos pasan a Caja.
  if not p_manual and exists (
    select 1 from private.wallet_observer_settlements s
    join public.wallet_observations previous on previous.id = s.observation_id
    where s.route_id = v_obs.observer_route_id
      and previous.amount_cents = v_obs.amount_cents
      and previous.observed_at between v_obs.observed_at - interval '15 minutes' and v_obs.observed_at + interval '15 minutes'
      and (v_code_only or private.normalize_person_name(previous.sender_name) = v_payer)
      and (v_obs.code_hmac is null or previous.code_hmac is null or previous.code_hmac = v_obs.code_hmac)
  ) then return false; end if;

  insert into private.wallet_observer_settlements (observation_id, payment_attempt_id, route_id, event_id)
  values (v_obs.id, v_attempt.id, v_obs.observer_route_id, v_obs.event_id)
  on conflict do nothing returning observation_id into v_saved;
  if v_saved is null then return false; end if;

  perform set_config('suya.operator_cashier_verification', '1', true);
  update public.payment_attempts
  set status = 'authorized', observed_wallet_observation_id = v_obs.id,
      provider_reference = 'observer_push:' || v_obs.id::text, updated_at = now(), failure_code = null
  where id = v_attempt.id;
  perform set_config('suya.operator_cashier_verification', '0', true);

  update public.wallet_observations set verification_status = 'verified' where id = v_obs.id;
  if p_manual then
    perform private.audit_observer_routing(v_obs.restaurant_id, 'UPDATE',
      jsonb_build_object('observation_id', v_obs.id, 'payment_attempt_id', v_attempt.id, 'change', 'cashier_verified'));
  end if;
  return true;
end;
$$;

create or replace function public.verify_routed_yape_code(
  p_order_id uuid, p_code text, p_payer_display_name text default null,
  p_guest_access_token text default null
)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_attempt public.payment_attempts%rowtype;
  v_code_hmac text;
  v_candidate_count bigint;
  v_matching_count bigint;
begin
  perform private.require_payment_actor(p_order_id, p_guest_access_token);
  if p_code is null or p_code !~ '^[0-9]{3}$' then raise exception 'invalid Yape code'; end if;
  perform 1 from public.orders where id = p_order_id for update;

  select * into v_attempt from public.payment_attempts
  where order_id = p_order_id and observer_route_id is not null and method = 'yape'
  order by created_at desc limit 1 for update;
  if not found then raise exception 'routed Yape attempt not found'; end if;
  if v_attempt.status = 'authorized' then return 'authorized'; end if;
  if v_attempt.status <> 'pending' or v_attempt.expires_at <= now() then return 'expired'; end if;

  begin
    perform public.declare_manual_payment(p_order_id, p_code, p_payer_display_name, p_guest_access_token);
  exception when raise_exception then
    if sqlerrm = 'SUYA_YAPE_RETRY_LIMIT' then return 'retry_limit'; end if;
    if sqlerrm = 'SUYA_YAPE_CLOSED' then return 'expired'; end if;
    raise;
  end;

  if exists (select 1 from public.payment_attempts where id = v_attempt.id and status = 'authorized') then
    return 'authorized';
  end if;

  v_code_hmac := private.payment_claim_hmac(p_code);
  select count(*), count(*) filter (where o.code_hmac = v_code_hmac)
    into v_candidate_count, v_matching_count
  from public.wallet_observations o
  join public.wallet_observer_devices d on d.id = o.device_id and d.active and d.auto_settle_orders
  where o.observer_route_id = v_attempt.observer_route_id
    and o.observer_route_version = v_attempt.observer_route_version
    and o.provider = 'yape' and o.currency = 'PEN'
    and o.amount_cents = v_attempt.amount_cents
    and o.code_hmac is not null and o.code_last4 ~ '^[0-9]{3}$'
    and o.verification_status in ('unverified','under_review')
    and o.observed_at between greatest(v_attempt.created_at, now() - interval '15 minutes')
      and least(v_attempt.expires_at, clock_timestamp());

  if v_matching_count > 1 and coalesce(private.normalize_person_name(p_payer_display_name), '') not like '% %' then
    return 'name_required';
  end if;
  if v_matching_count > 0 then return 'review'; end if;
  if v_candidate_count = 1 and not exists (
    select 1 from public.payment_attempts other
    where other.id <> v_attempt.id and other.observer_route_id = v_attempt.observer_route_id
      and other.observer_route_version = v_attempt.observer_route_version
      and other.method = 'yape' and other.amount_cents = v_attempt.amount_cents
      and other.status = 'pending' and other.expires_at > v_attempt.created_at
      and other.created_at <= v_attempt.expires_at
  ) then return 'code_mismatch'; end if;
  if v_candidate_count > 0 then return 'review'; end if;
  return 'unobserved';
end;
$$;

revoke all on function public.verify_routed_yape_code(uuid,text,text,text) from public;
grant execute on function public.verify_routed_yape_code(uuid,text,text,text) to anon, authenticated;
