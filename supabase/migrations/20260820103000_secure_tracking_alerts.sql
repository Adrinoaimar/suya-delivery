alter table public.incidents
  add column request_id uuid,
  add column is_sos boolean not null default false;
update public.incidents set request_id = gen_random_uuid() where request_id is null;
alter table public.incidents alter column request_id set not null;
alter table public.incidents add constraint incidents_rider_request_unique unique (rider_id, request_id);
alter table public.incidents add constraint incidents_coordinate_pair_check
  check (num_nonnulls(latitude, longitude) in (0, 2));
alter table public.incidents add constraint incidents_description_length_check
  check (length(description) between 3 and 1000);

alter table public.notifications add column source_key text;
alter table public.notifications add constraint notifications_user_source_unique unique (user_id, source_key);

create function public.publish_rider_location(
  target_order uuid,
  latitude double precision,
  longitude double precision,
  accuracy_meters double precision default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  last_capture timestamptz;
begin
  if actor_id is null then raise exception 'authentication required'; end if;
  if latitude is null or longitude is null or
     latitude = 'NaN'::double precision or longitude = 'NaN'::double precision or
     latitude not between -90 and 90 or longitude not between -180 and 180 or
     (accuracy_meters is not null and (
       accuracy_meters = 'NaN'::double precision or accuracy_meters not between 0 and 10000
     )) then raise exception 'invalid location reading'; end if;

  perform 1 from public.rider_profiles rp
  where rp.user_id = actor_id and rp.verified_at is not null and rp.status <> 'suspended'
  for update;
  if not found then return false; end if;
  if not exists (
    select 1 from public.orders o
    where o.id = target_order and o.rider_id = actor_id and o.status in ('picked_up', 'on_the_way')
  ) then return false; end if;

  select rl.captured_at into last_capture
  from public.rider_locations rl where rl.rider_id = actor_id and rl.order_id = target_order
  order by rl.captured_at desc limit 1;
  if last_capture is not null and last_capture > now() - interval '8 seconds' then return true; end if;

  insert into public.rider_locations (
    rider_id, order_id, latitude, longitude, accuracy_meters, captured_at
  ) values (actor_id, target_order, latitude, longitude, accuracy_meters, now());
  return true;
end;
$$;

create function public.resolve_rider_sos(target_incident uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.incidents set resolved_at = now()
  where id = target_incident and rider_id = (select auth.uid())
    and is_sos and resolved_at is null;
  return found;
end;
$$;

create function public.report_rider_incident(
  p_request_id uuid,
  target_order uuid,
  incident_category public.incident_category,
  incident_description text,
  latitude double precision default null,
  longitude double precision default null,
  is_sos boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  created_id uuid;
  target_restaurant_id uuid;
  clean_description text := btrim(coalesce(incident_description, ''));
begin
  if actor_id is null then raise exception 'authentication required'; end if;
  if p_request_id is null then raise exception 'request_id is required'; end if;
  if length(clean_description) not between 3 and 1000 then raise exception 'invalid incident description'; end if;
  if num_nonnulls(latitude, longitude) = 1 or
     (latitude is not null and (
       latitude = 'NaN'::double precision or longitude = 'NaN'::double precision or
       latitude not between -90 and 90 or longitude not between -180 and 180
     )) then raise exception 'invalid incident coordinates'; end if;

  perform 1 from public.rider_profiles rp
  where rp.user_id = actor_id and rp.verified_at is not null and rp.status <> 'suspended'
  for update;
  if not found then raise exception 'verified rider required'; end if;

  if target_order is not null then
    select o.restaurant_id into target_restaurant_id from public.orders o
    where o.id = target_order and o.rider_id = actor_id
      and o.status in ('preparing', 'picked_up', 'on_the_way');
    if not found then raise exception 'assigned active order required'; end if;
  end if;

  select i.id into created_id from public.incidents i
  where i.rider_id = actor_id and i.request_id = p_request_id;
  if found then return created_id; end if;

  insert into public.incidents (
    rider_id, order_id, category, description, latitude, longitude, request_id, is_sos
  ) values (
    actor_id, target_order, incident_category, clean_description, latitude, longitude,
    p_request_id, is_sos
  ) returning id into created_id;

  insert into public.notifications (user_id, title, body, level, source_key)
  select recipient, case when is_sos then 'SOS de repartidor' else 'Incidente en ruta' end,
    case when is_sos then 'Revisa de inmediato la alerta y ubicación disponibles.'
         else 'Un repartidor registró un incidente operativo.' end,
    case when is_sos then 'danger' else 'warning' end,
    'incident:' || created_id::text
  from (
    select actor_id as recipient
    union
    select rm.user_id from public.restaurant_members rm
    where rm.restaurant_id = target_restaurant_id and rm.active
      and rm.role in ('owner', 'manager')
  ) recipients
  on conflict (user_id, source_key) do nothing;
  return created_id;
exception
  when unique_violation then
    select i.id into created_id from public.incidents i
    where i.rider_id = actor_id and i.request_id = p_request_id;
    if created_id is null then raise; end if;
    return created_id;
end;
$$;

drop policy if exists rider_locations_self_insert on public.rider_locations;
drop policy if exists incidents_rider_insert on public.incidents;
revoke insert on public.rider_locations, public.incidents from authenticated;

revoke all on function public.publish_rider_location(uuid, double precision, double precision, double precision)
  from public, anon;
revoke all on function public.report_rider_incident(
  uuid, uuid, public.incident_category, text, double precision, double precision, boolean
) from public, anon;
revoke all on function public.resolve_rider_sos(uuid) from public, anon;
grant execute on function public.publish_rider_location(uuid, double precision, double precision, double precision)
  to authenticated;
grant execute on function public.report_rider_incident(
  uuid, uuid, public.incident_category, text, double precision, double precision, boolean
) to authenticated;
grant execute on function public.resolve_rider_sos(uuid) to authenticated;
