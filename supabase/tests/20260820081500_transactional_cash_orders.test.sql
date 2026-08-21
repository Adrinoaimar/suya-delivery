begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(22);

select has_function(
  'public',
  'create_cash_order',
  array['uuid', 'jsonb', 'text', 'text', 'text', 'uuid'],
  'create_cash_order existe'
);

select has_function(
  'public',
  'get_order_codes',
  array['uuid'],
  'get_order_codes existe'
);

select ok(
  (
    select prosecdef and proconfig = array['search_path=""']::text[]
    from pg_catalog.pg_proc
    where oid = 'public.create_cash_order(uuid,jsonb,text,text,text,uuid)'::pg_catalog.regprocedure
  ),
  'create_cash_order usa SECURITY DEFINER con search_path vacío'
);

select ok(
  (
    select prosecdef and proconfig = array['search_path=""']::text[]
    from pg_catalog.pg_proc
    where oid = 'public.get_order_codes(uuid)'::pg_catalog.regprocedure
  ),
  'get_order_codes usa SECURITY DEFINER con search_path vacío'
);

select ok(
  pg_catalog.has_function_privilege(
    'authenticated',
    'public.create_cash_order(uuid,jsonb,text,text,text,uuid)',
    'EXECUTE'
  )
  and not pg_catalog.has_function_privilege(
    'anon',
    'public.create_cash_order(uuid,jsonb,text,text,text,uuid)',
    'EXECUTE'
  ),
  'solo authenticated puede crear pedidos mediante RPC'
);

select ok(
  pg_catalog.has_function_privilege(
    'authenticated',
    'public.get_order_codes(uuid)',
    'EXECUTE'
  )
  and not pg_catalog.has_function_privilege(
    'anon',
    'public.get_order_codes(uuid)',
    'EXECUTE'
  ),
  'solo authenticated puede consultar códigos mediante RPC'
);

select ok(
  not pg_catalog.has_table_privilege('authenticated', 'public.orders', 'INSERT'),
  'authenticated no tiene INSERT directo sobre orders'
);

select ok(
  not pg_catalog.has_table_privilege('authenticated', 'private.order_secrets', 'SELECT'),
  'authenticated no puede leer códigos privados'
);

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
) values
  (
    '00000000-0000-0000-0000-000000000000',
    '81000000-0000-0000-0000-000000000001',
    'authenticated',
    'authenticated',
    'cash-order-owner@example.test',
    '',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"Cliente Uno"}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '81000000-0000-0000-0000-000000000002',
    'authenticated',
    'authenticated',
    'cash-order-other@example.test',
    '',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"Cliente Dos"}'::jsonb,
    now(),
    now()
  );

update public.profiles
set phone = '+51 999 111 222', default_address = 'Jirón de prueba 123'
where id = '81000000-0000-0000-0000-000000000001';

insert into public.categories (id, slug, name, icon)
values ('82000000-0000-0000-0000-000000000001', 'cash-order-test', 'Pruebas', 'test');

insert into public.restaurants (
  id, slug, category_id, name, address, delivery_fee, minimum_order,
  eta_min_minutes, eta_max_minutes, active, accepting_orders
) values
  (
    '83000000-0000-0000-0000-000000000001', 'cash-order-open',
    '82000000-0000-0000-0000-000000000001', 'Restaurante abierto', 'Dirección 1',
    4.00, 0, 20, 35, true, true
  ),
  (
    '83000000-0000-0000-0000-000000000002', 'cash-order-other',
    '82000000-0000-0000-0000-000000000001', 'Restaurante ajeno', 'Dirección 2',
    3.00, 0, 20, 35, true, true
  ),
  (
    '83000000-0000-0000-0000-000000000003', 'cash-order-closed',
    '82000000-0000-0000-0000-000000000001', 'Restaurante cerrado', 'Dirección 3',
    3.00, 0, 20, 35, true, false
  );

insert into public.products (
  id, restaurant_id, section, name, price, extras, active
) values
  (
    '84000000-0000-0000-0000-000000000001',
    '83000000-0000-0000-0000-000000000001',
    'Platos', 'Pollo', 10.00,
    '[
      {"id":"extra-cheese","label":"Queso","price":2.50},
      {"id":"extra-sauce","label":"Salsa","price":1.00}
    ]'::jsonb,
    true
  ),
  (
    '84000000-0000-0000-0000-000000000002',
    '83000000-0000-0000-0000-000000000002',
    'Platos', 'Producto ajeno', 8.00, '[]'::jsonb, true
  );

set local request.jwt.claims =
  '{"sub":"81000000-0000-0000-0000-000000000001","role":"authenticated"}';
set local role authenticated;

select lives_ok(
  $$
    select *
    from public.create_cash_order(
      '83000000-0000-0000-0000-000000000001',
      '[{
        "product_id":"84000000-0000-0000-0000-000000000001",
        "quantity":2,
        "extra_ids":["extra-cheese"],
        "extras":[{"id":"extra-cheese","label":"Falso","price":0.01}],
        "note":"  sin cubiertos  ",
        "unit_price":0.01,
        "subtotal":0.02,
        "price":0.01
      }]'::jsonb,
      '', '', '  puerta azul  ',
      '85000000-0000-0000-0000-000000000001'
    )
  $$,
  'cliente autenticado crea pedido en efectivo'
);

select is(
  (
    select subtotal
    from public.orders
    where idempotency_key = '85000000-0000-0000-0000-000000000001'
  ),
  25.00::numeric,
  'subtotal usa precio de catálogo y extra, no montos del cliente'
);

select is(
  (
    select unit_price
    from public.order_items
    where order_id = (
      select id from public.orders
      where idempotency_key = '85000000-0000-0000-0000-000000000001'
    )
  ),
  10.00::numeric,
  'precio base usa catálogo'
);

select is(
  (
    select extras_total
    from public.order_items
    where order_id = (
      select id from public.orders
      where idempotency_key = '85000000-0000-0000-0000-000000000001'
    )
  ),
  2.50::numeric,
  'total de extras usa catálogo'
);

select is(
  (
    select extras
    from public.order_items
    where order_id = (
      select id from public.orders
      where idempotency_key = '85000000-0000-0000-0000-000000000001'
    )
  ),
  jsonb_build_array(jsonb_build_object(
    'id', 'extra-cheese', 'label', 'Queso', 'price', 2.50::numeric
  )),
  'extra queda canonicalizado desde catálogo'
);

select is(
  (
    select order_id
    from public.create_cash_order(
      '83000000-0000-0000-0000-000000000001',
      '[{"product_id":"84000000-0000-0000-0000-000000000001","quantity":99}]'::jsonb,
      '+51 900 000 000', 'Otra dirección válida', '',
      '85000000-0000-0000-0000-000000000001'
    )
  ),
  (
    select id
    from public.orders
    where idempotency_key = '85000000-0000-0000-0000-000000000001'
  ),
  'misma request_id devuelve mismo pedido'
);

select is(
  (
    select count(*)
    from public.orders
    where idempotency_key = '85000000-0000-0000-0000-000000000001'
  ),
  1::bigint,
  'idempotencia no duplica pedido'
);

select is(
  (
    select concat_ws(':', delivery_code, cancel_code)
    from public.create_cash_order(
      '83000000-0000-0000-0000-000000000001',
      '[{"product_id":"84000000-0000-0000-0000-000000000001","quantity":1}]'::jsonb,
      '', '', '', '85000000-0000-0000-0000-000000000001'
    )
  ),
  (
    select concat_ws(':', delivery_code, cancel_code)
    from public.get_order_codes((
      select id from public.orders
      where idempotency_key = '85000000-0000-0000-0000-000000000001'
    ))
  ),
  'reintento devuelve códigos originales'
);

select throws_ok(
  $$
    select * from public.create_cash_order(
      '83000000-0000-0000-0000-000000000003',
      '[{"product_id":"84000000-0000-0000-0000-000000000001","quantity":1}]'::jsonb,
      '', '', '', '85000000-0000-0000-0000-000000000002'
    )
  $$,
  'P0001',
  'restaurant is not accepting orders',
  'restaurante cerrado rechaza pedido'
);

select throws_ok(
  $$
    select * from public.create_cash_order(
      '83000000-0000-0000-0000-000000000001',
      '[{"product_id":"84000000-0000-0000-0000-000000000002","quantity":1}]'::jsonb,
      '', '', '', '85000000-0000-0000-0000-000000000003'
    )
  $$,
  'P0001',
  'product is unavailable',
  'producto de otro restaurante se rechaza'
);

select throws_ok(
  $$
    select * from public.create_cash_order(
      '83000000-0000-0000-0000-000000000001',
      '[{
        "product_id":"84000000-0000-0000-0000-000000000001",
        "quantity":1,
        "extra_ids":["extra-unknown"]
      }]'::jsonb,
      '', '', '', '85000000-0000-0000-0000-000000000004'
    )
  $$,
  'P0001',
  'unknown extra',
  'extra desconocido se rechaza'
);

select is(
  (
    select count(*)
    from public.get_order_codes((
      select id from public.orders
      where idempotency_key = '85000000-0000-0000-0000-000000000001'
    ))
  ),
  1::bigint,
  'cliente obtiene códigos de su pedido'
);

reset role;

do $$
begin
  perform set_config(
    'test.owner_order_id',
    (
      select id::text
      from public.orders
      where idempotency_key = '85000000-0000-0000-0000-000000000001'
    ),
    true
  );
end;
$$;

select ok(
  (
    select delivery_code ~ '^[0-9]{4}$'
      and cancel_code ~ '^[0-9]{4}$'
      and delivery_code <> cancel_code
      and extensions.crypt(delivery_code, delivery_code_hash) = delivery_code_hash
      and extensions.crypt(cancel_code, cancel_code_hash) = cancel_code_hash
    from private.order_secrets
    where order_id = (
      select id from public.orders
      where idempotency_key = '85000000-0000-0000-0000-000000000001'
    )
  ),
  'códigos privados son distintos, válidos y coinciden con hashes'
);

set local request.jwt.claims =
  '{"sub":"81000000-0000-0000-0000-000000000002","role":"authenticated"}';
set local role authenticated;

select is(
  (
    select count(*)
    from public.get_order_codes(
      current_setting('test.owner_order_id')::uuid
    )
  ),
  0::bigint,
  'otro cliente no obtiene códigos'
);

select * from finish();
rollback;
