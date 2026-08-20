begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(17);

select has_function('public', 'publish_rider_location',
  array['uuid','double precision','double precision','double precision'], 'RPC GPS existe');
select has_function('public', 'report_rider_incident',
  array['uuid','uuid','incident_category','text','double precision','double precision','boolean'],
  'RPC incidente existe');
select has_function('public', 'resolve_rider_sos', array['uuid'], 'RPC cierre SOS existe');
select ok(not exists (
  select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname in (
    'publish_rider_location','report_rider_incident','resolve_rider_sos'
  ) and (not p.prosecdef or p.proconfig <> array['search_path=""']::text[])
), 'RPC seguridad usan definer con search_path vacío');
select ok(
  pg_catalog.has_function_privilege('authenticated',
    'public.publish_rider_location(uuid,double precision,double precision,double precision)','EXECUTE')
  and not pg_catalog.has_function_privilege('anon',
    'public.publish_rider_location(uuid,double precision,double precision,double precision)','EXECUTE'),
  'solo authenticated publica GPS'
);
select ok(
  not pg_catalog.has_table_privilege('authenticated','public.rider_locations','INSERT')
  and not pg_catalog.has_table_privilege('authenticated','public.incidents','INSERT'),
  'mutaciones directas revocadas'
);

insert into auth.users (
  instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) values
('00000000-0000-0000-0000-000000000000','b1000000-0000-0000-0000-000000000001',
 'authenticated','authenticated','owner@tracking.test','',now(),
 '{"provider":"email","providers":["email"]}','{"display_name":"Owner"}',now(),now()),
('00000000-0000-0000-0000-000000000000','b1000000-0000-0000-0000-000000000002',
 'authenticated','authenticated','rider@tracking.test','',now(),
 '{"provider":"email","providers":["email"]}','{"display_name":"Rider"}',now(),now()),
('00000000-0000-0000-0000-000000000000','b1000000-0000-0000-0000-000000000003',
 'authenticated','authenticated','customer@tracking.test','',now(),
 '{"provider":"email","providers":["email"]}','{"display_name":"Customer"}',now(),now()),
('00000000-0000-0000-0000-000000000000','b1000000-0000-0000-0000-000000000004',
 'authenticated','authenticated','other@tracking.test','',now(),
 '{"provider":"email","providers":["email"]}','{"display_name":"Other"}',now(),now());
insert into public.categories(id,slug,name,icon)
values('b2000000-0000-0000-0000-000000000001','tracking-test','Tracking','pin');
insert into public.restaurants(id,slug,category_id,name,address,active,accepting_orders)
values('b3000000-0000-0000-0000-000000000001','tracking-test',
 'b2000000-0000-0000-0000-000000000001','Tracking Test','Sullana',true,true);
insert into public.restaurant_members(restaurant_id,user_id,role)
values('b3000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000001','owner');
insert into public.rider_profiles(user_id,status,verified_at)
values('b1000000-0000-0000-0000-000000000002','busy',now());
insert into public.orders(
 id,code,customer_id,restaurant_id,rider_id,status,subtotal,delivery_fee,customer_name,
 customer_phone,delivery_address,delivery_latitude,delivery_longitude,estimated_minutes,idempotency_key
) values(
 'b4000000-0000-0000-0000-000000000001','TRACKING01',
 'b1000000-0000-0000-0000-000000000003','b3000000-0000-0000-0000-000000000001',
 'b1000000-0000-0000-0000-000000000002','picked_up',20,4,'Customer','999111222',
 'Dirección privada',-4.8941,-80.6899,30,'b5000000-0000-0000-0000-000000000001'
);

set local role authenticated;
select set_config('request.jwt.claim.sub','b1000000-0000-0000-0000-000000000004',true);
select is(public.publish_rider_location(
  'b4000000-0000-0000-0000-000000000001',-4.89,-80.69,10),false,
  'tercero no publica ubicación');
select set_config('request.jwt.claim.sub','b1000000-0000-0000-0000-000000000002',true);
select throws_ok(
  $$select public.publish_rider_location('b4000000-0000-0000-0000-000000000001',91,-80.69,10)$$,
  'invalid location reading','GPS inválido rechazado');
select ok(public.publish_rider_location(
  'b4000000-0000-0000-0000-000000000001',-4.89,-80.69,10),'rider publica GPS');
select ok(public.publish_rider_location(
  'b4000000-0000-0000-0000-000000000001',-4.88,-80.68,9),'reintento inmediato aceptado');
reset role;
select is((select count(*) from public.rider_locations where order_id =
  'b4000000-0000-0000-0000-000000000001'),1::bigint,'cadencia evita spam');

set local role authenticated;
select set_config('request.jwt.claim.sub','b1000000-0000-0000-0000-000000000002',true);
select throws_ok(
  $$select public.report_rider_incident('b6000000-0000-0000-0000-000000000001',
    'b4000000-0000-0000-0000-000000000099','otro','Incidente inválido',null,null,false)$$,
  'assigned active order required','incidente exige pedido propio');
select lives_ok(
  $$select public.report_rider_incident('b6000000-0000-0000-0000-000000000002',
    'b4000000-0000-0000-0000-000000000001','otro','SOS activado por repartidor',-4.89,-80.69,true)$$,
  'SOS persistido');
select is(
  public.report_rider_incident('b6000000-0000-0000-0000-000000000002',
    'b4000000-0000-0000-0000-000000000001','otro','SOS activado por repartidor',-4.89,-80.69,true),
  (select id from public.incidents where request_id='b6000000-0000-0000-0000-000000000002'),
  'reintento SOS idempotente');
select ok(public.resolve_rider_sos((select id from public.incidents where
  request_id='b6000000-0000-0000-0000-000000000002')),'rider marca SOS resuelto');
reset role;
select is((select count(*) from public.notifications where source_key like 'incident:%'),
  2::bigint,'SOS notifica rider y owner');
select ok((select resolved_at is not null from public.incidents where
  request_id='b6000000-0000-0000-0000-000000000002'),'SOS queda resuelto en servidor');

select * from finish();
rollback;
