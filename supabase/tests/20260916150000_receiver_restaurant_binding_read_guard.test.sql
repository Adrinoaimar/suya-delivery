select plan(15);

select has_function('public', 'get_payment_intent', array['uuid', 'text'],
  'la lectura de intent conserva su contrato');

select has_function('public', 'create_payment_intent', array['uuid', 'text', 'text'],
  'la creación de intent conserva su contrato');

select has_function('public', 'refresh_payment_intent', array['uuid', 'text', 'text'],
  'la renovación de intent conserva su contrato');

select ok(
  (select pg_get_functiondef('public.get_payment_intent(uuid,text)'::regprocedure)
    like '%rpa.id = v_attempt.receiver_account_id%rpa.restaurant_id = v_order.restaurant_id%'),
  'get_payment_intent liga la cuenta receptora al restaurante del pedido'
);

select ok(
  (select pg_get_functiondef('public.create_payment_intent(uuid,text,text)'::regprocedure)
    like '%rpa.id = v_attempt.receiver_account_id%rpa.restaurant_id = v_order.restaurant_id%'),
  'create_payment_intent liga el reintento al restaurante del pedido'
);

select ok(
  (select pg_get_functiondef('public.refresh_payment_intent(uuid,text,text)'::regprocedure)
    like '%rpa.id = v_receiver_account_id%rpa.restaurant_id = v_restaurant_id%'),
  'refresh_payment_intent liga la renovación al restaurante del pedido'
);

select ok(
  (select pg_get_functiondef('public.get_payment_intent(uuid,text)'::regprocedure)
    like '%rpa.restaurant_id = v_order.restaurant_id%rpa.active%'),
  'la lectura solo expone una cuenta activa del restaurante correcto'
);

select ok(
  (select pg_get_functiondef('public.create_payment_intent(uuid,text,text)'::regprocedure)
    like '%rpa.restaurant_id = v_order.restaurant_id%rpa.active%'),
  'la creación solo reutiliza una cuenta activa del restaurante correcto'
);

select ok(
  (select pg_get_functiondef('public.refresh_payment_intent(uuid,text,text)'::regprocedure)
    like '%rpa.restaurant_id = v_restaurant_id%rpa.active%'),
  'la renovación solo reutiliza una cuenta activa del restaurante correcto'
);

select ok(
  (select prosecdef from pg_proc
    where oid = 'public.get_payment_intent(uuid,text)'::regprocedure),
  'get_payment_intent conserva SECURITY DEFINER'
);

select ok(
  (select prosecdef from pg_proc
    where oid = 'public.create_payment_intent(uuid,text,text)'::regprocedure),
  'create_payment_intent conserva SECURITY DEFINER'
);

select ok(
  (select prosecdef from pg_proc
    where oid = 'public.refresh_payment_intent(uuid,text,text)'::regprocedure),
  'refresh_payment_intent conserva SECURITY DEFINER'
);

select ok(
  has_function_privilege('anon', 'public.get_payment_intent(uuid,text)', 'execute')
    and has_function_privilege('authenticated', 'public.get_payment_intent(uuid,text)', 'execute'),
  'guest y autenticado conservan lectura del intento'
);

select ok(
  has_function_privilege('anon', 'public.create_payment_intent(uuid,text,text)', 'execute')
    and has_function_privilege('authenticated', 'public.create_payment_intent(uuid,text,text)', 'execute'),
  'guest y autenticado conservan creación controlada del intento'
);

select ok(
  has_function_privilege('anon', 'public.refresh_payment_intent(uuid,text,text)', 'execute')
    and has_function_privilege('authenticated', 'public.refresh_payment_intent(uuid,text,text)', 'execute'),
  'guest y autenticado conservan renovación controlada del intento'
);

select * from finish();
rollback;
