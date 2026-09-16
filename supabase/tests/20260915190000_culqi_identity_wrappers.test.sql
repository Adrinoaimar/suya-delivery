select plan(12);

select ok(
  (select pg_get_functiondef('private.require_payment_actor(uuid,text)'::regprocedure)
    like '%(select auth.uid()) is null or v_customer_id <>%'),
  'el helper de identidad trata auth.uid nulo como rechazo'
);

select ok(
  (select pg_get_functiondef('private.require_payment_attempt_actor(uuid,text)'::regprocedure)
    like '%private.require_payment_actor%'),
  'la identidad de un intento se resuelve por su orden'
);

select ok(
  (select pg_get_functiondef('public.create_culqi_payment_intent_secure(uuid,text,text)'::regprocedure)
    like '%private.require_payment_actor%'),
  'crear intento Culqi valida identidad antes de delegar'
);

select ok(
  (select pg_get_functiondef('public.claim_culqi_order_creation_secure(uuid,text,text)'::regprocedure)
    like '%private.require_payment_attempt_actor%'),
  'reservar orden Culqi valida identidad antes de delegar'
);

select ok(
  (select pg_get_functiondef('public.claim_culqi_payment_secure(uuid,text,text)'::regprocedure)
    like '%private.require_payment_attempt_actor%'),
  'reservar cargo Culqi valida identidad antes de delegar'
);

select ok(
  (select pg_get_functiondef('public.authorize_culqi_payment_secure(uuid,text,text,text,text)'::regprocedure)
    like '%private.require_payment_attempt_actor%'),
  'autorizar cargo Culqi valida identidad antes de delegar'
);

select ok(
  (select pg_get_functiondef('public.fail_culqi_payment_claim_secure(uuid,text,text,text)'::regprocedure)
    like '%private.require_payment_attempt_actor%'),
  'fallar reserva Culqi valida identidad antes de delegar'
);

select ok(
  not has_function_privilege('anon', 'public.create_culqi_payment_intent(uuid,text,text)', 'execute')
    and not has_function_privilege('authenticated', 'public.create_culqi_payment_intent(uuid,text,text)', 'execute'),
  'la RPC Culqi antigua de creación ya no es pública'
);

select ok(
  not has_function_privilege('anon', 'public.claim_culqi_payment(uuid,text,text)', 'execute')
    and not has_function_privilege('authenticated', 'public.claim_culqi_payment(uuid,text,text)', 'execute'),
  'la RPC Culqi antigua de reserva ya no es pública'
);

select ok(
  not has_function_privilege('anon', 'public.authorize_culqi_payment(uuid,text,text,text,text)', 'execute')
    and not has_function_privilege('authenticated', 'public.authorize_culqi_payment(uuid,text,text,text,text)', 'execute'),
  'la RPC Culqi antigua de autorización ya no es pública'
);

select ok(
  not has_function_privilege('anon', 'public.get_culqi_card_payment_context(uuid,text)', 'execute')
    and not has_function_privilege('authenticated', 'public.get_culqi_card_payment_context(uuid,text)', 'execute'),
  'el contexto Culqi legacy no es público'
);

select ok(
  has_function_privilege('anon', 'public.create_culqi_payment_intent_secure(uuid,text,text)', 'execute')
    and has_function_privilege('authenticated', 'public.create_culqi_payment_intent_secure(uuid,text,text)', 'execute')
    and has_function_privilege('anon', 'public.claim_culqi_payment_secure(uuid,text,text)', 'execute')
    and has_function_privilege('authenticated', 'public.claim_culqi_payment_secure(uuid,text,text)', 'execute'),
  'los wrappers seguros conservan acceso guest y autenticado'
);

select * from finish();
