begin;

select plan(15);

select has_function('public', 'create_delivery_order_with_payment',
  array['uuid', 'jsonb', 'text', 'text', 'text', 'uuid', 'text', 'text', 'double precision', 'double precision'],
  'checkout delivery wallet atómico existe');
select has_function('public', 'create_menu_order_with_payment',
  array['uuid', 'jsonb', 'text', 'text', 'text', 'text', 'uuid', 'text', 'text', 'double precision', 'double precision', 'text'],
  'checkout menu wallet atómico existe');
select has_function('public', 'create_table_order_with_payment',
  array['uuid', 'jsonb', 'text', 'text', 'text', 'text', 'uuid', 'uuid', 'uuid', 'text', 'text', 'text'],
  'checkout mesa wallet atómico existe');
select has_function('public', 'create_wallet_observer_device_for_account',
  array['uuid', 'uuid', 'text'], 'dispositivo ligado a cuenta receptora existe');

select ok((select exists (select 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'payment_attempts' and column_name = 'receiver_account_id')),
  'intento conserva cuenta receptora');
select ok((select exists (select 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'wallet_observer_devices' and column_name = 'receiver_account_id')),
  'dispositivo conserva cuenta receptora');
select ok((select exists (select 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'wallet_observations' and column_name = 'receiver_account_id')),
  'observación conserva cuenta receptora');
select ok((select exists (select 1 from pg_indexes
  where schemaname = 'public' and indexname = 'payment_attempts_observed_wallet_uidx')),
  'una observación no puede autorizar dos intentos');
select ok((select pg_get_functiondef('public.create_menu_order_with_payment(uuid,jsonb,text,text,text,text,uuid,text,text,double precision,double precision,text)'::regprocedure)
  like '%create_payment_intent%'), 'menu atómico crea el intento dentro de su RPC');
select ok((select pg_get_functiondef('public.create_menu_order_with_payment(uuid,jsonb,text,text,text,text,uuid,text,text,double precision,double precision,text)'::regprocedure)
  like '%apply_app_offer%'), 'menu atómico aplica la oferta antes del cobro');
select ok((select pg_get_functiondef('public.get_payment_intent(uuid,text)'::regprocedure)
  like '%v_attempt.receiver_account_id%'), 'consulta de pago conserva la cuenta receptora');

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000', 'b7000000-0000-0000-0000-000000000001',
  'authenticated', 'authenticated', 'receiver-binding@example.test', '', now(),
  '{"provider":"email","providers":["email"]}', '{"display_name":"Caja binding"}', now(), now()
);
insert into public.categories (id, slug, name, icon)
values ('b7100000-0000-0000-0000-000000000001', 'receiver-binding', 'Binding', 'wallet');
insert into public.restaurants (id, slug, category_id, name, address, active, accepting_orders)
values ('b7200000-0000-0000-0000-000000000001', 'receiver-binding',
  'b7100000-0000-0000-0000-000000000001', 'Receiver Binding', 'Sullana', true, true);
insert into public.restaurant_members (restaurant_id, user_id, role)
values ('b7200000-0000-0000-0000-000000000001', 'b7000000-0000-0000-0000-000000000001', 'owner');
insert into public.restaurant_payment_accounts (id, restaurant_id, provider, account_label, active)
values ('b7300000-0000-0000-0000-000000000001', 'b7200000-0000-0000-0000-000000000001', 'yape', 'Caja Yape', true),
       ('b7300000-0000-0000-0000-000000000002', 'b7200000-0000-0000-0000-000000000001', 'lemon', 'Caja Lemon', true);
insert into public.wallet_observer_devices (
  id, restaurant_id, receiver_account_id, label, token_hash, token_last4
) values (
  'b7400000-0000-0000-0000-000000000001', 'b7200000-0000-0000-0000-000000000001',
  'b7300000-0000-0000-0000-000000000001', 'Caja binding',
  extensions.crypt('receiver-binding-device-token', extensions.gen_salt('bf')), 'babe'
);
insert into public.orders (
  id, code, customer_id, restaurant_id, status, payment_method, subtotal, delivery_fee,
  customer_name, customer_phone, delivery_address, estimated_minutes, idempotency_key
) values
  ('b7500000-0000-0000-0000-000000000001', 'BINDING1', 'b7000000-0000-0000-0000-000000000001',
   'b7200000-0000-0000-0000-000000000001', 'confirmed', 'yape', 30, 0, 'Cliente Binding',
   '999999999', 'Calle Binding 1', 30, 'b7600000-0000-0000-0000-000000000001'),
  ('b7500000-0000-0000-0000-000000000002', 'BINDING2', 'b7000000-0000-0000-0000-000000000001',
   'b7200000-0000-0000-0000-000000000001', 'confirmed', 'yape', 30, 0, 'Cliente Binding 2',
   '999999998', 'Calle Binding 2', 30, 'b7600000-0000-0000-0000-000000000002');

insert into public.payment_attempts (
  id, order_id, receiver_account_id, provider, method, status, amount, idempotency_key,
  payer_code_last4, payer_code_digest, checkout_reference, expires_at
) values
  ('b7700000-0000-0000-0000-000000000001', 'b7500000-0000-0000-0000-000000000001',
   'b7300000-0000-0000-0000-000000000001', 'wallet_observer', 'yape', 'pending', 30,
   'b7800000-0000-0000-0000-000000000001', '1234', encode(extensions.digest('same-code', 'sha256'), 'hex'),
   'SUYA-BIND001', now() + interval '30 minutes'),
  ('b7700000-0000-0000-0000-000000000002', 'b7500000-0000-0000-0000-000000000002',
   'b7300000-0000-0000-0000-000000000001', 'wallet_observer', 'yape', 'pending', 30,
   'b7800000-0000-0000-0000-000000000002', '1234', encode(extensions.digest('same-code', 'sha256'), 'hex'),
   'SUYA-BIND002', now() + interval '30 minutes');
insert into public.wallet_observations (
  id, device_id, restaurant_id, receiver_account_id, event_id, provider, code_last4,
  code_fingerprint, amount_cents, currency, observed_at
) values (
  'b7900000-0000-0000-0000-000000000001', 'b7400000-0000-0000-0000-000000000001',
  'b7200000-0000-0000-0000-000000000001', 'b7300000-0000-0000-0000-000000000001',
  'receiver-binding-event', 'yape', '1234', encode(extensions.digest('same-code', 'sha256'), 'hex'),
  3000, 'PEN', now()
);

set local request.jwt.claims = '{"sub":"b7000000-0000-0000-0000-000000000001","role":"authenticated"}';
set local role authenticated;
select is((select count(*) from public.list_wallet_payment_candidates('b7900000-0000-0000-0000-000000000001')),
  2::bigint, 'el listado muestra la colisión de código completo');
select throws_ok(
  $$ select public.verify_wallet_payment('b7900000-0000-0000-0000-000000000001', 'b7700000-0000-0000-0000-000000000001') $$,
  'payment identity is ambiguous; full operation code required',
  'la colisión de código completo no se autoriza');
delete from public.payment_attempts where id = 'b7700000-0000-0000-0000-000000000002';
select lives_ok(
  $$ select public.verify_wallet_payment('b7900000-0000-0000-0000-000000000001', 'b7700000-0000-0000-0000-000000000001') $$,
  'una coincidencia única sí se verifica');
select is((select status::text from public.payment_attempts where id = 'b7700000-0000-0000-0000-000000000001'),
  'authorized', 'la autorización actualiza el intento exacto');

select * from finish();
rollback;
