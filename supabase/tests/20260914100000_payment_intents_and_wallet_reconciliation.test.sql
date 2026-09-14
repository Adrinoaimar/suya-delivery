begin;

select plan(61);

select has_function(
  'public', 'create_payment_intent', array['uuid', 'text', 'text'],
  'crear intento digital existe'
);
select has_function(
  'public', 'get_payment_intent', array['uuid', 'text'],
  'leer intento digital existe'
);
select has_function(
  'public', 'list_wallet_payment_candidates', array['uuid'],
  'buscar candidatos de billetera existe'
);
select has_function(
  'public', 'verify_wallet_payment', array['uuid', 'uuid'],
  'verificar pago observado existe'
);
select has_function(
  'public', 'submit_payment_evidence', array['uuid', 'text', 'text'],
  'vincular código de identidad del pago existe'
);
select has_function(
  'public', 'set_wallet_observation_code', array['uuid', 'text'],
  'completar código observado desde backoffice existe'
);
select has_function(
  'public', 'create_culqi_payment_intent', array['uuid', 'text', 'text'],
  'crear intento Culqi existe'
);
select has_function(
  'public', 'get_culqi_card_payment_context', array['uuid', 'text'],
  'leer contexto de tarjeta Culqi existe'
);
select has_function(
  'public', 'authorize_culqi_card_payment', array['uuid', 'text', 'text'],
  'autorizar cargo de tarjeta Culqi existe'
);
select has_function(
  'public', 'claim_culqi_payment', array['uuid', 'text', 'text'],
  'reservar intento Culqi antes del cargo existe'
);
select has_function(
  'public', 'authorize_culqi_payment', array['uuid', 'text', 'text', 'text', 'text'],
  'autorizar token Culqi con reserva existe'
);
select has_function(
  'public', 'fail_culqi_payment_claim', array['uuid', 'text', 'text', 'text'],
  'liberar intento Culqi fallido existe'
);
select has_function(
  'public', 'list_restaurant_payment_accounts', array['uuid'],
  'listar cuentas digitales existe'
);
select has_function(
  'public', 'upsert_restaurant_payment_account', array['uuid', 'text', 'text', 'text', 'boolean'],
  'configurar cuenta digital existe'
);
select ok(
  exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
    where t.typname = 'payment_method' and e.enumlabel = 'lemon'),
  'Lemon es método persistido'
);
select ok(
  exists (select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'payment_attempts'
      and column_name = 'checkout_reference'),
  'el intento tiene referencia visible'
);
select ok(
  exists (select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'payment_attempts'
      and column_name = 'payer_code_last4'),
  'el intento conserva el sufijo del código del pagador'
);
select ok(
  exists (select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'payment_attempts'
      and column_name = 'payer_code_digest'),
  'el intento conserva digest exacto del código del pagador'
);
select ok(
  exists (select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'wallet_observations'
      and column_name = 'code_fingerprint'),
  'la observación conserva fingerprint exacto del código'
);
select ok(
  exists (select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'payment_attempts'
      and column_name = 'gateway_qr_payload'),
  'el intento puede conservar el QR generado por la pasarela'
);
select ok(
  exists (select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'payment_attempts'
      and column_name = 'gateway_claim_digest'),
  'el intento conserva solo el digest de la reserva Culqi'
);
select ok(
  exists (select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'payment_attempts'
      and column_name = 'gateway_claimed_at'),
  'el intento conserva la vigencia de la reserva Culqi'
);
select ok(
  exists (select 1 from pg_indexes
    where indexname = 'payment_attempts_checkout_reference_uidx'),
  'la referencia visible es única'
);
select ok(
  exists (select 1 from pg_indexes
    where indexname = 'payment_attempts_one_pending_order_uidx'),
  'solo hay un intento pendiente por pedido'
);
select ok(
  (select prosecdef from pg_proc where oid = 'public.create_payment_intent(uuid,text,text)'::regprocedure),
  'crear intento usa security definer'
);
select ok(
  (select prosecdef from pg_proc where oid = 'public.verify_wallet_payment(uuid,uuid)'::regprocedure),
  'verificar pago usa security definer'
);
select ok(
  (select prosecdef from pg_proc where oid = 'public.create_culqi_payment_intent(uuid,text,text)'::regprocedure),
  'crear intento Culqi usa security definer'
);
select ok(
  (select prosecdef from pg_proc where oid = 'public.authorize_culqi_card_payment(uuid,text,text)'::regprocedure),
  'autorizar tarjeta Culqi usa security definer'
);
select ok(
  (select prosecdef from pg_proc where oid = 'public.claim_culqi_payment(uuid,text,text)'::regprocedure)
    and (select prosecdef from pg_proc where oid = 'public.authorize_culqi_payment(uuid,text,text,text,text)'::regprocedure),
  'reservar y autorizar Culqi usan security definer'
);
select ok(
  has_function_privilege('authenticated', 'public.list_restaurant_payment_accounts(uuid)', 'execute')
    and not has_function_privilege('anon', 'public.list_restaurant_payment_accounts(uuid)', 'execute'),
  'solo backoffice lee cuentas digitales'
);
select ok(
  has_function_privilege('authenticated', 'public.upsert_restaurant_payment_account(uuid,text,text,text,boolean)', 'execute')
    and not has_function_privilege('anon', 'public.upsert_restaurant_payment_account(uuid,text,text,text,boolean)', 'execute'),
  'solo backoffice configura cuentas digitales'
);
select ok(
  has_function_privilege('anon', 'public.create_payment_intent(uuid,text,text)', 'execute')
    and has_function_privilege('authenticated', 'public.create_payment_intent(uuid,text,text)', 'execute'),
  'cliente y guest pueden iniciar pago con RPC'
);
select ok(
  has_function_privilege('anon', 'public.create_culqi_payment_intent(uuid,text,text)', 'execute')
    and has_function_privilege('authenticated', 'public.create_culqi_payment_intent(uuid,text,text)', 'execute'),
  'cliente y guest pueden iniciar orden Culqi con RPC'
);
select ok(
  has_function_privilege('anon', 'public.submit_payment_evidence(uuid,text,text)', 'execute')
    and has_function_privilege('authenticated', 'public.submit_payment_evidence(uuid,text,text)', 'execute'),
  'cliente y guest pueden vincular el código de constancia'
);
select ok(
  not has_function_privilege('anon', 'public.list_wallet_payment_candidates(uuid)', 'execute')
    and has_function_privilege('authenticated', 'public.list_wallet_payment_candidates(uuid)', 'execute'),
  'solo backoffice busca candidatos'
);
select ok(
  not has_function_privilege('anon', 'public.set_wallet_observation_code(uuid,text)', 'execute')
    and has_function_privilege('authenticated', 'public.set_wallet_observation_code(uuid,text)', 'execute'),
  'solo backoffice completa código observado'
);
select ok(
  not has_function_privilege('anon', 'public.verify_wallet_payment(uuid,uuid)', 'execute')
    and has_function_privilege('authenticated', 'public.verify_wallet_payment(uuid,uuid)', 'execute'),
  'solo backoffice verifica observaciones'
);
select ok(
  has_function_privilege('anon', 'public.claim_culqi_payment(uuid,text,text)', 'execute')
    and has_function_privilege('anon', 'public.authorize_culqi_payment(uuid,text,text,text,text)', 'execute')
    and has_function_privilege('anon', 'public.fail_culqi_payment_claim(uuid,text,text,text)', 'execute'),
  'cliente y guest usan RPCs Culqi reservadas'
);
select ok(
  not has_function_privilege('authenticated', 'public.authorize_culqi_card_payment(uuid,text,text)', 'execute'),
  'la RPC Culqi antigua sin reserva queda revocada'
);
select ok(
  (select pg_get_functiondef('public.create_payment_intent(uuid,text,text)'::regprocedure) like '%for update%'),
  'crear intento bloquea el pedido'
);
select ok(
  (select pg_get_functiondef('public.create_payment_intent(uuid,text,text)'::regprocedure) like '%v_order.total%'),
  'el monto sale del pedido bloqueado'
);
select ok(
  (select pg_get_functiondef('public.verify_wallet_payment(uuid,uuid)'::regprocedure) like '%verification_status = ''verified''%'),
  'la verificación cambia el estado de la evidencia'
);
select ok(
  (select pg_get_functiondef('public.verify_wallet_payment(uuid,uuid)'::regprocedure) like '%status = ''authorized''%'),
  'la verificación autoriza el intento'
);
select ok(
  (select pg_get_functiondef('public.authorize_culqi_payment(uuid,text,text,text,text)'::regprocedure)
    like '%gateway_claim_digest%'),
  'la autorización Culqi exige la reserva efímera'
);
select ok(
  (select pg_get_functiondef('public.list_wallet_payment_candidates(uuid)'::regprocedure) like '%payer_code_last4%'),
  'los candidatos exigen identidad del pagador'
);
select ok(
  (select pg_get_functiondef('public.list_wallet_payment_candidates(uuid)'::regprocedure) like '%code_fingerprint%'),
  'los candidatos prefieren fingerprint exacto sobre solo monto'
);
select ok(
  (select pg_get_functiondef('public.submit_payment_evidence(uuid,text,text)'::regprocedure) like '%payer_code_digest%'),
  'la evidencia del cliente guarda digest exacto'
);
select ok(
  (select pg_get_functiondef('public.verify_wallet_payment(uuid,uuid)'::regprocedure) like '%payment identity%'),
  'la verificación rechaza identidad incompleta'
);
select ok(
  not has_table_privilege('authenticated', 'public.restaurant_payment_accounts', 'SELECT'),
  'la configuración de QR no queda expuesta por tabla'
);
select ok(
  (select pg_get_functiondef('public.transition_order(uuid,public.order_status,public.order_status)'::regprocedure)
    like '%digital payment must be authorized before preparation%'),
  'la preparación exige pago digital autorizado'
);

-- Behavioral loop: two different customers pay the same S/30.00 amount.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', 'a6000000-0000-0000-0000-000000000001',
   'authenticated', 'authenticated', 'payment-one@example.test', '', now(),
   '{"provider":"email","providers":["email"]}', '{"display_name":"Cliente Uno"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a6000000-0000-0000-0000-000000000002',
   'authenticated', 'authenticated', 'payment-two@example.test', '', now(),
   '{"provider":"email","providers":["email"]}', '{"display_name":"Cliente Dos"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a6000000-0000-0000-0000-000000000003',
   'authenticated', 'authenticated', 'payment-owner@example.test', '', now(),
   '{"provider":"email","providers":["email"]}', '{"display_name":"Caja Suya"}', now(), now());
insert into public.categories (id, slug, name, icon)
values ('a6100000-0000-0000-0000-000000000001', 'payment-loop-test', 'Pagos', 'wallet');
insert into public.restaurants (id, slug, category_id, name, address, active, accepting_orders)
values (
  'a6200000-0000-0000-0000-000000000001', 'payment-loop-test',
  'a6100000-0000-0000-0000-000000000001', 'Payment Loop Test', 'Caja de prueba', true, true
);
insert into public.restaurant_members (restaurant_id, user_id, role)
values ('a6200000-0000-0000-0000-000000000001', 'a6000000-0000-0000-0000-000000000003', 'owner');
insert into public.orders (
  id, code, customer_id, restaurant_id, status, payment_method, subtotal, delivery_fee,
  customer_name, customer_phone, delivery_address, estimated_minutes, idempotency_key
) values
  ('a6300000-0000-0000-0000-000000000001', 'PAYTEST1',
   'a6000000-0000-0000-0000-000000000001', 'a6200000-0000-0000-0000-000000000001',
   'confirmed', 'cash', 27, 3, 'Cliente Uno', '999111111', 'Dirección uno', 30,
   'a6400000-0000-0000-0000-000000000001'),
  ('a6300000-0000-0000-0000-000000000002', 'PAYTEST2',
   'a6000000-0000-0000-0000-000000000002', 'a6200000-0000-0000-0000-000000000001',
   'confirmed', 'cash', 27, 3, 'Cliente Dos', '999222222', 'Dirección dos', 30,
   'a6400000-0000-0000-0000-000000000002');

set local request.jwt.claims =
  '{"sub":"a6000000-0000-0000-0000-000000000001","role":"authenticated"}';
set local role authenticated;
select lives_ok(
  $$ select * from public.create_payment_intent('a6300000-0000-0000-0000-000000000001', 'yape') $$,
  'cliente uno crea intento Yape de S/30'
);
select lives_ok(
  $$ select public.submit_payment_evidence('a6300000-0000-0000-0000-000000000001', '111111') $$,
  'cliente uno registra su código completo'
);
reset role;

set local request.jwt.claims =
  '{"sub":"a6000000-0000-0000-0000-000000000002","role":"authenticated"}';
set local role authenticated;
select lives_ok(
  $$ select * from public.create_payment_intent('a6300000-0000-0000-0000-000000000002', 'yape') $$,
  'cliente dos crea segundo intento Yape de S/30'
);
select lives_ok(
  $$ select public.submit_payment_evidence('a6300000-0000-0000-0000-000000000002', '222222') $$,
  'cliente dos registra un código distinto'
);
reset role;

insert into public.wallet_observer_devices (
  id, restaurant_id, label, token_hash, token_last4
) values (
  'a6500000-0000-0000-0000-000000000001', 'a6200000-0000-0000-0000-000000000001',
  'Caja de prueba', extensions.crypt('payment-loop-device-token', extensions.gen_salt('bf')), 'beef'
);
insert into public.wallet_observations (
  id, device_id, restaurant_id, event_id, provider, sender_name, code_digest,
  code_fingerprint, code_last4, amount_cents, currency, observed_at
) values
  (
    'a6600000-0000-0000-0000-000000000001', 'a6500000-0000-0000-0000-000000000001',
    'a6200000-0000-0000-0000-000000000001', 'payment-loop-event-1', 'yape', 'Ana Uno',
    extensions.crypt('111111', extensions.gen_salt('bf')),
    encode(extensions.digest('111111', 'sha256'), 'hex'), '1111', 3000, 'PEN', now()
  ),
  (
    'a6600000-0000-0000-0000-000000000002', 'a6500000-0000-0000-0000-000000000001',
    'a6200000-0000-0000-0000-000000000001', 'payment-loop-event-2', 'yape', 'Ana Dos',
    extensions.crypt('222222', extensions.gen_salt('bf')),
    encode(extensions.digest('222222', 'sha256'), 'hex'), '2222', 3000, 'PEN', now()
  );

set local request.jwt.claims =
  '{"sub":"a6000000-0000-0000-0000-000000000003","role":"authenticated"}';
set local role authenticated;
select is(
  (select count(*) from public.list_wallet_payment_candidates('a6600000-0000-0000-0000-000000000001')),
  1::bigint,
  'S/30 observado uno solo encuentra su intento por código'
);
select is(
  (select count(*) from public.list_wallet_payment_candidates('a6600000-0000-0000-0000-000000000002')),
  1::bigint,
  'S/30 observado dos solo encuentra su intento por código'
);
select is(
  (select order_id::text from public.list_wallet_payment_candidates('a6600000-0000-0000-0000-000000000001') limit 1),
  'a6300000-0000-0000-0000-000000000001',
  'el primer código no cruza al cliente dos'
);
select is(
  (select order_id::text from public.list_wallet_payment_candidates('a6600000-0000-0000-0000-000000000002') limit 1),
  'a6300000-0000-0000-0000-000000000002',
  'el segundo código no cruza al cliente uno'
);
select lives_ok(
  $$ select public.verify_wallet_payment(
    'a6600000-0000-0000-0000-000000000001',
    (select id from public.payment_attempts where order_id = 'a6300000-0000-0000-0000-000000000001')
  ) $$,
  'caja autoriza el primer pago exacto'
);
select lives_ok(
  $$ select public.verify_wallet_payment(
    'a6600000-0000-0000-0000-000000000002',
    (select id from public.payment_attempts where order_id = 'a6300000-0000-0000-0000-000000000002')
  ) $$,
  'caja autoriza el segundo pago exacto'
);
select is(
  (select count(*) from public.payment_attempts where order_id in (
    'a6300000-0000-0000-0000-000000000001', 'a6300000-0000-0000-0000-000000000002'
  ) and status = 'authorized'),
  2::bigint,
  'los dos pagos iguales quedan autorizados en su pedido correcto'
);
reset role;

select * from finish();
rollback;
