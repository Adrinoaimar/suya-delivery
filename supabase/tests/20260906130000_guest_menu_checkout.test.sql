begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(22);

select ok(
  not attnotnull,
  'orders.customer_id permite NULL para pedidos guest'
)
from pg_catalog.pg_attribute
where attrelid = 'public.orders'::regclass and attname = 'customer_id' and not attisdropped;

select has_column('private', 'order_secrets', 'guest_access_token_hash', 'order secrets guarda hash de token guest');
select has_index('public', 'orders', 'orders_guest_idempotency_unique', 'idempotencia guest aislada por restaurante');

select has_function('public', 'create_menu_order', array['uuid','jsonb','text','text','text','uuid'], 'menu order mantiene API y acepta guest');
select has_function('public', 'create_menu_order_with_customer', array['uuid','jsonb','text','text','text','text','uuid'], 'menu order acepta nombre guest');
select has_function('public', 'create_table_cash_order', array['uuid','jsonb','text','text','text','uuid','uuid','uuid'], 'table QR mantiene API y acepta guest');
select has_function('public', 'create_table_cash_order_with_customer', array['uuid','jsonb','text','text','text','text','uuid','uuid','uuid'], 'table QR acepta nombre guest');
select has_function('public', 'open_guest_table_session', array['text'], 'QR puede abrir sesión guest con token');
select has_function('public', 'get_guest_order', array['uuid','text'], 'guest order tracking RPC existe');
select has_function('public', 'set_guest_order_delivery_coordinates', array['uuid','text','double precision','double precision'], 'guest coordinates RPC existe');

select ok(
  (select prosecdef and proconfig = array['search_path=""']::text[]
   from pg_proc where oid = 'public.create_menu_order(uuid,jsonb,text,text,text,uuid)'::regprocedure),
  'menu order es SECURITY DEFINER con search_path vacío'
);
select ok(
  (select prosecdef and proconfig = array['search_path=""']::text[]
   from pg_proc where oid = 'public.create_table_cash_order(uuid,jsonb,text,text,text,uuid,uuid,uuid)'::regprocedure),
  'table QR order es SECURITY DEFINER con search_path vacío'
);

select ok(
  has_function_privilege('anon', 'public.create_menu_order(uuid,jsonb,text,text,text,uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.create_menu_order(uuid,jsonb,text,text,text,uuid)', 'execute'),
  'menu order disponible para anon y authenticated'
);
select ok(
  has_function_privilege('anon', 'public.create_table_cash_order(uuid,jsonb,text,text,text,uuid,uuid,uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.create_table_cash_order(uuid,jsonb,text,text,text,uuid,uuid,uuid)', 'execute'),
  'table QR order disponible para anon y authenticated'
);
select ok(
  has_function_privilege('anon', 'public.open_guest_table_session(text)', 'execute')
  and has_function_privilege('anon', 'public.get_guest_order(uuid,text)', 'execute')
  and has_function_privilege('anon', 'public.set_guest_order_delivery_coordinates(uuid,text,double precision,double precision)', 'execute'),
  'anon solo recibe RPCs guest token-gated'
);
select ok(
  has_function_privilege('authenticated', 'public.create_cash_order(uuid,jsonb,text,text,text,uuid)', 'execute')
  and not has_function_privilege('anon', 'public.create_cash_order(uuid,jsonb,text,text,text,uuid)', 'execute'),
  'Delivery create_cash_order sigue cerrado a anon'
);
select ok(
  not has_table_privilege('anon', 'public.orders', 'SELECT')
  and not has_table_privilege('anon', 'public.orders', 'INSERT'),
  'anon no accede directamente a orders'
);

set local role anon;
select throws_ok(
  $$select * from public.create_cash_order(
    '00000000-0000-0000-0000-000000000001','[]'::jsonb,'','','',
    '00000000-0000-0000-0000-000000000002'
  )$$,
  '42501',
  'permission denied for function create_cash_order',
  'Delivery no puede invocarse como anon'
);
reset role;

select ok(
  (select pg_get_functiondef('public.get_guest_order(uuid,text)'::regprocedure) like '%customer_id is null%'
    and pg_get_functiondef('public.get_guest_order(uuid,text)'::regprocedure) like '%origin in (''menu'',''table_qr'')%'),
  'tracking guest restringe origen y customer_id NULL'
);
select ok(
  (select pg_get_functiondef('public.set_guest_order_delivery_coordinates(uuid,text,double precision,double precision)'::regprocedure) like '%customer_id is null%'
    and pg_get_functiondef('public.set_guest_order_delivery_coordinates(uuid,text,double precision,double precision)'::regprocedure) like '%origin in (''menu'',''table_qr'')%'),
  'coordenadas guest restringe origen y customer_id NULL'
);
select ok(
  (select pg_get_constraintdef(oid) like '%table_qr%'
   from pg_constraint where conrelid = 'public.orders'::regclass and conname = 'orders_origin_check'),
  'orders distingue origin table_qr'
);
select ok(
  (select pg_get_functiondef('private.create_order_internal(uuid,jsonb,text,text,text,text,uuid,boolean,text,uuid,uuid)'::regprocedure) like '%p_origin = ''delivery'' and actor_id is null%'),
  'helper bloquea Delivery sin auth'
);

select * from finish();
rollback;
