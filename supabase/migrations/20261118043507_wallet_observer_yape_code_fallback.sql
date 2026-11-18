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


-- Un código de tres dígitos permite un solo intento por pedido. Caja puede revisar un error.
create function private.guard_routed_yape_code_retry()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.observer_route_id is not null and old.method = 'yape'
    and old.payer_code_hmac is not null and old.payer_code_hmac is distinct from new.payer_code_hmac
  then raise exception 'Ya se informó un código para este pedido. Caja puede revisar el abono.';
  end if;
  return new;
end;
$$;

revoke all on function private.guard_routed_yape_code_retry() from public, anon, authenticated;
create trigger payment_attempt_guard_routed_yape_code_retry
before update of payer_code_hmac on public.payment_attempts
for each row execute function private.guard_routed_yape_code_retry();
