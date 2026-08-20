begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(38);

select has_function('public', 'set_rider_availability', array['boolean'], 'RPC disponibilidad existe');
select has_function('public', 'list_available_riders', array['uuid'], 'RPC lista riders existe');
select has_function('public', 'assign_order_rider', array['uuid', 'uuid'], 'RPC asignación existe');
select has_function(
  'public', 'transition_order', array['uuid', 'order_status', 'order_status'],
  'RPC transición existe'
);
select has_function(
  'public', 'cancel_order_by_restaurant', array['uuid', 'text'],
  'RPC cancelación restaurante existe'
);
select ok(
  not exists (
    select 1 from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'set_rider_availability', 'list_available_riders', 'assign_order_rider',
        'transition_order', 'cancel_order_by_restaurant'
      )
      and (not p.prosecdef or p.proconfig <> array['search_path=""']::text[])
  ),
  'RPC críticas usan SECURITY DEFINER y search_path vacío'
);
select ok(
  pg_catalog.has_function_privilege('authenticated', 'public.assign_order_rider(uuid,uuid)', 'EXECUTE')
  and not pg_catalog.has_function_privilege('anon', 'public.assign_order_rider(uuid,uuid)', 'EXECUTE')
  and not pg_catalog.has_function_privilege(
    'anon', 'public.transition_order(uuid,public.order_status,public.order_status)', 'EXECUTE'
  ),
  'solo authenticated ejecuta dispatch'
);
select ok(
  not pg_catalog.has_column_privilege('authenticated', 'public.orders', 'status', 'UPDATE')
  and not pg_catalog.has_column_privilege('authenticated', 'public.orders', 'rider_id', 'UPDATE'),
  'authenticated no cambia pedido directamente'
);
select ok(
  not pg_catalog.has_column_privilege('authenticated', 'public.rider_profiles', 'status', 'UPDATE'),
  'rider no cambia disponibilidad directamente'
);
select has_index('public', 'orders', 'orders_one_open_per_rider_idx', 'índice único activo existe');

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '91000000-0000-0000-0000-000000000001',
   'authenticated', 'authenticated', 'owner@dispatch.test', '', now(),
   '{"provider":"email","providers":["email"]}', '{"display_name":"Owner"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '91000000-0000-0000-0000-000000000002',
   'authenticated', 'authenticated', 'kitchen@dispatch.test', '', now(),
   '{"provider":"email","providers":["email"]}', '{"display_name":"Kitchen"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '91000000-0000-0000-0000-000000000003',
   'authenticated', 'authenticated', 'rider1@dispatch.test', '', now(),
   '{"provider":"email","providers":["email"]}', '{"display_name":"Rider Uno"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '91000000-0000-0000-0000-000000000004',
   'authenticated', 'authenticated', 'rider2@dispatch.test', '', now(),
   '{"provider":"email","providers":["email"]}', '{"display_name":"Rider Dos"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '91000000-0000-0000-0000-000000000005',
   'authenticated', 'authenticated', 'rider3@dispatch.test', '', now(),
   '{"provider":"email","providers":["email"]}', '{"display_name":"Rider Tres"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '91000000-0000-0000-0000-000000000006',
   'authenticated', 'authenticated', 'outsider@dispatch.test', '', now(),
   '{"provider":"email","providers":["email"]}', '{"display_name":"Outsider"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '91000000-0000-0000-0000-000000000007',
   'authenticated', 'authenticated', 'admin@dispatch.test', '', now(),
   '{"provider":"email","providers":["email"]}', '{"display_name":"Admin"}', now(), now());

insert into public.categories (id, slug, name, icon)
values ('92000000-0000-0000-0000-000000000001', 'dispatch-test', 'Dispatch', 'bike');
insert into public.restaurants (
  id, slug, category_id, name, address, active, accepting_orders
) values (
  '93000000-0000-0000-0000-000000000001', 'dispatch-test',
  '92000000-0000-0000-0000-000000000001', 'Dispatch Test', 'Dirección segura', true, true
);
insert into public.restaurant_members (restaurant_id, user_id, role) values
  ('93000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000001', 'owner'),
  ('93000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000002', 'kitchen');
insert into public.rider_profiles (
  user_id, status, verified_at, phone, vehicle_type, vehicle_plate
) values
  ('91000000-0000-0000-0000-000000000003', 'offline', now(), '900000003', 'moto', 'R1A'),
  ('91000000-0000-0000-0000-000000000004', 'available', now(), '900000004', 'moto', 'R2A'),
  ('91000000-0000-0000-0000-000000000005', 'available', now(), '900000005', 'bici', 'R3A');
insert into public.orders (
  id, code, customer_id, restaurant_id, status, subtotal, delivery_fee, customer_name,
  customer_phone, delivery_address, delivery_latitude, delivery_longitude,
  estimated_minutes, idempotency_key
) values
  ('94000000-0000-0000-0000-000000000001', 'DISPATCH01',
   '91000000-0000-0000-0000-000000000006', '93000000-0000-0000-0000-000000000001',
   'confirmed', 20, 4, 'Cliente Privado', '999111222', 'Dirección privada 1', -4.8941, -80.6899, 30,
   '95000000-0000-0000-0000-000000000001'),
  ('94000000-0000-0000-0000-000000000002', 'DISPATCH02',
   '91000000-0000-0000-0000-000000000006', '93000000-0000-0000-0000-000000000001',
   'confirmed', 20, 4, 'Cliente Privado', '999111222', 'Dirección privada 2', -4.8942, -80.6898, 30,
   '95000000-0000-0000-0000-000000000002'),
  ('94000000-0000-0000-0000-000000000003', 'DISPATCH03',
   '91000000-0000-0000-0000-000000000006', '93000000-0000-0000-0000-000000000001',
   'confirmed', 20, 4, 'Cliente Privado', '999111222', 'Dirección privada 3', -4.8943, -80.6897, 30,
   '95000000-0000-0000-0000-000000000003');

set local request.jwt.claims =
  '{"sub":"91000000-0000-0000-0000-000000000003","role":"authenticated"}';
set local role authenticated;
select lives_ok(
  $$ select public.set_rider_availability(true) $$,
  'rider verificado activa disponibilidad'
);
reset role;
select is(
  (select status from public.rider_profiles where user_id = '91000000-0000-0000-0000-000000000003'),
  'available'::public.rider_status,
  'disponibilidad queda en servidor'
);

set local request.jwt.claims =
  '{"sub":"91000000-0000-0000-0000-000000000006","role":"authenticated"}';
set local role authenticated;
select is(
  (select count(*) from public.list_available_riders('93000000-0000-0000-0000-000000000001')),
  0::bigint,
  'ajeno no enumera repartidores'
);
reset role;

set local request.jwt.claims =
  '{"sub":"91000000-0000-0000-0000-000000000001","role":"authenticated"}';
set local role authenticated;
select is(
  (select count(*) from public.list_available_riders('93000000-0000-0000-0000-000000000001')),
  3::bigint,
  'owner lista riders disponibles'
);
select lives_ok(
  $$ select public.assign_order_rider(
    '94000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000003'
  ) $$,
  'owner asigna rider'
);
reset role;
select is(
  (select rider_id from public.orders where id = '94000000-0000-0000-0000-000000000001'),
  '91000000-0000-0000-0000-000000000003'::uuid,
  'pedido conserva asignación'
);
select is(
  (select status from public.rider_profiles where user_id = '91000000-0000-0000-0000-000000000003'),
  'busy'::public.rider_status,
  'rider asignado queda busy'
);
select is(
  (select count(*) from public.order_events
   where order_id = '94000000-0000-0000-0000-000000000001'
     and event_type = 'rider_assigned' and actor_role = 'restaurant'),
  1::bigint,
  'asignación crea evento tipado'
);

set local request.jwt.claims =
  '{"sub":"91000000-0000-0000-0000-000000000001","role":"authenticated"}';
set local role authenticated;
select throws_ok(
  $$ select public.assign_order_rider(
    '94000000-0000-0000-0000-000000000002', '91000000-0000-0000-0000-000000000003'
  ) $$,
  'P0001', 'rider is not available', 'doble asignación se rechaza'
);
reset role;

set local request.jwt.claims =
  '{"sub":"91000000-0000-0000-0000-000000000003","role":"authenticated"}';
set local role authenticated;
select throws_ok(
  $$ select public.set_rider_availability(false) $$,
  'P0001', 'rider has an active assignment', 'rider activo no se desconecta'
);
reset role;

set local request.jwt.claims =
  '{"sub":"91000000-0000-0000-0000-000000000002","role":"authenticated"}';
set local role authenticated;
select throws_ok(
  $$ select public.assign_order_rider(
    '94000000-0000-0000-0000-000000000002', '91000000-0000-0000-0000-000000000004'
  ) $$,
  'P0001', 'dispatch permission required', 'kitchen no asigna rider'
);
select lives_ok(
  $$ select public.transition_order(
    '94000000-0000-0000-0000-000000000002', 'confirmed', 'preparing'
  ) $$,
  'kitchen inicia preparación'
);
reset role;

set local request.jwt.claims =
  '{"sub":"91000000-0000-0000-0000-000000000001","role":"authenticated"}';
set local role authenticated;
select lives_ok(
  $$ select public.assign_order_rider(
    '94000000-0000-0000-0000-000000000002', '91000000-0000-0000-0000-000000000004'
  ) $$,
  'owner asigna segundo rider'
);
select throws_ok(
  $$ select public.transition_order(
    '94000000-0000-0000-0000-000000000002', 'preparing', 'picked_up'
  ) $$,
  'P0001', 'assigned rider required', 'owner no marca recojo'
);
reset role;

set local request.jwt.claims =
  '{"sub":"91000000-0000-0000-0000-000000000004","role":"authenticated"}';
set local role authenticated;
select lives_ok(
  $$ select public.transition_order(
    '94000000-0000-0000-0000-000000000002', 'preparing', 'picked_up'
  ) $$,
  'rider asignado marca recojo'
);
select throws_ok(
  $$ select public.transition_order(
    '94000000-0000-0000-0000-000000000002', 'confirmed', 'on_the_way'
  ) $$,
  'P0001', 'order status changed; refresh required', 'estado esperado evita carrera'
);
select lives_ok(
  $$ select public.transition_order(
    '94000000-0000-0000-0000-000000000002', 'picked_up', 'on_the_way'
  ) $$,
  'rider asignado inicia ruta'
);
reset role;

set local request.jwt.claims =
  '{"sub":"91000000-0000-0000-0000-000000000002","role":"authenticated"}';
set local role authenticated;
select lives_ok(
  $$ select public.transition_order(
    '94000000-0000-0000-0000-000000000001', 'confirmed', 'preparing'
  ) $$,
  'kitchen prepara pedido asignado'
);
reset role;

set local request.jwt.claims =
  '{"sub":"91000000-0000-0000-0000-000000000005","role":"authenticated"}';
set local role authenticated;
select throws_ok(
  $$ select public.transition_order(
    '94000000-0000-0000-0000-000000000001', 'preparing', 'picked_up'
  ) $$,
  'P0001', 'assigned rider required', 'otro rider no recoge pedido'
);
reset role;

set local request.jwt.claims =
  '{"sub":"91000000-0000-0000-0000-000000000001","role":"authenticated"}';
set local role authenticated;
select lives_ok(
  $$ select public.cancel_order_by_restaurant(
    '94000000-0000-0000-0000-000000000001', 'Local sin capacidad temporal'
  ) $$,
  'owner cancela antes del recojo'
);
reset role;
select is(
  (select status from public.orders where id = '94000000-0000-0000-0000-000000000001'),
  'cancelled'::public.order_status,
  'cancelación cambia estado'
);
select is(
  (select status from public.rider_profiles where user_id = '91000000-0000-0000-0000-000000000003'),
  'available'::public.rider_status,
  'cancelación libera rider'
);
select is(
  (select count(*) from public.order_events
   where order_id = '94000000-0000-0000-0000-000000000001'
     and event_type = 'status_changed' and previous_status = 'preparing'
     and status = 'cancelled' and actor_role = 'restaurant'),
  1::bigint,
  'cancelación registra transición y actor'
);
select ok(
  not exists (
    select 1 from public.audit_log a
    where a.table_name = 'orders' and (
      a.old_data ?| array['customer_name','customer_phone','delivery_address','delivery_reference','idempotency_key']
      or a.new_data ?| array['customer_name','customer_phone','delivery_address','delivery_reference','idempotency_key']
    )
  ),
  'auditoría de pedidos no guarda PII ni idempotencia'
);
select ok(
  exists (
    select 1 from public.audit_log a where a.table_name = 'orders' and a.new_data ? 'status'
  ),
  'auditoría conserva estado operativo'
);

set local request.jwt.claims =
  '{"sub":"91000000-0000-0000-0000-000000000007","role":"authenticated","app_metadata":{"role":"platform_admin"}}';
set local role authenticated;
select lives_ok(
  $$ select public.assign_order_rider(
    '94000000-0000-0000-0000-000000000003', '91000000-0000-0000-0000-000000000005'
  ) $$,
  'platform admin asigna rider'
);
select is(
  (select count(*) from public.list_available_riders('93000000-0000-0000-0000-000000000001')),
  1::bigint,
  'lista omite riders busy'
);
reset role;
select ok(
  not exists (
    select 1 from public.order_events e
    where e.event_type like 'rider_%'
      and e.metadata ?| array['customer_phone','delivery_address','delivery_code','cancel_code']
  ),
  'eventos de asignación no filtran PII ni códigos'
);

select * from finish();
rollback;
