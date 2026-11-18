-- Conserva el origen del abono incluso si el teléfono lo reenvía tras un cambio.
create table private.wallet_observer_route_history (
  version uuid primary key,
  route_id uuid not null references private.wallet_observer_routes(id) on delete cascade,
  device_id uuid not null,
  configured_at timestamptz not null,
  retired_at timestamptz not null
);
alter table private.wallet_observer_route_history enable row level security;
revoke all on private.wallet_observer_route_history from public, anon, authenticated;
create index wallet_observer_route_history_device_idx
  on private.wallet_observer_route_history (device_id, configured_at desc);

create function private.archive_wallet_observer_route()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_device_id uuid;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(old.id::text, 1));
  select s.device_id into v_device_id from private.wallet_observer_slots s
  where s.restaurant_id = old.restaurant_id and s.priority = old.priority;
  if exists (
    select 1 from public.payment_attempts pa
    where pa.observer_route_id = old.id and pa.observer_route_version = old.version
      and pa.status = 'pending'
      and (pa.expires_at > clock_timestamp() or pa.payment_declared_at is not null)
  ) then
    raise exception 'Hay pagos abiertos con este QR. Revisa los abonos informados y espera el vencimiento de los demás antes de cambiarlo o reemplazar el dispositivo.';
  end if;

  new.configured_at := clock_timestamp();
  if v_device_id is not null then
    insert into private.wallet_observer_route_history (version, route_id, device_id, configured_at, retired_at)
    values (old.version, old.id, v_device_id, old.configured_at, new.configured_at);
  end if;
  return new;
end;
$$;

create trigger wallet_observer_archive_route
before update of version on private.wallet_observer_routes for each row
when (old.version is distinct from new.version)
execute function private.archive_wallet_observer_route();

create function private.require_current_wallet_observer_route()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- La asignación adquiere este mismo lock antes de insertar.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.observer_route_id::text, 1));
  if not exists (
    select 1 from private.wallet_observer_routes r
    join private.wallet_observer_slots s using (restaurant_id, priority)
    join public.wallet_observer_devices d on d.id = s.device_id and d.restaurant_id = s.restaurant_id
    where r.id = new.observer_route_id and r.version = new.observer_route_version
      and private.wallet_route_health(r, d) = 'ready'
  ) then raise exception 'wallet_observer_unavailable'; end if;
  return new;
end;
$$;

create trigger wallet_observer_require_current_route
before insert on public.payment_attempts for each row
when (new.observer_route_id is not null)
execute function private.require_current_wallet_observer_route();

create or replace function private.bind_routed_wallet_observation()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.origin_metadata ->> 'operationKind' is distinct from 'incoming_payment'
    or not coalesce(
      (new.provider = 'lemon' and new.origin_metadata ->> 'packageName' = 'com.applemoncash')
      or (new.provider = 'yape' and new.origin_metadata ->> 'packageName'
        in ('com.bcp.innovacxion.yapeapp', 'com.bcp.yape.app')), false
    )
  then return new; end if;

  select found_route.id, found_route.version into new.observer_route_id, new.observer_route_version
  from (
    select r.id, r.version, r.configured_at
    from private.wallet_observer_slots s
    join private.wallet_observer_routes r using (restaurant_id, priority)
    where s.device_id = new.device_id and s.restaurant_id = new.restaurant_id and r.provider = new.provider
      and new.observed_at >= r.configured_at
    union all
    select r.id, h.version, h.configured_at
    from private.wallet_observer_route_history h
    join private.wallet_observer_routes r on r.id = h.route_id
    where h.device_id = new.device_id and r.restaurant_id = new.restaurant_id and r.provider = new.provider
      and new.observed_at >= h.configured_at and new.observed_at < h.retired_at
  ) found_route order by found_route.configured_at desc limit 1;
  return new;
end;
$$;

-- El código es la credencial de un solo uso. La prioridad se comprueba antes de consumirlo.
create function public.complete_profiled_wallet_observer_pairing(
  p_pairing_code text, p_device_label text, p_priority integer
)
returns table (
  device_id uuid, device_label text, device_token text, restaurant_id uuid, receiver_account_id uuid
)
language plpgsql security definer set search_path = '' as $$
declare
  v_code text := lower(trim(coalesce(p_pairing_code, '')));
begin
  if v_code !~ '^[a-f0-9]{16}$' or p_priority is null or p_priority not between 1 and 3 then
    raise exception 'invalid or expired pairing code for this observer';
  end if;
  perform 1 from public.wallet_observer_pairings p
  where p.routed_code_digest = extensions.digest(v_code, 'sha256')
    and p.observer_priority = p_priority and p.consumed_at is null and p.expires_at > now()
  for update;
  if not found then raise exception 'invalid or expired pairing code for this observer'; end if;
  return query select * from public.complete_wallet_observer_pairing(v_code, p_device_label);
end;
$$;
revoke all on function public.complete_profiled_wallet_observer_pairing(text, text, integer) from public, anon, authenticated;
grant execute on function public.complete_profiled_wallet_observer_pairing(text, text, integer) to anon, authenticated;
revoke all on function private.archive_wallet_observer_route(), private.require_current_wallet_observer_route()
  from public, anon, authenticated;
