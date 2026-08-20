begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(24);

select has_table('public', 'profiles', 'profiles existe');
select has_table('public', 'restaurants', 'restaurants existe');
select has_table('public', 'restaurant_members', 'restaurant_members existe');
select has_table('public', 'products', 'products existe');
select has_table('public', 'orders', 'orders existe');
select has_table('public', 'order_items', 'order_items existe');
select has_table('public', 'order_events', 'order_events existe');
select has_table('public', 'payment_attempts', 'payment_attempts existe');
select has_table('public', 'rider_locations', 'rider_locations existe');
select has_table('public', 'incidents', 'incidents existe');
select has_table('public', 'notifications', 'notifications existe');
select has_table('public', 'audit_log', 'audit_log existe');

select ok(
  (select bool_and(relrowsecurity)
   from pg_class
   where oid in (
     'public.profiles'::regclass, 'public.categories'::regclass,
     'public.restaurants'::regclass, 'public.restaurant_members'::regclass,
     'public.products'::regclass, 'public.rider_profiles'::regclass,
     'public.orders'::regclass, 'public.order_items'::regclass,
     'public.order_events'::regclass, 'public.payment_attempts'::regclass,
     'public.rider_locations'::regclass, 'public.incidents'::regclass,
     'public.notifications'::regclass, 'public.audit_log'::regclass
   )),
  'RLS está activo en todas las tablas expuestas'
);

select ok(has_table_privilege('anon', 'public.restaurants', 'SELECT'),
  'anon puede leer restaurantes mediante RLS');
select ok(has_table_privilege('anon', 'public.products', 'SELECT'),
  'anon puede leer productos mediante RLS');
select ok(not has_table_privilege('anon', 'public.orders', 'SELECT'),
  'anon no puede leer pedidos');
select ok(not has_table_privilege('authenticated', 'public.orders', 'INSERT'),
  'el cliente no puede insertar pedidos con precios manipulados');
select ok(not has_table_privilege('authenticated', 'public.payment_attempts', 'INSERT'),
  'el cliente no puede inventar intentos de pago');
select ok(not has_table_privilege('authenticated', 'public.audit_log', 'INSERT'),
  'el cliente no puede escribir auditoría');

select has_function('private', 'is_platform_admin', array[]::text[],
  'helper de administrador existe');
select has_function('private', 'is_restaurant_member', array['uuid'],
  'helper de membresía existe');
select has_trigger('public', 'orders', 'orders_validate',
  'pedidos validan transiciones');
select has_trigger('public', 'orders', 'orders_event',
  'pedidos generan eventos');
select has_index('public', 'orders', 'orders_restaurant_status_created_idx',
  'cola de restaurante está indexada');

select * from finish();
rollback;
