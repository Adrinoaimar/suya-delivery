create extension if not exists pgcrypto;

create type public.restaurant_role as enum ('owner', 'manager', 'kitchen');
create type public.order_status as enum (
  'confirmed', 'preparing', 'picked_up', 'on_the_way', 'delivered', 'cancelled'
);
create type public.payment_method as enum ('cash', 'yape', 'card');
create type public.payment_status as enum ('pending', 'authorized', 'failed', 'refunded');
create type public.rider_status as enum ('offline', 'available', 'busy', 'suspended');
create type public.incident_category as enum (
  'accidente', 'mecanico', 'cliente', 'zona_insegura', 'robo', 'otro'
);

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (length(trim(display_name)) between 2 and 120),
  phone text check (phone is null or phone ~ '^\+?[0-9 ()-]{6,20}$'),
  default_address text,
  default_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name text not null,
  icon text not null,
  accent text not null default 'green' check (accent in ('green', 'lime', 'sun')),
  sort_order integer not null default 0,
  active boolean not null default true
);

create table public.restaurants (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  category_id uuid not null references public.categories(id),
  name text not null,
  description text not null default '',
  phone text,
  address text not null,
  latitude double precision,
  longitude double precision,
  delivery_fee numeric(10,2) not null default 0 check (delivery_fee >= 0),
  minimum_order numeric(10,2) not null default 0 check (minimum_order >= 0),
  eta_min_minutes integer not null default 20 check (eta_min_minutes > 0),
  eta_max_minutes integer not null default 45 check (eta_max_minutes >= eta_min_minutes),
  schedule jsonb not null default '{}'::jsonb,
  theme jsonb not null default '{}'::jsonb,
  image_url text,
  logo_url text,
  gallery jsonb not null default '[]'::jsonb,
  active boolean not null default false,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((latitude is null and longitude is null) or
    (latitude between -90 and 90 and longitude between -180 and 180))
);

create table public.restaurant_members (
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.restaurant_role not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (restaurant_id, user_id)
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  section text not null,
  name text not null,
  description text not null default '',
  price numeric(10,2) not null check (price >= 0),
  image_url text,
  popular boolean not null default false,
  extras jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.rider_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status public.rider_status not null default 'offline',
  verified_at timestamptz,
  phone text,
  vehicle_type text,
  vehicle_color text,
  vehicle_plate text,
  rating numeric(3,2) not null default 5 check (rating between 0 and 5),
  deliveries integer not null default 0 check (deliveries >= 0),
  updated_at timestamptz not null default now()
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9]{6,12}$'),
  customer_id uuid not null references auth.users(id),
  restaurant_id uuid not null references public.restaurants(id),
  rider_id uuid references public.rider_profiles(user_id),
  status public.order_status not null default 'confirmed',
  payment_method public.payment_method not null default 'cash',
  subtotal numeric(10,2) not null check (subtotal >= 0),
  delivery_fee numeric(10,2) not null check (delivery_fee >= 0),
  discount numeric(10,2) not null default 0 check (discount >= 0),
  total numeric(10,2) generated always as (subtotal + delivery_fee - discount) stored,
  customer_name text not null,
  customer_phone text not null,
  delivery_address text not null,
  delivery_reference text not null default '',
  delivery_latitude double precision,
  delivery_longitude double precision,
  delivery_verified_at timestamptz,
  cancelled_at timestamptz,
  cancellation_reason text,
  estimated_minutes integer not null check (estimated_minutes > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (discount <= subtotal + delivery_fee),
  check ((delivery_latitude is null and delivery_longitude is null) or
    (delivery_latitude between -90 and 90 and delivery_longitude between -180 and 180))
);

create table private.order_secrets (
  order_id uuid primary key references public.orders(id) on delete cascade,
  delivery_code_hash text not null,
  cancel_code_hash text not null,
  delivery_failed_attempts smallint not null default 0 check (delivery_failed_attempts between 0 and 10),
  cancel_failed_attempts smallint not null default 0 check (cancel_failed_attempts between 0 and 10),
  locked_until timestamptz
);
alter table private.order_secrets enable row level security;
revoke all on private.order_secrets from public, anon, authenticated;

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  unit_price numeric(10,2) not null check (unit_price >= 0),
  quantity integer not null check (quantity between 1 and 99),
  extras jsonb not null default '[]'::jsonb,
  note text not null default '',
  image_url text,
  line_total numeric(10,2) generated always as (unit_price * quantity) stored
);

create table public.order_events (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders(id) on delete cascade,
  status public.order_status not null,
  actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.payment_attempts (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  provider text not null,
  provider_reference text,
  method public.payment_method not null,
  status public.payment_status not null default 'pending',
  amount numeric(10,2) not null check (amount > 0),
  idempotency_key text not null unique,
  failure_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_reference)
);

create table public.rider_locations (
  id bigint generated always as identity primary key,
  rider_id uuid not null references public.rider_profiles(user_id) on delete cascade,
  order_id uuid references public.orders(id) on delete cascade,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  accuracy_meters numeric(8,2) check (accuracy_meters is null or accuracy_meters >= 0),
  captured_at timestamptz not null default now()
);

create table public.incidents (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid not null references public.rider_profiles(user_id),
  order_id uuid references public.orders(id),
  category public.incident_category not null,
  description text not null default '',
  latitude double precision,
  longitude double precision,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  check ((latitude is null and longitude is null) or
    (latitude between -90 and 90 and longitude between -180 and 180))
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  body text not null,
  level text not null default 'info' check (level in ('info', 'success', 'warning', 'danger')),
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid,
  table_name text not null,
  row_id text not null,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);

create index products_restaurant_active_idx on public.products (restaurant_id, sort_order)
  where active;
create index restaurant_members_user_idx on public.restaurant_members (user_id, restaurant_id)
  where active;
create index orders_customer_created_idx on public.orders (customer_id, created_at desc);
create index orders_restaurant_status_created_idx
  on public.orders (restaurant_id, status, created_at desc);
create index orders_rider_active_idx on public.orders (rider_id, created_at desc)
  where status in ('picked_up', 'on_the_way');
create index order_items_order_idx on public.order_items (order_id);
create index order_events_order_created_idx on public.order_events (order_id, created_at);
create index payment_attempts_order_idx on public.payment_attempts (order_id, created_at desc);
create index rider_locations_order_captured_idx
  on public.rider_locations (order_id, captured_at desc);
create index rider_locations_retention_idx on public.rider_locations (captured_at);
create index rider_locations_rider_captured_idx
  on public.rider_locations (rider_id, captured_at desc);
create index restaurants_category_active_idx on public.restaurants (category_id) where active;
create index incidents_rider_created_idx on public.incidents (rider_id, created_at desc);
create index incidents_order_idx on public.incidents (order_id) where order_id is not null;
create index notifications_user_unread_idx on public.notifications (user_id, created_at desc)
  where read_at is null;

create function private.is_platform_admin()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'platform_admin',
    false
  );
$$;

create function private.is_restaurant_member(target_restaurant uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1
    from public.restaurant_members rm
    where rm.restaurant_id = target_restaurant
      and rm.user_id = (select auth.uid())
      and rm.active
  );
$$;

create function private.has_restaurant_role(
  target_restaurant uuid,
  allowed_roles public.restaurant_role[]
)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1
    from public.restaurant_members rm
    where rm.restaurant_id = target_restaurant
      and rm.user_id = (select auth.uid())
      and rm.role = any(allowed_roles)
      and rm.active
  );
$$;

create function private.can_read_order(target_order uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1
    from public.orders o
    where o.id = target_order
      and (
        o.customer_id = (select auth.uid())
        or o.rider_id = (select auth.uid())
        or private.is_restaurant_member(o.restaurant_id)
        or private.is_platform_admin()
      )
  );
$$;

create function private.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create function private.validate_order_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (new.id, new.code, new.customer_id, new.restaurant_id, new.subtotal, new.delivery_fee,
      new.discount, new.payment_method, new.customer_name,
      new.customer_phone, new.delivery_address, new.delivery_reference,
      new.delivery_latitude, new.delivery_longitude, new.estimated_minutes, new.created_at)
    is distinct from
     (old.id, old.code, old.customer_id, old.restaurant_id, old.subtotal, old.delivery_fee,
      old.discount, old.payment_method, old.customer_name,
      old.customer_phone, old.delivery_address, old.delivery_reference,
      old.delivery_latitude, old.delivery_longitude, old.estimated_minutes, old.created_at) then
    raise exception 'immutable order fields cannot be changed';
  end if;

  if new.rider_id is distinct from old.rider_id then
    if current_user <> 'service_role'
      and not private.is_platform_admin()
      and not private.has_restaurant_role(new.restaurant_id, array['owner', 'manager']::public.restaurant_role[]) then
      raise exception 'only authorized dispatch can assign a rider';
    end if;
    if new.rider_id is not null and not exists (
      select 1 from public.rider_profiles rp
      where rp.user_id = new.rider_id and rp.verified_at is not null
        and rp.status in ('available', 'busy')
    ) then
      raise exception 'rider is not eligible for assignment';
    end if;
  end if;

  if (new.cancelled_at, new.cancellation_reason) is distinct from
     (old.cancelled_at, old.cancellation_reason)
    and current_user <> 'service_role'
    and not private.is_platform_admin()
    and not private.is_restaurant_member(new.restaurant_id) then
    raise exception 'cancellation metadata is backend or restaurant only';
  end if;

  if new.delivery_verified_at is distinct from old.delivery_verified_at
    and current_user <> 'service_role'
    and not private.is_platform_admin() then
    raise exception 'delivery verification is backend-only';
  end if;

  if new.status is distinct from old.status and not (
    (old.status = 'confirmed' and new.status in ('preparing', 'cancelled')) or
    (old.status = 'preparing' and new.status in ('picked_up', 'cancelled')) or
    (old.status = 'picked_up' and new.status = 'on_the_way') or
    (old.status = 'on_the_way' and new.status = 'delivered')
  ) then
    raise exception 'invalid order status transition';
  end if;

  if new.status = 'delivered' and new.delivery_verified_at is null then
    raise exception 'delivery code must be verified before delivery';
  end if;
  if new.status = 'cancelled' and new.cancelled_at is null then
    raise exception 'cancelled_at is required';
  end if;
  return new;
end;
$$;

create function private.validate_rider_profile_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.status = 'suspended' and new.status is distinct from old.status
    and current_user <> 'service_role' then
    raise exception 'a suspended rider cannot reactivate their account';
  end if;
  if old.status = 'busy' and new.status = 'available' and exists (
    select 1 from public.orders o
    where o.rider_id = old.user_id and o.status in ('picked_up', 'on_the_way')
  ) then
    raise exception 'complete the active delivery before becoming available';
  end if;
  return new;
end;
$$;

create function private.record_order_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.order_events (order_id, status, actor_id)
    values (new.id, new.status, (select auth.uid()));
  end if;
  return new;
end;
$$;

create function private.write_audit_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_value jsonb;
  old_value jsonb;
  new_value jsonb;
begin
  row_value := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  old_value := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  new_value := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  if tg_table_name = 'payment_attempts' then
    old_value := old_value - 'idempotency_key' - 'provider_reference';
    new_value := new_value - 'idempotency_key' - 'provider_reference';
  end if;
  insert into public.audit_log (actor_id, table_name, row_id, action, old_data, new_data)
  values (
    (select auth.uid()), tg_table_name,
    coalesce(row_value ->> 'id', concat_ws(':', row_value ->> 'restaurant_id', row_value ->> 'user_id')),
    tg_op, old_value, new_value
  );
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on all functions in schema private from public, anon, authenticated;
grant usage on schema private to anon, authenticated;
grant execute on function private.is_platform_admin() to anon, authenticated;
grant execute on function private.is_restaurant_member(uuid) to authenticated;
grant execute on function private.has_restaurant_role(uuid, public.restaurant_role[]) to authenticated;
grant execute on function private.can_read_order(uuid) to authenticated;
grant usage on schema private to service_role;
grant select, insert, update, delete on private.order_secrets to service_role;

create trigger profiles_updated_at before update on public.profiles
for each row execute function private.set_updated_at();
create trigger restaurants_updated_at before update on public.restaurants
for each row execute function private.set_updated_at();
create trigger products_updated_at before update on public.products
for each row execute function private.set_updated_at();
create trigger rider_profiles_updated_at before update on public.rider_profiles
for each row execute function private.set_updated_at();
create trigger rider_profiles_validate before update on public.rider_profiles
for each row execute function private.validate_rider_profile_update();
create trigger orders_validate before update on public.orders
for each row execute function private.validate_order_update();
create trigger orders_updated_at before update on public.orders
for each row execute function private.set_updated_at();
create trigger orders_event after insert or update of status on public.orders
for each row execute function private.record_order_event();
create trigger payment_attempts_updated_at before update on public.payment_attempts
for each row execute function private.set_updated_at();
create trigger orders_audit after insert or update or delete on public.orders
for each row execute function private.write_audit_log();
create trigger restaurant_members_audit after insert or update or delete on public.restaurant_members
for each row execute function private.write_audit_log();
create trigger payment_attempts_audit after insert or update or delete on public.payment_attempts
for each row execute function private.write_audit_log();

alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.restaurants enable row level security;
alter table public.restaurant_members enable row level security;
alter table public.products enable row level security;
alter table public.rider_profiles enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_events enable row level security;
alter table public.payment_attempts enable row level security;
alter table public.rider_locations enable row level security;
alter table public.incidents enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_log enable row level security;

create policy profiles_own_select on public.profiles for select to authenticated
using ((select auth.uid()) = id or private.is_platform_admin());
create policy profiles_own_insert on public.profiles for insert to authenticated
with check ((select auth.uid()) = id);
create policy profiles_own_update on public.profiles for update to authenticated
using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create policy categories_public_select on public.categories for select to anon, authenticated
using (active or private.is_platform_admin());
create policy restaurants_anon_select on public.restaurants for select to anon using (active);
create policy restaurants_authenticated_select on public.restaurants for select to authenticated
using (active or private.is_restaurant_member(id) or private.is_platform_admin());
create policy restaurants_staff_update on public.restaurants for update to authenticated
using (private.has_restaurant_role(id, array['owner', 'manager']::public.restaurant_role[])
  or private.is_platform_admin())
with check (private.has_restaurant_role(id, array['owner', 'manager']::public.restaurant_role[])
  or private.is_platform_admin());

create policy restaurant_members_own_select on public.restaurant_members for select to authenticated
using (user_id = (select auth.uid()) or private.is_platform_admin());
create policy restaurant_members_admin_all on public.restaurant_members for all to authenticated
using (private.is_platform_admin()) with check (private.is_platform_admin());

create policy products_anon_select on public.products for select to anon using (active);
create policy products_authenticated_select on public.products for select to authenticated
using (active or private.is_restaurant_member(restaurant_id) or private.is_platform_admin());
create policy products_staff_insert on public.products for insert to authenticated
with check (private.has_restaurant_role(restaurant_id, array['owner', 'manager']::public.restaurant_role[])
  or private.is_platform_admin());
create policy products_staff_update on public.products for update to authenticated
using (private.has_restaurant_role(restaurant_id, array['owner', 'manager']::public.restaurant_role[])
  or private.is_platform_admin())
with check (private.has_restaurant_role(restaurant_id, array['owner', 'manager']::public.restaurant_role[])
  or private.is_platform_admin());
create policy products_staff_delete on public.products for delete to authenticated
using (private.has_restaurant_role(restaurant_id, array['owner', 'manager']::public.restaurant_role[])
  or private.is_platform_admin());

create policy rider_profiles_self_select on public.rider_profiles for select to authenticated
using (user_id = (select auth.uid()) or private.is_platform_admin());
create policy rider_profiles_self_update on public.rider_profiles for update to authenticated
using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy orders_participant_select on public.orders for select to authenticated
using (customer_id = (select auth.uid()) or rider_id = (select auth.uid())
  or private.is_restaurant_member(restaurant_id) or private.is_platform_admin());
create policy orders_restaurant_update on public.orders for update to authenticated
using (private.is_restaurant_member(restaurant_id) or private.is_platform_admin())
with check (private.is_restaurant_member(restaurant_id) or private.is_platform_admin());
create policy orders_rider_update on public.orders for update to authenticated
using (rider_id = (select auth.uid()) and status in ('preparing', 'picked_up', 'on_the_way'))
with check (rider_id = (select auth.uid()) and status in ('picked_up', 'on_the_way'));

create policy order_items_participant_select on public.order_items for select to authenticated
using (private.can_read_order(order_id));
create policy order_events_participant_select on public.order_events for select to authenticated
using (private.can_read_order(order_id));
create policy payment_attempts_participant_select on public.payment_attempts for select to authenticated
using (private.can_read_order(order_id));

create policy rider_locations_self_insert on public.rider_locations for insert to authenticated
with check (rider_id = (select auth.uid()) and (
  order_id is null or exists (
    select 1 from public.orders o
    where o.id = order_id and o.rider_id = (select auth.uid())
      and o.status in ('picked_up', 'on_the_way')
  )
));
create policy rider_locations_participant_select on public.rider_locations for select to authenticated
using (rider_id = (select auth.uid()) or private.is_platform_admin() or exists (
  select 1 from public.orders o
  where o.id = order_id and o.customer_id = (select auth.uid())
    and o.rider_id = rider_id and o.status in ('picked_up', 'on_the_way')
));

create policy incidents_rider_insert on public.incidents for insert to authenticated
with check (rider_id = (select auth.uid()));
create policy incidents_authorized_select on public.incidents for select to authenticated
using (rider_id = (select auth.uid()) or private.is_platform_admin());
create policy incidents_admin_update on public.incidents for update to authenticated
using (private.is_platform_admin()) with check (private.is_platform_admin());

create policy notifications_own_select on public.notifications for select to authenticated
using (user_id = (select auth.uid()));
create policy notifications_own_update on public.notifications for update to authenticated
using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy audit_admin_select on public.audit_log for select to authenticated
using (private.is_platform_admin());

revoke all on all tables in schema public from anon, authenticated;
grant usage on schema public to anon, authenticated;
grant select on public.categories, public.restaurants, public.products to anon, authenticated;
grant select, insert on public.profiles to authenticated;
grant update (display_name, phone, default_address, default_reference) on public.profiles to authenticated;
grant select on public.restaurant_members, public.rider_profiles, public.orders,
  public.order_items, public.order_events, public.payment_attempts, public.audit_log to authenticated;
grant update (name, description, phone, address, latitude, longitude, delivery_fee, minimum_order,
  eta_min_minutes, eta_max_minutes, schedule, theme, image_url, logo_url, gallery)
  on public.restaurants to authenticated;
grant insert, delete on public.products to authenticated;
grant update (section, name, description, price, image_url, popular, extras, active, sort_order)
  on public.products to authenticated;
grant update (status, phone, vehicle_type, vehicle_color, vehicle_plate)
  on public.rider_profiles to authenticated;
grant update (rider_id, status, cancelled_at, cancellation_reason)
  on public.orders to authenticated;
grant insert, select on public.rider_locations, public.incidents to authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant update (resolved_at) on public.incidents to authenticated;

-- Postgres Changes se limita al estado de pedidos y notificaciones. Broadcast privado será la
-- opción productiva para ubicación de alta frecuencia.
alter publication supabase_realtime add table public.orders;
alter publication supabase_realtime add table public.notifications;
