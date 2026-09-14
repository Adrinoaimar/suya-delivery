begin;

select plan(41);

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

select * from finish();
rollback;
