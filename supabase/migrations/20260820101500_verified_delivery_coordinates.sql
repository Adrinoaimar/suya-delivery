create function public.set_order_delivery_coordinates(
  target_order uuid,
  latitude double precision,
  longitude double precision
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  order_row public.orders%rowtype;
begin
  if actor_id is null then raise exception 'authentication required'; end if;
  if latitude is null or longitude is null or
     latitude = 'NaN'::double precision or longitude = 'NaN'::double precision or
     latitude not between -90 and 90 or longitude not between -180 and 180 then
    raise exception 'invalid delivery coordinates';
  end if;

  select * into order_row
  from public.orders
  where id = target_order and customer_id = actor_id
  for update;
  if not found then return false; end if;

  if order_row.delivery_latitude is not null then
    return order_row.delivery_latitude = latitude and order_row.delivery_longitude = longitude;
  end if;
  if order_row.status <> 'confirmed' or order_row.rider_id is not null then return false; end if;

  update public.orders set
    delivery_latitude = latitude,
    delivery_longitude = longitude,
    delivery_verified_at = now()
  where id = target_order;
  return true;
end;
$$;

create function private.require_coordinates_before_assignment()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.rider_id is not null and new.rider_id is distinct from old.rider_id and
     (new.delivery_latitude is null or new.delivery_longitude is null) then
    raise exception 'verified delivery coordinates are required before assignment';
  end if;
  return new;
end;
$$;

create trigger orders_require_coordinates_before_assignment
before update of rider_id on public.orders
for each row execute function private.require_coordinates_before_assignment();

revoke all on function public.set_order_delivery_coordinates(uuid, double precision, double precision)
  from public, anon;
grant execute on function public.set_order_delivery_coordinates(uuid, double precision, double precision)
  to authenticated;
revoke all on function private.require_coordinates_before_assignment() from public, anon, authenticated;
