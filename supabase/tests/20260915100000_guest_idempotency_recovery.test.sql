begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(17);

select has_column(
  'public', 'orders', 'idempotency_fingerprint',
  'orders guarda huella canónica de idempotencia'
);
select has_index(
  'public', 'orders', 'orders_idempotency_lookup_idx',
  'orders tiene índice de recuperación por restaurante, canal y request'
);
select has_function(
  'private', 'create_order_internal_v2',
  array['uuid','jsonb','text','text','text','text','uuid','boolean','text','uuid','uuid','text','text','double precision','double precision','text'],
  'helper privado de recuperación guest existe'
);
select has_function(
  'public', 'create_menu_order',
  array['uuid','jsonb','text','text','text','uuid','text','double precision','double precision'],
  'menu cash expone token y coordenadas en una sola llamada'
);
select has_function(
  'public', 'create_menu_order_with_customer',
  array['uuid','jsonb','text','text','text','text','uuid','text','text','double precision','double precision'],
  'menu con nombre conserva oferta, token y coordenadas'
);
select has_function(
  'public', 'create_table_cash_order',
  array['uuid','jsonb','text','text','text','uuid','uuid','uuid','text'],
  'mesa cash expone token y sesión'
);
select has_function(
  'public', 'create_table_cash_order_with_customer',
  array['uuid','jsonb','text','text','text','text','uuid','uuid','uuid','text','text'],
  'mesa cash con nombre conserva oferta y token'
);
select has_function(
  'public', 'create_menu_order_with_payment',
  array['uuid','jsonb','text','text','text','text','uuid','text','text','double precision','double precision','text'],
  'menu wallet recibe token guest'
);
select has_function(
  'public', 'create_table_order_with_payment',
  array['uuid','jsonb','text','text','text','text','uuid','uuid','uuid','text','text','text'],
  'mesa wallet recibe token guest'
);
select ok(
  (select prosecdef and proconfig = array['search_path=""']::text[]
   from pg_proc
   where oid = 'private.create_order_internal_v2(uuid,jsonb,text,text,text,text,uuid,boolean,text,uuid,uuid,text,text,double precision,double precision,text)'::regprocedure),
  'helper v2 es SECURITY DEFINER con search_path vacío'
);
select ok(
  not has_function_privilege(
    'anon',
    'private.create_order_internal_v2(uuid,jsonb,text,text,text,text,uuid,boolean,text,uuid,uuid,text,text,double precision,double precision,text)',
    'execute'
  )
  and not has_function_privilege(
    'authenticated',
    'private.create_order_internal_v2(uuid,jsonb,text,text,text,text,uuid,boolean,text,uuid,uuid,text,text,double precision,double precision,text)',
    'execute'
  ),
  'helper v2 no es invocable por clientes'
);
select ok(
  pg_get_functiondef('private.create_order_internal_v2(uuid,jsonb,text,text,text,text,uuid,boolean,text,uuid,uuid,text,text,double precision,double precision,text)'::regprocedure)
    like '%idempotency key payload conflict%',
  'reutilizar request_id con otro payload se rechaza'
);
select ok(
  pg_get_functiondef('private.create_order_internal_v2(uuid,jsonb,text,text,text,text,uuid,boolean,text,uuid,uuid,text,text,double precision,double precision,text)'::regprocedure)
    like '%guest access token required to recover order%',
  'recuperación guest exige token'
);
select ok(
  pg_get_functiondef('private.create_order_internal_v2(uuid,jsonb,text,text,text,text,uuid,boolean,text,uuid,uuid,text,text,double precision,double precision,text)'::regprocedure)
    like '%idempotency_fingerprint%',
  'la huella se calcula y persiste dentro del helper'
);
select ok(
  pg_get_functiondef('public.create_menu_order_with_payment(uuid,jsonb,text,text,text,text,uuid,text,text,double precision,double precision,text)'::regprocedure)
    like '%p_guest_access_token%',
  'wallet guest pasa el token a la intención de pago'
);
select ok(
  pg_get_functiondef('public.create_cash_order(uuid,jsonb,text,text,text,uuid,text,double precision,double precision)'::regprocedure)
    like '%p_delivery_latitude%',
  'delivery cash persiste coordenadas junto al pedido'
);
select ok(
  has_function_privilege('anon', 'public.create_menu_order_with_payment(uuid,jsonb,text,text,text,text,uuid,text,text,double precision,double precision,text)', 'execute')
  and has_function_privilege('authenticated', 'public.create_menu_order_with_payment(uuid,jsonb,text,text,text,text,uuid,text,text,double precision,double precision,text)', 'execute'),
  'wallet menu mantiene acceso anon y autenticado'
);

select * from finish();
rollback;
