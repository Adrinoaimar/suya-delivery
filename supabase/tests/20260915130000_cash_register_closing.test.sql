begin;
select plan(33);

select has_table('public', 'cash_register_sessions', 'existe turno de caja');
select has_table('public', 'cash_register_entries', 'existe libro de caja');
select has_column('public', 'orders', 'cash_register_session_id', 'pedido conserva turno de caja');
select has_column('public', 'table_sessions', 'payment_request_id', 'mesa conserva solicitud de cobro');
select has_function(
  'public', 'open_cash_register', array['uuid', 'numeric', 'uuid'],
  'RPC de apertura idempotente existe'
);
select has_function(
  'public', 'record_cash_sale', array['uuid', 'uuid', 'numeric', 'uuid'],
  'RPC de cobro de efectivo existe'
);
select has_function(
  'public', 'close_cash_register', array['uuid', 'numeric', 'text', 'uuid'],
  'RPC de cierre de caja existe'
);
select has_function(
  'public', 'register_table_payment', array['uuid', 'numeric', 'public.payment_method', 'uuid'],
  'cobro de mesa idempotente existe'
);
select ok(
  (select prosecdef from pg_proc where oid = 'public.close_cash_register(uuid,numeric,text,uuid)'::regprocedure),
  'cierre usa SECURITY DEFINER'
);
select is(
  (select proconfig from pg_proc where oid = 'public.close_cash_register(uuid,numeric,text,uuid)'::regprocedure),
  array['search_path=""']::text[],
  'cierre fija search_path vacío'
);
select ok(
  has_function_privilege('authenticated', 'public.close_cash_register(uuid,numeric,text,uuid)', 'execute')
    and not has_function_privilege('anon', 'public.close_cash_register(uuid,numeric,text,uuid)', 'execute'),
  'solo authenticated ejecuta cierre'
);
select ok(
  not has_table_privilege('authenticated', 'public.cash_register_sessions', 'INSERT')
    and not has_table_privilege('authenticated', 'public.cash_register_entries', 'INSERT')
    and not has_table_privilege('authenticated', 'public.cash_register_sessions', 'UPDATE'),
  'cliente no muta directamente el libro de caja'
);
select ok(
  exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'cash_register_one_open_restaurant_uidx'
  ),
  'un solo turno abierto por restaurante'
);
select ok(
  exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'cash_register_request_uidx'
  ),
  'request id protege reintentos de movimientos'
);

select set_config('role', 'postgres', true);
insert into auth.users (id, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values (
  'c3100000-0000-0000-0000-000000000001', 'authenticated', 'cashier@example.test',
  '{"role":"authenticated"}', '{"display_name":"Caja Uno"}', now(), now()
);
insert into public.categories (id, slug, name, icon)
values ('c3200000-0000-0000-0000-000000000001', 'cash-register-test', 'Caja', 'cash');
insert into public.restaurants (id, slug, category_id, name, address, active, accepting_orders)
values (
  'c3300000-0000-0000-0000-000000000001', 'cash-register-test',
  'c3200000-0000-0000-0000-000000000001', 'Restaurante Caja', 'Sullana', true, true
);
insert into public.restaurant_members (restaurant_id, user_id, role, active)
values (
  'c3300000-0000-0000-0000-000000000001',
  'c3100000-0000-0000-0000-000000000001', 'manager', true
);

select set_config('role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'c3100000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"c3100000-0000-0000-0000-000000000001"}', true);

select lives_ok(
  $$ select * from public.open_cash_register(
    'c3300000-0000-0000-0000-000000000001', 10, 'c3400000-0000-0000-0000-000000000001'
  ) $$,
  'manager abre caja'
);
select is(
  (select count(*)::int from public.cash_register_sessions
   where restaurant_id = 'c3300000-0000-0000-0000-000000000001' and status = 'open'),
  1,
  'hay un turno abierto'
);
select is(
  (select count(*)::int from public.open_cash_register(
    'c3300000-0000-0000-0000-000000000001', 10, 'c3400000-0000-0000-0000-000000000001'
  )),
  1,
  'repetir apertura no duplica turno'
);

select set_config('role', 'postgres', true);
insert into public.orders (
  id, code, customer_id, restaurant_id, status, payment_method, subtotal, delivery_fee,
  discount, customer_name, customer_phone, delivery_address, estimated_minutes,
  delivery_verified_at
) values (
  'c3500000-0000-0000-0000-000000000001', 'CASH001',
  'c3100000-0000-0000-0000-000000000001',
  'c3300000-0000-0000-0000-000000000001', 'delivered', 'cash', 25, 5, 0,
  'Cliente Caja', '900000001', 'Dirección de prueba', 30, now()
);
insert into public.restaurant_tables (
  id, restaurant_id, table_number, qr_token, status, active
) values (
  'c3a00000-0000-0000-0000-000000000001',
  'c3300000-0000-0000-0000-000000000001', '1',
  'cash-register-table-token-00000001', 'available', true
);
insert into public.table_sessions (
  id, restaurant_id, table_id, opened_by, subtotal, total
) values (
  'c3b00000-0000-0000-0000-000000000001',
  'c3300000-0000-0000-0000-000000000001',
  'c3a00000-0000-0000-0000-000000000001',
  'c3100000-0000-0000-0000-000000000001', 5, 5
);
select set_config('role', 'authenticated', true);

select lives_ok(
  $$ select * from public.record_cash_sale(
    (select id from public.cash_register_sessions
      where restaurant_id = 'c3300000-0000-0000-0000-000000000001' and status = 'open'),
    'c3500000-0000-0000-0000-000000000001', 35,
    'c3600000-0000-0000-0000-000000000001'
  ) $$,
  'caja registra pedido efectivo exacto'
);
select is(
  (select amount from public.cash_register_entries where order_id = 'c3500000-0000-0000-0000-000000000001'),
  30::numeric,
  'libro usa total canónico del pedido'
);
select is(
  (select change_given from public.cash_register_entries where order_id = 'c3500000-0000-0000-0000-000000000001'),
  5::numeric,
  'libro conserva vuelto'
);
select is(
  (select count(*)::int from public.record_cash_sale(
    (select id from public.cash_register_sessions
      where restaurant_id = 'c3300000-0000-0000-0000-000000000001' and status = 'open'),
    'c3500000-0000-0000-0000-000000000001', 35,
    'c3600000-0000-0000-0000-000000000001'
  )),
  1,
  'repetir cobro devuelve la misma entrada'
);
select is(
  (select cash_register_session_id from public.orders where id = 'c3500000-0000-0000-0000-000000000001'),
  (select id from public.cash_register_sessions
    where restaurant_id = 'c3300000-0000-0000-0000-000000000001' and status = 'open'),
  'pedido queda vinculado al turno'
);

select throws_ok(
  $$ select * from public.register_table_payment(
    'c3b00000-0000-0000-0000-000000000001', 10, 'yape',
    'c3c00000-0000-0000-0000-000000000000'
  ) $$,
  'P0001', 'only cash table payments can be registered in the cash register',
  'caja rechaza cerrar mesa con método digital no autorizado'
);
select lives_ok(
  $$ select * from public.register_table_payment(
    'c3b00000-0000-0000-0000-000000000001', 10, 'cash',
    'c3c00000-0000-0000-0000-000000000001'
  ) $$,
  'cobro de mesa entra al libro de caja'
);
select is(
  (select count(*)::int from public.register_table_payment(
    'c3b00000-0000-0000-0000-000000000001', 10, 'cash',
    'c3c00000-0000-0000-0000-000000000001'
  )),
  1,
  'repetir cobro de mesa devuelve el mismo resultado'
);
select is(
  (select amount from public.cash_register_entries
    where table_session_id = 'c3b00000-0000-0000-0000-000000000001'),
  5::numeric,
  'cobro de mesa usa su total canónico'
);

select lives_ok(
  $$ select * from public.add_cash_adjustment(
    (select id from public.cash_register_sessions
      where restaurant_id = 'c3300000-0000-0000-0000-000000000001' and status = 'open'),
    -2, 'Diferencia de vuelto', 'c3700000-0000-0000-0000-000000000001'
  ) $$,
  'caja registra ajuste explicado'
);
select throws_ok(
  $$ select * from public.close_cash_register(
    (select id from public.cash_register_sessions
      where restaurant_id = 'c3300000-0000-0000-0000-000000000001' and status = 'open'),
    50, '', 'c3800000-0000-0000-0000-000000000001'
  ) $$,
  'P0001', 'close note is required when cash differs',
  'cierre exige explicar diferencia'
);
select lives_ok(
  $$ select * from public.close_cash_register(
    (select id from public.cash_register_sessions
      where restaurant_id = 'c3300000-0000-0000-0000-000000000001' and status = 'open'),
    43, 'Arqueo con diferencia autorizada', 'c3800000-0000-0000-0000-000000000002'
  ) $$,
  'caja cierra con arqueo y nota'
);
select is(
  (select expected_cash from public.cash_register_sessions
    where restaurant_id = 'c3300000-0000-0000-0000-000000000001'),
  43::numeric,
  'saldo esperado suma apertura, ventas y ajuste'
);
select is(
  (select difference from public.cash_register_sessions
    where restaurant_id = 'c3300000-0000-0000-0000-000000000001'),
  0::numeric,
  'diferencia se calcula en servidor'
);
select is(
  (select count(*)::int from public.close_cash_register(
    (select id from public.cash_register_sessions
      where restaurant_id = 'c3300000-0000-0000-0000-000000000001'),
    43, 'Arqueo con diferencia autorizada', 'c3800000-0000-0000-0000-000000000002'
  )),
  1,
  'repetir cierre no cambia el turno'
);
select throws_ok(
  $$ select * from public.add_cash_adjustment(
    (select id from public.cash_register_sessions
      where restaurant_id = 'c3300000-0000-0000-0000-000000000001'),
    1, 'tarde', 'c3900000-0000-0000-0000-000000000001'
  ) $$,
  'P0001', 'cash register is closed',
  'turno cerrado rechaza movimientos'
);

select * from finish();
rollback;
