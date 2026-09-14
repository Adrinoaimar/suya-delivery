begin;

select plan(95);

select has_function(
  'public', 'refresh_payment_intent', array['uuid', 'text', 'text'],
  'renovar intento expirado existe'
);

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
  'public', 'claim_culqi_order_creation', array['uuid', 'text', 'text'],
  'reservar creación externa Culqi existe'
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
  exists (select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'payment_attempts'
      and column_name = 'gateway_order_claim_digest'),
  'el intento conserva solo el digest de creación de orden Culqi'
);
select ok(
  exists (select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'payment_attempts'
      and column_name = 'gateway_order_claimed_at'),
  'el intento conserva la vigencia de creación de orden Culqi'
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
  has_function_privilege('anon', 'public.refresh_payment_intent(uuid,text,text)', 'execute')
    and has_function_privilege('authenticated', 'public.refresh_payment_intent(uuid,text,text)', 'execute'),
  'cliente y guest pueden renovar un intento expirado'
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
  (select pg_get_functiondef('public.refresh_payment_intent(uuid,text,text)'::regprocedure)
    like '%expires_at <= now()%'),
  'la renovación solo reemplaza intentos expirados'
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
  (select prosecdef from pg_proc where oid = 'public.claim_culqi_order_creation(uuid,text,text)'::regprocedure),
  'reservar creación Culqi usa security definer'
);
select ok(
  has_function_privilege('anon', 'public.claim_culqi_order_creation(uuid,text,text)', 'execute')
    and has_function_privilege('authenticated', 'public.claim_culqi_order_creation(uuid,text,text)', 'execute'),
  'cliente y guest pueden reservar una sola creación Culqi'
);
select ok(
  (select pg_get_functiondef('public.claim_culqi_order_creation(uuid,text,text)'::regprocedure)
    like '%gateway_order_claim_digest%'),
  'la creación externa queda ligada a su digest efímero'
);
select ok(
  (select pg_get_functiondef('public.list_wallet_payment_candidates(uuid)'::regprocedure)
    like '%pa.provider = ''wallet_observer''%'),
  'las observaciones no buscan intentos Culqi'
);
select ok(
  (select pg_get_functiondef('public.verify_wallet_payment(uuid,uuid)'::regprocedure)
    like '%v_attempt.provider <> ''wallet_observer''%'),
  'la verificación no puede autorizar una tentativa Culqi'
);
select ok(
  (select pg_get_functiondef('public.verify_wallet_payment(uuid,uuid)'::regprocedure)
    like '%payment identity is ambiguous%'),
  'un sufijo ambiguo exige el código completo'
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
  (select pg_get_functiondef('public.verify_wallet_payment(uuid,uuid)'::regprocedure)
    like '%v_attempt.created_at > v_observation.observed_at%'),
  'la verificación rechaza intentos creados después de la notificación'
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
   'a6400000-0000-0000-0000-000000000002'),
  ('a6300000-0000-0000-0000-000000000003', 'PAYTEST3',
   'a6000000-0000-0000-0000-000000000001', 'a6200000-0000-0000-0000-000000000001',
   'confirmed', 'cash', 27, 3, 'Cliente Uno', '999111111', 'Dirección tres', 30,
   'a6400000-0000-0000-0000-000000000003'),
  ('a6300000-0000-0000-0000-000000000004', 'PAYTEST4',
   'a6000000-0000-0000-0000-000000000001', 'a6200000-0000-0000-0000-000000000001',
   'confirmed', 'cash', 27, 3, 'Cliente Uno', '999111111', 'Dirección cuatro', 30,
   'a6400000-0000-0000-0000-000000000004');

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
select lives_ok(
  $$ select * from public.create_payment_intent('a6300000-0000-0000-0000-000000000004', 'yape') $$,
  'cliente uno crea intento renovable'
);
reset role;
update public.payment_attempts
set expires_at = now() - interval '1 minute'
where order_id = 'a6300000-0000-0000-0000-000000000004';
set local role authenticated;
select lives_ok(
  $$ select * from public.refresh_payment_intent('a6300000-0000-0000-0000-000000000004', 'yape') $$,
  'un intento expirado genera una referencia nueva'
);
select is(
  (select count(*) from public.payment_attempts where order_id = 'a6300000-0000-0000-0000-000000000004' and status = 'pending'),
  1::bigint,
  'la renovación conserva un solo intento pendiente'
);
select is(
  (select count(*) from public.payment_attempts where order_id = 'a6300000-0000-0000-0000-000000000004' and status = 'failed' and failure_code = 'expired'),
  1::bigint,
  'el intento vencido queda cerrado como expirado'
);
select lives_ok(
  $$ select * from public.create_culqi_payment_intent('a6300000-0000-0000-0000-000000000003', 'yape') $$,
  'cliente uno crea intento Culqi de S/30'
);
select lives_ok(
  $$ select * from public.claim_culqi_order_creation(
    (select id from public.payment_attempts where order_id = 'a6300000-0000-0000-0000-000000000003'), 'yape'
  ) $$,
  'primer toque reserva la creación externa Culqi'
);
select throws_ok(
  $$ select * from public.claim_culqi_order_creation(
    (select id from public.payment_attempts where order_id = 'a6300000-0000-0000-0000-000000000003'), 'yape'
  ) $$,
  'payment attempt is already preparing',
  'segundo toque no crea otra orden Culqi'
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

-- Negative identity loop: a notification exposing only the same last four
-- characters must not let the operator choose between two S/30 attempts.
reset role;
insert into public.orders (
  id, code, customer_id, restaurant_id, status, payment_method, subtotal, delivery_fee,
  customer_name, customer_phone, delivery_address, estimated_minutes, idempotency_key
) values
  ('a6300000-0000-0000-0000-000000000005', 'PAYTEST5',
   'a6000000-0000-0000-0000-000000000001', 'a6200000-0000-0000-0000-000000000001',
   'confirmed', 'cash', 27, 3, 'Cliente Uno', '999111111', 'Dirección cinco', 30,
   'a6400000-0000-0000-0000-000000000005'),
  ('a6300000-0000-0000-0000-000000000006', 'PAYTEST6',
   'a6000000-0000-0000-0000-000000000002', 'a6200000-0000-0000-0000-000000000001',
   'confirmed', 'cash', 27, 3, 'Cliente Dos', '999222222', 'Dirección seis', 30,
   'a6400000-0000-0000-0000-000000000006');

set local request.jwt.claims =
  '{"sub":"a6000000-0000-0000-0000-000000000001","role":"authenticated"}';
set local role authenticated;
select lives_ok(
  $$ select * from public.create_payment_intent('a6300000-0000-0000-0000-000000000005', 'yape') $$,
  'cliente uno crea intento para negativo de sufijo repetido'
);
reset role;
set local request.jwt.claims =
  '{"sub":"a6000000-0000-0000-0000-000000000002","role":"authenticated"}';
set local role authenticated;
select lives_ok(
  $$ select * from public.create_payment_intent('a6300000-0000-0000-0000-000000000006', 'yape') $$,
  'cliente dos crea intento para negativo de sufijo repetido'
);
reset role;

update public.payment_attempts
set payer_code_last4 = '1234', payer_code_digest = null
where order_id in (
  'a6300000-0000-0000-0000-000000000005',
  'a6300000-0000-0000-0000-000000000006'
);
insert into public.wallet_observations (
  id, device_id, restaurant_id, event_id, provider, sender_name, code_digest,
  code_fingerprint, code_last4, amount_cents, currency, observed_at
) values (
  'a6600000-0000-0000-0000-000000000003', 'a6500000-0000-0000-0000-000000000001',
  'a6200000-0000-0000-0000-000000000001', 'payment-loop-event-3', 'yape', 'Remitente no identificado',
  null, null, '1234', 3000, 'PEN', now()
);

set local request.jwt.claims =
  '{"sub":"a6000000-0000-0000-0000-000000000003","role":"authenticated"}';
set local role authenticated;
select is(
  (select count(*) from public.list_wallet_payment_candidates('a6600000-0000-0000-0000-000000000003')),
  2::bigint,
  'el mismo sufijo muestra los dos candidatos y no decide por monto'
);
select throws_ok(
  $$ select public.verify_wallet_payment(
    'a6600000-0000-0000-0000-000000000003',
    (select id from public.payment_attempts where order_id = 'a6300000-0000-0000-0000-000000000005')
  ) $$,
  'payment identity is ambiguous; full operation code required',
  'la verificación rechaza el sufijo ambiguo'
);

select lives_ok(
  $$ select public.set_wallet_observation_code('a6600000-0000-0000-0000-000000000003', 'ABCD1234') $$,
  'caja completa el código visible en la constancia'
);
reset role;
update public.payment_attempts
set payer_code_digest = encode(extensions.digest('abcd1234', 'sha256'), 'hex')
where order_id = 'a6300000-0000-0000-0000-000000000005';
update public.payment_attempts
set payer_code_digest = encode(extensions.digest('wxyz1234', 'sha256'), 'hex')
where order_id = 'a6300000-0000-0000-0000-000000000006';
set local request.jwt.claims =
  '{"sub":"a6000000-0000-0000-0000-000000000003","role":"authenticated"}';
set local role authenticated;
select is(
  (select count(*) from public.list_wallet_payment_candidates('a6600000-0000-0000-0000-000000000003')),
  1::bigint,
  'el código completo reduce los candidatos a un solo pedido'
);
select lives_ok(
  $$ select public.verify_wallet_payment(
    'a6600000-0000-0000-0000-000000000003',
    (select id from public.payment_attempts where order_id = 'a6300000-0000-0000-0000-000000000005')
  ) $$,
  'el código completo autoriza únicamente el pedido correcto'
);

-- Temporal negative: an observation cannot authorize a payment created later,
-- even if the amount and visible code happen to match.
reset role;
insert into public.orders (
  id, code, customer_id, restaurant_id, status, payment_method, subtotal, delivery_fee,
  customer_name, customer_phone, delivery_address, estimated_minutes, idempotency_key
) values (
  'a6300000-0000-0000-0000-000000000007', 'PAYTEST7',
  'a6000000-0000-0000-0000-000000000001', 'a6200000-0000-0000-0000-000000000001',
  'confirmed', 'cash', 27, 3, 'Cliente Uno', '999111111', 'Dirección siete', 30,
  'a6400000-0000-0000-0000-000000000007'
);
set local request.jwt.claims =
  '{"sub":"a6000000-0000-0000-0000-000000000001","role":"authenticated"}';
set local role authenticated;
select lives_ok(
  $$ select * from public.create_payment_intent('a6300000-0000-0000-0000-000000000007', 'yape') $$,
  'cliente uno crea intento para el negativo temporal'
);
reset role;
update public.payment_attempts
set created_at = now() + interval '1 minute', payer_code_last4 = '7777', payer_code_digest = null
where order_id = 'a6300000-0000-0000-0000-000000000007';
insert into public.wallet_observations (
  id, device_id, restaurant_id, event_id, provider, sender_name, code_digest,
  code_fingerprint, code_last4, amount_cents, currency, observed_at
) values (
  'a6600000-0000-0000-0000-000000000004', 'a6500000-0000-0000-0000-000000000001',
  'a6200000-0000-0000-0000-000000000001', 'payment-loop-event-4', 'yape', 'Remitente futuro',
  null, null, '7777', 3000, 'PEN', now()
);
set local request.jwt.claims =
  '{"sub":"a6000000-0000-0000-0000-000000000003","role":"authenticated"}';
set local role authenticated;
select throws_ok(
  $$ select public.verify_wallet_payment(
    'a6600000-0000-0000-0000-000000000004',
    (select id from public.payment_attempts where order_id = 'a6300000-0000-0000-0000-000000000007')
  ) $$,
  'wallet observation does not match payment identity',
  'la verificación rechaza pagos creados después de la observación'
);
reset role;

-- A cancelled order closes its pending attempt and cannot be reconciled later.
insert into public.orders (
  id, code, customer_id, restaurant_id, status, payment_method, subtotal, delivery_fee,
  customer_name, customer_phone, delivery_address, estimated_minutes, idempotency_key
) values (
  'a6300000-0000-0000-0000-000000000008', 'PAYTEST8',
  'a6000000-0000-0000-0000-000000000001', 'a6200000-0000-0000-0000-000000000001',
  'confirmed', 'cash', 27, 3, 'Cliente Cancelado', '999333333', 'Dirección ocho', 30,
  'a6400000-0000-0000-0000-000000000008'
);
set local request.jwt.claims =
  '{"sub":"a6000000-0000-0000-0000-000000000001","role":"authenticated"}';
set local role authenticated;
select lives_ok(
  $$ select * from public.create_payment_intent('a6300000-0000-0000-0000-000000000008', 'yape') $$,
  'cliente crea intento antes de cancelar'
);
reset role;
set local request.jwt.claims =
  '{"sub":"a6000000-0000-0000-0000-000000000003","role":"authenticated"}';
set local role service_role;
update public.orders
set status = 'cancelled', cancelled_at = now(), cancellation_reason = 'prueba de seguridad'
where id = 'a6300000-0000-0000-0000-000000000008';
reset role;
select is(
  (select status::text from public.payment_attempts where order_id = 'a6300000-0000-0000-0000-000000000008'),
  'failed',
  'cancelar pedido cierra el intento pendiente'
);
select is(
  (select failure_code from public.payment_attempts where order_id = 'a6300000-0000-0000-0000-000000000008'),
  'order_cancelled',
  'el intento cancelado conserva motivo operativo'
);
insert into public.wallet_observations (
  id, device_id, restaurant_id, event_id, provider, sender_name, code_digest,
  code_fingerprint, code_last4, amount_cents, currency, observed_at
) values (
  'a6600000-0000-0000-0000-000000000005', 'a6500000-0000-0000-0000-000000000001',
  'a6200000-0000-0000-0000-000000000001', 'payment-loop-event-5', 'yape', 'Cliente Cancelado',
  extensions.crypt('333333', extensions.gen_salt('bf')),
  encode(extensions.digest('333333', 'sha256'), 'hex'), '3333', 3000, 'PEN', now()
);
set local request.jwt.claims =
  '{"sub":"a6000000-0000-0000-0000-000000000003","role":"authenticated"}';
set local role authenticated;
select is(
  (select count(*) from public.list_wallet_payment_candidates('a6600000-0000-0000-0000-000000000005')),
  0::bigint,
  'un pedido cancelado no aparece como candidato de conciliación'
);
select throws_ok(
  $$ select public.verify_wallet_payment(
    'a6600000-0000-0000-0000-000000000005',
    (select id from public.payment_attempts where order_id = 'a6300000-0000-0000-0000-000000000008')
  ) $$,
  'cancelled order cannot be verified',
  'la autorización final rechaza un pedido cancelado'
);
reset role;

select * from finish();
rollback;
