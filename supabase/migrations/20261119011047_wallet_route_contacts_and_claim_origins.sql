-- El número que vio un cliente queda vinculado al intento y a su QR.
create table private.wallet_observer_attempt_phones (
  attempt_id uuid primary key references public.payment_attempts(id) on delete cascade,
  phone text not null check (phone ~ '^9[0-9]{8}$')
);
alter table private.wallet_observer_attempt_phones enable row level security;
revoke all on private.wallet_observer_attempt_phones from public, anon, authenticated;

insert into private.wallet_observer_attempt_phones (attempt_id, phone)
select a.id, p.phone
from public.payment_attempts a join private.wallet_observer_route_phones p
  on p.route_id = a.observer_route_id and p.route_version = a.observer_route_version
where a.method = 'yape' and a.status = 'pending' and a.expires_at > now();

create function private.snapshot_wallet_observer_attempt_phone()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into private.wallet_observer_attempt_phones (attempt_id, phone)
  select new.id, p.phone from private.wallet_observer_route_phones p
  where p.route_id = new.observer_route_id and p.route_version = new.observer_route_version;
  return new;
end;
$$;
revoke all on function private.snapshot_wallet_observer_attempt_phone() from public, anon, authenticated;
create trigger wallet_observer_snapshot_attempt_phone
after insert on public.payment_attempts
for each row when (new.method = 'yape' and new.observer_route_id is not null)
execute function private.snapshot_wallet_observer_attempt_phone();

create or replace function public.get_payment_receiver_phone(p_order_id uuid, p_guest_access_token text default null)
returns text language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_payment_actor(p_order_id, p_guest_access_token);
  return (
    select p.phone from public.payment_attempts a
    left join private.wallet_observer_attempt_phones p on p.attempt_id = a.id
    where a.order_id = p_order_id and a.method = 'yape' and a.observer_route_id is not null
      and a.status = 'pending' and a.expires_at > now()
    order by a.created_at desc limit 1
  );
end;
$$;

-- El emparejamiento renueva la versión aunque conserve el mismo QR y destinatario.
create function private.carry_wallet_phone_on_device_rebind()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into private.wallet_observer_route_phones (route_id, route_version, phone)
  select new.id, new.version, p.phone from private.wallet_observer_route_phones p
  where p.route_id = old.id and p.route_version = old.version
  on conflict (route_id, route_version) do nothing;
  return new;
end;
$$;
revoke all on function private.carry_wallet_phone_on_device_rebind() from public, anon, authenticated;
create trigger wallet_observer_carry_phone_on_rebind
after update of version on private.wallet_observer_routes
for each row when (
  old.version is distinct from new.version and new.provider = 'yape'
  and old.recipient is not distinct from new.recipient and old.qr_payload is not distinct from new.qr_payload
) execute function private.carry_wallet_phone_on_device_rebind();

create function public.save_wallet_observer_route_with_phone(
  p_restaurant_id uuid, p_priority integer, p_provider text, p_recipient text,
  p_qr_payload text, p_expected_version uuid, p_phone text
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_route private.wallet_observer_routes%rowtype;
  v_phone text := nullif(btrim(p_phone), '');
  v_previous_phone text;
begin
  perform private.require_wallet_route_admin(p_restaurant_id);
  if v_phone is not null and (p_provider <> 'yape' or v_phone !~ '^9[0-9]{8}$') then
    raise exception 'Ingresa un celular Yape de 9 dígitos que empiece con 9.';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    concat_ws(':', p_restaurant_id, p_priority, p_provider), 2));
  select r.* into v_route from private.wallet_observer_routes r
  where r.restaurant_id = p_restaurant_id and r.priority = p_priority and r.provider = p_provider
  for update;
  if v_route.version is distinct from p_expected_version then
    raise exception 'El QR cambió mientras lo editabas. Actualiza Caja y vuelve a intentarlo.';
  end if;
  if v_route.id is not null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_route.id::text, 1));
    select p.phone into v_previous_phone from private.wallet_observer_route_phones p
    where p.route_id = v_route.id and p.route_version = v_route.version;
  end if;

  perform public.save_wallet_observer_route(p_restaurant_id, p_priority, p_provider, p_recipient, p_qr_payload);
  if p_provider <> 'yape' then return; end if;
  select r.* into strict v_route from private.wallet_observer_routes r
  where r.restaurant_id = p_restaurant_id and r.priority = p_priority and r.provider = 'yape'
  for update;
  if v_route.version is distinct from p_expected_version and v_previous_phone is not null and v_phone is null then
    raise exception 'Confirma el celular del nuevo QR para conservar la opción Copiar número.';
  end if;
  if v_phone is null then
    delete from private.wallet_observer_route_phones where route_id = v_route.id and route_version = v_route.version;
  else
    insert into private.wallet_observer_route_phones (route_id, route_version, phone)
    values (v_route.id, v_route.version, v_phone)
    on conflict (route_id, route_version) do update set phone = excluded.phone;
  end if;
  if v_previous_phone is distinct from v_phone then
    perform private.audit_observer_routing(p_restaurant_id, 'UPDATE',
      jsonb_build_object('priority', p_priority, 'provider', p_provider, 'change', 'receiver_phone'));
  end if;
end;
$$;
revoke all on function public.save_wallet_observer_route_with_phone(uuid,integer,text,text,text,uuid,text)
  from public, anon, authenticated;
grant execute on function public.save_wallet_observer_route_with_phone(uuid,integer,text,text,text,uuid,text)
  to authenticated;

drop function public.list_wallet_observer_routes(uuid);
create function public.list_wallet_observer_routes(p_restaurant_id uuid)
returns table (
  priority integer, provider text, device_id uuid, heartbeat_at timestamptz, auto_settle boolean,
  recipient text, qr_payload text, version uuid, enabled boolean, checkout_enabled boolean, health text, phone text, central_collector_name text
)
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_wallet_route_admin(p_restaurant_id);
  return query
  select n, w, d.id, d.heartbeat_at, coalesce(d.auto_settle_orders, false),
    r.recipient, r.qr_payload, r.version, coalesce(r.enabled, false),
    private.observer_checkout_enabled(p_restaurant_id), private.wallet_route_health(r, d), phone.phone, collector.name
  from generate_series(1, 3) n cross join (values ('yape'::text), ('lemon'::text)) wallet(w)
  left join private.wallet_observer_slots s on s.restaurant_id = p_restaurant_id and s.priority = n
  left join public.wallet_observer_devices d on d.id = s.device_id and d.restaurant_id = p_restaurant_id
  left join private.wallet_observer_routes r
    on r.restaurant_id = p_restaurant_id and r.priority = n and r.provider = w
  left join private.wallet_observer_route_phones phone
    on phone.route_id = r.id and phone.route_version = r.version
  left join private.central_yape_checkout central on central.restaurant_id = p_restaurant_id
  left join public.restaurants collector on collector.id = central.collector_id
  order by n, w desc;
end;
$$;
revoke all on function public.list_wallet_observer_routes(uuid) from public, anon, authenticated;
grant execute on function public.list_wallet_observer_routes(uuid) to authenticated;

drop function public.list_expired_wallet_qr_claims(uuid);
create function public.list_expired_wallet_qr_claims(p_restaurant_id uuid)
returns table (
  attempt_id uuid, order_code text, method text, amount numeric,
  payer_name text, receipt_reference text, reported_at timestamptz, restaurant_name text
)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_wallet_route_admin(p_restaurant_id);
  return query
    select pa.id, o.code, pa.method::text, pa.amount, c.payer_name, c.receipt_reference, c.reported_at, r.name
    from private.expired_wallet_qr_claims c
    join public.payment_attempts pa on pa.id = c.payment_attempt_id
    join public.orders o on o.id = pa.order_id
    join public.restaurants r on r.id = o.restaurant_id
    where (o.restaurant_id = p_restaurant_id or (pa.method = 'yape' and exists (
      select 1 from private.wallet_observer_routes route
      where route.id = pa.observer_route_id and route.restaurant_id = p_restaurant_id
    ))) and c.reviewed_at is null
    order by c.reported_at, pa.id
    limit 100;
end;
$$;
revoke all on function public.list_expired_wallet_qr_claims(uuid) from public, anon, authenticated;
grant execute on function public.list_expired_wallet_qr_claims(uuid) to authenticated;
