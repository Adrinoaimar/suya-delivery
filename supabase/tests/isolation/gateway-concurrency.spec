# Entrada para PostgreSQL isolationtester, exclusivamente contra SUYA-STAGING-QA remoto.
# NO ejecutada: QA está pausada. No arrancar PostgreSQL local ni Docker.
# Cada permutación crea y elimina sus fixtures; requiere rol de pruebas con acceso privado.
# Los pasos bloqueados prueban locks reales entre conexiones, no mocks de JavaScript.
setup
{
  insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
    raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
  values('00000000-0000-0000-0000-000000000000','dc000000-0000-0000-0000-000000000001',
    'authenticated','authenticated','gateway-isolation@example.test','',now(),
    '{"provider":"email","providers":["email"]}','{"display_name":"QA concurrencia"}',now(),now());
  insert into public.categories(id,slug,name,icon)
  values('dc100000-0000-0000-0000-000000000001','gateway-isolation','QA concurrencia','wallet');
  insert into public.restaurants(id,slug,category_id,name,address,active,accepting_orders)
  values('dc200000-0000-0000-0000-000000000001','gateway-isolation',
    'dc100000-0000-0000-0000-000000000001','QA concurrencia','Sullana',true,true);
  insert into private.payment_gateway_configs(restaurant_id,version,environment,
    credentials_encrypted,collector_id,verified_at,webhook_verified_at,enabled,production_permissions_confirmed)
  values('dc200000-0000-0000-0000-000000000001',1,'live',repeat('x',80),
    'qa-isolation',now(),now(),true,true);
  insert into public.orders(id,code,customer_id,restaurant_id,status,payment_method,
    subtotal,delivery_fee,customer_name,customer_phone,delivery_address,estimated_minutes,idempotency_key)
  values
    ('dc300000-0000-0000-0000-000000000001','GWISO001','dc000000-0000-0000-0000-000000000001',
     'dc200000-0000-0000-0000-000000000001','pending_payment','yape',20,0,'QA uno','999999999',
     'Sullana',30,'dc400000-0000-0000-0000-000000000001'),
    ('dc300000-0000-0000-0000-000000000002','GWISO002','dc000000-0000-0000-0000-000000000001',
     'dc200000-0000-0000-0000-000000000001','pending_payment','yape',20,0,'QA dos','999999999',
     'Sullana',30,'dc400000-0000-0000-0000-000000000002');
  insert into public.payment_attempts(id,order_id,provider,method,amount,idempotency_key,
    checkout_reference,gateway_config_version,gateway_environment,gateway_state)
  values
    ('dc500000-0000-0000-0000-000000000001','dc300000-0000-0000-0000-000000000001',
     'mercadopago','yape',20,'qa-isolation-a','SUYA-GWISO001',1,'live','created'),
    ('dc500000-0000-0000-0000-000000000002','dc300000-0000-0000-0000-000000000002',
     'mercadopago','yape',20,'qa-isolation-b','SUYA-GWISO002',1,'live','created');
}

teardown
{
  delete from private.gateway_events where attempt_id in
    ('dc500000-0000-0000-0000-000000000001','dc500000-0000-0000-0000-000000000002');
  delete from private.gateway_transactions where attempt_id in
    ('dc500000-0000-0000-0000-000000000001','dc500000-0000-0000-0000-000000000002');
  delete from private.gateway_creation_claims where attempt_id in
    ('dc500000-0000-0000-0000-000000000001','dc500000-0000-0000-0000-000000000002');
  delete from public.payment_attempts where id in
    ('dc500000-0000-0000-0000-000000000001','dc500000-0000-0000-0000-000000000002');
  delete from public.orders where restaurant_id='dc200000-0000-0000-0000-000000000001';
  delete from private.payment_gateway_configs where restaurant_id='dc200000-0000-0000-0000-000000000001';
  delete from public.restaurants where id='dc200000-0000-0000-0000-000000000001';
  delete from public.categories where id='dc100000-0000-0000-0000-000000000001';
  delete from auth.users where id='dc000000-0000-0000-0000-000000000001';
}

session "s1"
step "s1_begin" {
  begin;
}
step "s1_pay_a"
{
  select public.apply_gateway_payment('mercadopago','qa-isolation-event',
    'dc500000-0000-0000-0000-000000000001','qa-isolation-txn',2000,'PEN','approved',now(),
    jsonb_build_object('collector_id','qa-isolation',
      'external_reference','dc500000-0000-0000-0000-000000000001',
      'order_id','dc300000-0000-0000-0000-000000000001','config_version','1','live_mode','true',
      'provider_updated_at',now()::text));
}
step "s1_claim_a"
{
  select set_config('request.jwt.claims',
    '{"sub":"dc000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
  select public.prepare_gateway_payment('dc300000-0000-0000-0000-000000000001','yape')
    ->>'attempt_id' as attempt_id;
}
step "s1_commit" {
  commit;
}

session "s2"
step "s2_begin" {
  begin;
}
step "s2_retry_a"
{
  select public.apply_gateway_payment('mercadopago','qa-isolation-event',
    'dc500000-0000-0000-0000-000000000001','qa-isolation-txn',2000,'PEN','approved',now(),
    jsonb_build_object('collector_id','qa-isolation',
      'external_reference','dc500000-0000-0000-0000-000000000001',
      'order_id','dc300000-0000-0000-0000-000000000001','config_version','1','live_mode','true',
      'provider_updated_at',now()::text));
}
step "s2_reuse_b"
{
  select public.apply_gateway_payment('mercadopago','qa-isolation-reuse-event',
    'dc500000-0000-0000-0000-000000000002','qa-isolation-txn',2000,'PEN','approved',now(),
    jsonb_build_object('collector_id','qa-isolation',
      'external_reference','dc500000-0000-0000-0000-000000000002',
      'order_id','dc300000-0000-0000-0000-000000000002','config_version','1','live_mode','true',
      'provider_updated_at',now()::text));
}
step "s2_claim_a"
{
  select set_config('request.jwt.claims',
    '{"sub":"dc000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
  select public.prepare_gateway_payment('dc300000-0000-0000-0000-000000000001','yape')
    ->>'attempt_id' as attempt_id;
}
step "s2_commit" {
  commit;
}

session "verify"
step "verify_once"
{
  select
    (select count(*)=1 from public.order_events
      where order_id='dc300000-0000-0000-0000-000000000001' and status='confirmed') as one_confirmation,
    (select count(*)=1 from private.gateway_transactions
      where provider='mercadopago' and transaction_id='qa-isolation-txn') as one_financial_identity,
    (select status='pending_payment' from public.orders
      where id='dc300000-0000-0000-0000-000000000002') as second_order_unpaid;
}
step "verify_one_claim"
{
  select count(*)=1 as one_creation_claim from private.gateway_creation_claims
    where attempt_id='dc500000-0000-0000-0000-000000000001';
  select count(*)=1 as one_attempt from public.payment_attempts
    where order_id='dc300000-0000-0000-0000-000000000001';
}

# s2 espera hasta commit s1; devuelve duplicate y todos los invariantes son true.
permutation "s1_begin" "s1_pay_a" "s2_begin" "s2_retry_a" "s1_commit" "s2_commit" "verify_once"
# Inserción UNIQUE del movimiento bloquea la carrera entre pedidos distintos.
permutation "s1_begin" "s1_pay_a" "s2_begin" "s2_reuse_b" "s1_commit" "s2_commit" "verify_once"
# s2 espera el lock de pedido, después falla 'checkout creation in progress'; no duplica reserva.
permutation "s1_begin" "s1_claim_a" "s2_begin" "s2_claim_a" "s1_commit" "s2_commit" "verify_one_claim"
