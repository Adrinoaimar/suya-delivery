begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(11);

select has_function(
  'public', 'set_order_delivery_coordinates', array['uuid', 'double precision', 'double precision'],
  'RPC de coordenadas existe'
);
select ok(
  (select prosecdef and proconfig = array['search_path=""']::text[]
   from pg_catalog.pg_proc
   where oid = 'public.set_order_delivery_coordinates(uuid,double precision,double precision)'::regprocedure),
  'RPC usa SECURITY DEFINER y search_path vacío'
);
select ok(
  pg_catalog.has_function_privilege(
    'authenticated',
    'public.set_order_delivery_coordinates(uuid,double precision,double precision)', 'EXECUTE'
  ) and not pg_catalog.has_function_privilege(
    'anon', 'public.set_order_delivery_coordinates(uuid,double precision,double precision)', 'EXECUTE'
  ),
  'solo authenticated ejecuta RPC'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000001',
   'authenticated', 'authenticated', 'coordinates-owner@test.local', '', now(),
   '{"provider":"email","providers":["email"]}', '{"display_name":"Cliente"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000002',
   'authenticated', 'authenticated', 'coordinates-other@test.local', '', now(),
   '{"provider":"email","providers":["email"]}', '{"display_name":"Otro"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000003',
   'authenticated', 'authenticated', 'coordinates-rider@test.local', '', now(),
   '{"provider":"email","providers":["email"]}', '{"display_name":"Rider"}', now(), now());
insert into public.categories (id, slug, name, icon)
values ('a2000000-0000-0000-0000-000000000001', 'coordinates-test', 'Coordinates', 'pin');
insert into public.restaurants (id, slug, category_id, name, address, active, accepting_orders)
values ('a3000000-0000-0000-0000-000000000001', 'coordinates-test',
  'a2000000-0000-0000-0000-000000000001', 'Coordinates Test', 'Sullana', true, true);
insert into public.rider_profiles (user_id, status, verified_at)
values ('a1000000-0000-0000-0000-000000000003', 'available', now());
insert into public.orders (
  id, code, customer_id, restaurant_id, status, subtotal, delivery_fee, customer_name,
  customer_phone, delivery_address, estimated_minutes, idempotency_key
) values (
  'a4000000-0000-0000-0000-000000000001', 'COORDS01',
  'a1000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001',
  'confirmed', 20, 4, 'Cliente', '999111222', 'Dirección privada', 30,
  'a5000000-0000-0000-0000-000000000001'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-000000000002', true);
select is(
  public.set_order_delivery_coordinates('a4000000-0000-0000-0000-000000000001', -4.89, -80.69),
  false, 'otro cliente no fija coordenadas'
);
select set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-000000000001', true);
select throws_ok(
  $$select public.set_order_delivery_coordinates('a4000000-0000-0000-0000-000000000001', 91, -80.69)$$,
  'invalid delivery coordinates', 'rechaza coordenadas fuera de rango'
);
select ok(
  public.set_order_delivery_coordinates('a4000000-0000-0000-0000-000000000001', -4.8941, -80.6899),
  'cliente fija coordenadas'
);
select ok(
  public.set_order_delivery_coordinates('a4000000-0000-0000-0000-000000000001', -4.8941, -80.6899),
  'reintento idéntico es idempotente'
);
select isnt(
  public.set_order_delivery_coordinates('a4000000-0000-0000-0000-000000000001', -4.80, -80.60),
  true, 'coordenadas ya verificadas no cambian'
);
reset role;
select results_eq(
  $$select delivery_latitude, delivery_longitude from public.orders where id = 'a4000000-0000-0000-0000-000000000001'$$,
  $$values (-4.8941::double precision, -80.6899::double precision)$$,
  'DB conserva primer punto verificado'
);
select ok(
  not pg_catalog.has_column_privilege('authenticated','public.orders','delivery_latitude','UPDATE')
  and not pg_catalog.has_column_privilege('authenticated','public.orders','delivery_longitude','UPDATE'),
  'cliente no altera coordenadas directamente'
);
select ok(
  (select delivery_verified_at is not null from public.orders
   where id = 'a4000000-0000-0000-0000-000000000001'),
  'verificación deja marca temporal'
);

select * from finish();
rollback;
