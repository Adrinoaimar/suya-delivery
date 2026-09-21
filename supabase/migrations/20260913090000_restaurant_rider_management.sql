-- Vincula repartidores a una cuenta de restaurante.
-- rider_profiles conserva la identidad operativa global; esta tabla define el alcance por cuenta.
create table if not exists public.restaurant_riders (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  rider_id uuid not null references public.rider_profiles(user_id) on delete cascade,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, rider_id)
);

create index if not exists restaurant_riders_rider_idx
  on public.restaurant_riders (rider_id, active);

drop trigger if exists restaurant_riders_updated_at on public.restaurant_riders;
create trigger restaurant_riders_updated_at before update on public.restaurant_riders
for each row execute function private.set_updated_at();

drop trigger if exists restaurant_riders_audit on public.restaurant_riders;
create trigger restaurant_riders_audit after insert or update or delete on public.restaurant_riders
for each row execute function private.write_audit_log();

alter table public.restaurant_riders enable row level security;
revoke all on public.restaurant_riders from anon, authenticated;

create or replace function public.list_restaurant_riders(target_restaurant uuid)
returns table (
  rider_id uuid,
  email text,
  display_name text,
  phone text,
  status public.rider_status,
  verified_at timestamptz,
  vehicle_type text,
  vehicle_color text,
  vehicle_plate text,
  rating numeric,
  deliveries integer,
  active boolean,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select rr.rider_id,
    au.email::text,
    p.display_name,
    coalesce(rp.phone, p.phone),
    rp.status,
    rp.verified_at,
    rp.vehicle_type,
    rp.vehicle_color,
    rp.vehicle_plate,
    rp.rating,
    rp.deliveries,
    rr.active,
    rr.created_at
  from public.restaurant_riders rr
  join public.rider_profiles rp on rp.user_id = rr.rider_id
  join public.profiles p on p.id = rr.rider_id
  join auth.users au on au.id = rr.rider_id
  where (private.is_platform_admin() or private.has_restaurant_role(
    target_restaurant, array['owner', 'manager']::public.restaurant_role[]
  ))
  and rr.restaurant_id = target_restaurant
  order by rr.active desc, rp.status, p.display_name;
$$;

create or replace function public.set_restaurant_rider_active(
  target_restaurant uuid,
  target_rider uuid,
  next_active boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then raise exception 'authentication required'; end if;
  if not (private.is_platform_admin() or private.has_restaurant_role(
    target_restaurant, array['owner', 'manager']::public.restaurant_role[]
  )) then raise exception 'rider management permission required'; end if;
  if not exists (
    select 1 from public.restaurant_riders
    where restaurant_id = target_restaurant and rider_id = target_rider
  ) then return false; end if;
  if not next_active and exists (
    select 1 from public.orders o
    where o.restaurant_id = target_restaurant
      and o.rider_id = target_rider
      and o.status not in ('delivered', 'cancelled')
  ) then raise exception 'rider has an active assignment'; end if;

  update public.restaurant_riders
  set active = next_active
  where restaurant_id = target_restaurant and rider_id = target_rider;
  return true;
end;
$$;

revoke all on function public.list_restaurant_riders(uuid) from public, anon, authenticated;
revoke all on function public.set_restaurant_rider_active(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.list_restaurant_riders(uuid) to authenticated;
grant execute on function public.set_restaurant_rider_active(uuid, uuid, boolean) to authenticated;

create or replace function public.list_available_riders(target_restaurant uuid)
returns table (
  user_id uuid,
  display_name text,
  phone text,
  vehicle_type text,
  vehicle_color text,
  vehicle_plate text,
  rating numeric,
  deliveries integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select rp.user_id, p.display_name, coalesce(rp.phone, p.phone), rp.vehicle_type,
    rp.vehicle_color, rp.vehicle_plate, rp.rating, rp.deliveries
  from public.rider_profiles rp
  join public.profiles p on p.id = rp.user_id
  where (private.is_platform_admin() or private.has_restaurant_role(
      target_restaurant, array['owner', 'manager']::public.restaurant_role[]
    ))
    and exists (
      select 1 from public.restaurant_riders rr
      where rr.restaurant_id = target_restaurant
        and rr.rider_id = rp.user_id
        and rr.active
    )
    and rp.verified_at is not null
    and rp.status = 'available'
    and not exists (
      select 1 from public.orders o
      where o.rider_id = rp.user_id and o.status not in ('delivered', 'cancelled')
    )
  order by rp.rating desc, rp.deliveries desc, p.display_name;
$$;

create or replace function public.assign_order_rider(target_order uuid, target_rider uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  order_row public.orders%rowtype;
  rider_row public.rider_profiles%rowtype;
  previous_rider uuid;
begin
  if (select auth.uid()) is null then raise exception 'authentication required'; end if;
  select * into order_row from public.orders where id = target_order for update;
  if not found then return false; end if;
  if not (private.is_platform_admin() or private.has_restaurant_role(
    order_row.restaurant_id, array['owner', 'manager']::public.restaurant_role[]
  )) then raise exception 'dispatch permission required'; end if;
  if order_row.status not in ('confirmed', 'preparing') then
    raise exception 'order cannot be assigned in current status';
  end if;
  if order_row.rider_id is not distinct from target_rider then return true; end if;

  previous_rider := order_row.rider_id;
  if target_rider is not null then
    if not exists (
      select 1 from public.restaurant_riders rr
      where rr.restaurant_id = order_row.restaurant_id
        and rr.rider_id = target_rider and rr.active
    ) then raise exception 'rider is not assigned to restaurant'; end if;
    select * into rider_row from public.rider_profiles
    where user_id = target_rider for update;
    if not found or rider_row.verified_at is null or rider_row.status <> 'available' then
      raise exception 'rider is not available';
    end if;
    if exists (
      select 1 from public.orders o
      where o.rider_id = target_rider and o.status not in ('delivered', 'cancelled')
    ) then raise exception 'rider already has an active assignment'; end if;
  end if;

  update public.orders set rider_id = target_rider where id = target_order;
  if target_rider is not null then
    update public.rider_profiles set status = 'busy' where user_id = target_rider;
  end if;
  if previous_rider is not null then perform private.release_rider_if_idle(previous_rider); end if;
  insert into public.order_events (
    order_id, status, actor_id, event_type, rider_id, actor_role, metadata
  ) values (
    target_order, order_row.status, (select auth.uid()),
    case
      when previous_rider is null then 'rider_assigned'
      when target_rider is null then 'rider_unassigned'
      else 'rider_reassigned'
    end,
    target_rider,
    case when private.is_platform_admin() then 'platform_admin' else 'restaurant' end,
    jsonb_build_object('previous_rider_id', previous_rider)
  );
  return true;
end;
$$;
