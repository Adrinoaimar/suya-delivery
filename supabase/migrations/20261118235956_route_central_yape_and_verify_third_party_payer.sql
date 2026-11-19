-- Cada intento conserva local, código y referencia propios. Solo comparte el receptor Yape.
create table private.central_yape_checkout (
  restaurant_id uuid primary key references public.restaurants(id) on delete cascade,
  collector_id uuid not null references public.restaurants(id),
  check (restaurant_id <> collector_id)
);
alter table private.central_yape_checkout enable row level security;
revoke all on private.central_yape_checkout from public, anon, authenticated;

create or replace function private.pick_wallet_observer_route(p_restaurant_id uuid, p_provider text)
returns private.wallet_observer_routes language sql security definer set search_path = '' as $$
  select r.*
  from (select p_restaurant_id as target) request
  left join private.central_yape_checkout c on c.restaurant_id = request.target
  join private.wallet_observer_routes r on r.restaurant_id = coalesce(c.collector_id, request.target)
  join private.wallet_observer_slots s on s.restaurant_id = r.restaurant_id and s.priority = r.priority
  join public.wallet_observer_devices d on d.id = s.device_id and d.restaurant_id = s.restaurant_id
  where r.provider = p_provider and private.wallet_route_health(r, d) = 'ready'
    and (c.collector_id is null or (p_provider = 'yape' and r.priority = 1
      and d.auto_settle_orders and private.observer_checkout_enabled(c.collector_id)))
  order by r.priority
  limit 1
$$;

create function private.wallet_sender_name_for_match(p_name text)
returns text language sql immutable set search_path = '' as $$
  select case
    when p_name ~ '[*…•]' then null
    else nullif(private.normalize_person_name(p_name), '')
  end
$$;
revoke all on function private.wallet_sender_name_for_match(text) from public, anon, authenticated;

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
  v_shared_yape boolean;
  v_requires_code boolean;
begin
  -- Si una declaración y un abono llegan a la vez, el siguiente sondeo reintenta.
  select * into v_obs from public.wallet_observations o
  where o.id = p_observation_id and o.verification_status in ('unverified', 'under_review')
  for update skip locked;
  if not found or v_obs.observer_route_id is null or v_obs.currency <> 'PEN' then return false; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_obs.observer_route_id::text, 1));

  -- La atribución comercial proviene del pedido, no de la notificación del receptor.
  -- Conserva esta vinculación aunque más tarde se pause el checkout del comercio.
  v_shared_yape := v_obs.provider = 'yape' and exists (
    select 1 from private.wallet_observer_routes r where r.id = v_obs.observer_route_id
      and r.restaurant_id = v_obs.restaurant_id and r.priority = 1
  );
  v_requires_code := v_shared_yape and (
    exists (select 1 from private.central_yape_checkout c where c.collector_id = v_obs.restaurant_id)
    or exists (
      select 1 from public.payment_attempts pa join public.orders o on o.id = pa.order_id
      where pa.observer_route_id = v_obs.observer_route_id
        and pa.observer_route_version = v_obs.observer_route_version and o.restaurant_id <> v_obs.restaurant_id
    )
  );

  if not p_manual then
    if v_obs.observed_at < now() - interval '15 minutes' or v_obs.observed_at > clock_timestamp()
      or not exists (
        select 1 from public.wallet_observer_devices d
        where d.id = v_obs.device_id and d.active and d.auto_settle_orders
      ) then return false; end if;

    v_payer := private.wallet_sender_name_for_match(v_obs.sender_name);
    v_code_only := nullif(btrim(v_obs.sender_name), '') is null and v_obs.provider = 'yape'
      and v_obs.code_hmac is not null and v_obs.code_last4 ~ '^[0-9]{3}$';
    if not v_code_only and coalesce(v_payer, '') not like '% %' then return false; end if;

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
    where (o.restaurant_id = v_obs.restaurant_id or v_shared_yape) and o.status = 'pending_payment'
      and pa.provider = 'wallet_observer' and pa.status = 'pending'
      and pa.observer_route_id = v_obs.observer_route_id
      and pa.observer_route_version = v_obs.observer_route_version
      and pa.method::text = v_obs.provider and pa.amount_cents = v_obs.amount_cents
      and v_obs.observed_at between pa.created_at and pa.expires_at
      and pa.expires_at > now()
      -- En una cuenta compartida, el nombre por sí solo no vincula un abono con un local.
      and (not v_requires_code or (pa.payment_declared_at is not null
        and pa.payer_code_hmac = v_obs.code_hmac and v_obs.code_last4 ~ '^[0-9]{3}$'))
      and (
        (v_code_only and pa.payment_declared_at is not null and pa.payer_code_hmac = v_obs.code_hmac)
        or (not v_code_only and (
          private.wallet_sender_name_for_match(o.customer_name) = v_payer
          or (pa.payer_code_hmac = v_obs.code_hmac and private.wallet_sender_name_for_match(pa.payer_display_name) = v_payer)
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
  where pa.id = v_ids[1] and o.status = 'pending_payment'
    and (o.restaurant_id = v_obs.restaurant_id or v_shared_yape)
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
    select array_agg(coalesce(private.wallet_sender_name_for_match(other.sender_name), ''))
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
      or private.wallet_sender_name_for_match(v_attempt.payer_display_name) is distinct from v_payer
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
  v_named_count bigint;
  v_distinct_names bigint;
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
  select count(*), count(*) filter (where o.code_hmac = v_code_hmac),
    count(*) filter (where o.code_hmac = v_code_hmac and evidence.payer like '% %'),
    count(distinct evidence.payer) filter (where o.code_hmac = v_code_hmac and evidence.payer like '% %')
    into v_candidate_count, v_matching_count, v_named_count, v_distinct_names
  from public.wallet_observations o
  join public.wallet_observer_devices d on d.id = o.device_id and d.active and d.auto_settle_orders
  cross join lateral (select private.wallet_sender_name_for_match(o.sender_name) as payer) evidence
  where o.observer_route_id = v_attempt.observer_route_id
    and o.observer_route_version = v_attempt.observer_route_version
    and o.provider = 'yape' and o.currency = 'PEN'
    and o.amount_cents = v_attempt.amount_cents
    and o.code_hmac is not null and o.code_last4 ~ '^[0-9]{3}$'
    and o.verification_status in ('unverified','under_review')
    and o.observed_at between greatest(v_attempt.created_at, now() - interval '15 minutes')
      and least(v_attempt.expires_at, clock_timestamp());

  if v_matching_count > 0 and v_matching_count = v_named_count
    and (v_matching_count = 1 or v_distinct_names > 1)
    and coalesce(private.wallet_sender_name_for_match(p_payer_display_name), '') not like '% %' then
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

create function public.list_wallet_payment_candidates_with_store(p_observation_id uuid)
returns table (
  payment_attempt_id uuid, order_id uuid, order_code text, customer_name text,
  checkout_reference text, method public.payment_method, amount numeric, restaurant_name text,
  created_at timestamptz, expires_at timestamptz, sender_name text
)
language plpgsql security definer set search_path = '' as $$
begin
  return query
  select pa.id, o.id, o.code, o.customer_name, pa.checkout_reference, pa.method,
    pa.amount, r.name, pa.created_at, pa.expires_at, wo.sender_name
  from public.wallet_observations wo
  join public.payment_attempts pa on
    (wo.observer_route_id is null and pa.observer_route_id is null)
    or (pa.observer_route_id = wo.observer_route_id and pa.observer_route_version = wo.observer_route_version)
  join public.orders o on pa.order_id = o.id
  join public.restaurants r on r.id = o.restaurant_id
  where wo.id = p_observation_id
    and (private.is_platform_admin() or private.has_restaurant_role(wo.restaurant_id, array['owner', 'manager']::public.restaurant_role[]))
    and wo.verification_status in ('unverified', 'under_review')
    and wo.provider in ('yape', 'lemon') and wo.currency = 'PEN'
    and pa.provider = 'wallet_observer' and pa.status = 'pending'
    and pa.method::text = wo.provider
    and round(pa.amount * 100) = wo.amount_cents and pa.created_at <= wo.observed_at
    and (
      (o.status = 'pending_payment' and wo.observer_route_id is not null and pa.observer_route_id = wo.observer_route_id
        and pa.observer_route_version = wo.observer_route_version)
      or (o.status not in ('cancelled', 'delivered') and wo.observer_route_id is null
        and o.restaurant_id = wo.restaurant_id
        and pa.observer_route_id is null and pa.receiver_account_id is not distinct from wo.receiver_account_id
        and pa.expires_at >= wo.observed_at
        and ((pa.payer_code_digest is not null and wo.code_fingerprint is not null and pa.payer_code_digest = wo.code_fingerprint)
          or ((pa.payer_code_digest is null or wo.code_fingerprint is null) and pa.payer_code_last4 = wo.code_last4)))
    )
  order by abs(extract(epoch from (wo.observed_at - pa.created_at))), pa.created_at desc;
end;
$$;

-- La Caja receptora puede ver la atribución de los abonos conciliados.
create function public.list_wallet_observation_orders(p_observation_ids uuid[])
returns table (observation_id uuid, order_code text, restaurant_name text)
language sql stable security definer set search_path = '' as $$
  select wo.id, o.code, r.name
  from private.wallet_observer_settlements s
  join public.wallet_observations wo on wo.id = s.observation_id
  join public.payment_attempts pa on pa.id = s.payment_attempt_id and pa.status = 'authorized'
  join public.orders o on o.id = pa.order_id
  join public.restaurants r on r.id = o.restaurant_id
  where wo.id = any(p_observation_ids) and cardinality(p_observation_ids) <= 100
    and wo.verification_status = 'verified'
    and (private.is_platform_admin()
      or private.has_restaurant_role(wo.restaurant_id, array['owner', 'manager']::public.restaurant_role[]))
$$;
revoke all on function public.list_wallet_payment_candidates_with_store(uuid),
  public.list_wallet_observation_orders(uuid[]) from public, anon, authenticated;
grant execute on function public.list_wallet_payment_candidates_with_store(uuid),
  public.list_wallet_observation_orders(uuid[]) to authenticated;

-- Caja puede cotejar y revisar también los reclamos cuyo receptor congelado le pertenece.
create or replace function public.list_expired_wallet_qr_claims(p_restaurant_id uuid)
returns table (
  attempt_id uuid, order_code text, method text, amount numeric,
  payer_name text, receipt_reference text, reported_at timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_wallet_route_admin(p_restaurant_id);
  return query
    select pa.id, o.code, pa.method::text, pa.amount, c.payer_name, c.receipt_reference, c.reported_at
    from private.expired_wallet_qr_claims c
    join public.payment_attempts pa on pa.id = c.payment_attempt_id
    join public.orders o on o.id = pa.order_id
    where (o.restaurant_id = p_restaurant_id or (pa.method = 'yape' and exists (
      select 1 from private.wallet_observer_routes route
      where route.id = pa.observer_route_id and route.restaurant_id = p_restaurant_id
    ))) and c.reviewed_at is null
    order by c.reported_at, pa.id
    limit 100;
end;
$$;

create or replace function public.review_expired_wallet_qr_claim(p_restaurant_id uuid, p_payment_attempt_id uuid)
returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_wallet_route_admin(p_restaurant_id);
  update private.expired_wallet_qr_claims c
  set reviewed_at = coalesce(c.reviewed_at, now()),
      reviewed_by = coalesce(c.reviewed_by, (select auth.uid()))
  from public.payment_attempts pa join public.orders o on o.id = pa.order_id
  where c.payment_attempt_id = p_payment_attempt_id and pa.id = c.payment_attempt_id
    and (o.restaurant_id = p_restaurant_id or (pa.method = 'yape' and exists (
      select 1 from private.wallet_observer_routes route
      where route.id = pa.observer_route_id and route.restaurant_id = p_restaurant_id
    )));
  return found;
end;
$$;

-- Activación de los locales gastronómicos incorporados. Los locales cerrados conservan
-- su estado comercial. En una base vacía la activación se difiere hasta configurar Caja.
do $$
declare
  v_collector uuid;
  v_primary private.wallet_observer_routes%rowtype;
  v_targets uuid[];
begin
  select array_agg(id) into v_targets from public.restaurants where active
    and slug in ('anda-paya', 'donde-joel', 'la-waka', 'tio-jhony', 'kfc', 'papa-johns');
  if v_targets is null then return; end if;

  select r.id into v_collector from public.restaurants r where r.slug = 'anda-paya-cevicheria' and r.active;
  if not found then return; end if;
  select r.* into v_primary from private.wallet_observer_routes r
  where r.restaurant_id = v_collector and r.priority = 1 and r.provider = 'yape'
    and r.enabled and r.tested_at is not null and r.recipient = 'Adriano Aimar Baca Navarro';
  if v_primary.id is null
    or not private.observer_checkout_enabled(v_collector)
    or not exists (
      select 1 from private.wallet_observer_slots s join public.wallet_observer_devices d on d.id = s.device_id
      where s.restaurant_id = v_collector and s.priority = 1 and d.active and d.auto_settle_orders
    ) then
    raise exception 'No se encontró el QR principal de Adriano listo en Suya Caja.';
  end if;

  if exists (
    select 1 from public.orders o join public.payment_attempts pa on pa.order_id = o.id
    where o.restaurant_id = any(v_targets) and pa.provider in ('static_qr', 'wallet_observer')
      and pa.method in ('yape', 'lemon') and pa.status = 'pending' and pa.expires_at > now()
  ) then raise exception 'Hay cobros previos vigentes en los comercios que van a usar la caja central.'; end if;

  insert into private.central_yape_checkout (restaurant_id, collector_id)
  select unnest(v_targets), v_collector
  on conflict (restaurant_id) do update set collector_id = excluded.collector_id;

  insert into private.wallet_observer_checkout (restaurant_id, enabled)
  select unnest(v_targets), true
  on conflict (restaurant_id) do update set enabled = true;

  update public.payment_gateway_configs set active = false, updated_at = now()
  where restaurant_id = any(v_targets) and active and provider = 'static_qr';

  update public.restaurant_payment_accounts set active = false, updated_at = now()
  where restaurant_id = any(v_targets) and active and provider in ('yape', 'lemon');
end;
$$;
