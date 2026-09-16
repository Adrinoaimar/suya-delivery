select plan(6);

select ok(
  (select pg_get_functiondef('public.create_payment_intent(uuid,text,text)'::regprocedure)
    like '%(select auth.uid()) is null or v_order.customer_id <>%'),
  'crear intento rechaza explícitamente la ausencia de sesión en una orden autenticada'
);

select ok(
  (select pg_get_functiondef('public.get_payment_intent(uuid,text)'::regprocedure)
    like '%(select auth.uid()) is null or v_order.customer_id <>%'),
  'leer intento no revela una orden autenticada a un anónimo'
);

select ok(
  (select prosecdef from pg_proc where oid = 'public.create_payment_intent(uuid,text,text)'::regprocedure),
  'crear intento conserva SECURITY DEFINER'
);

select ok(
  (select prosecdef from pg_proc where oid = 'public.get_payment_intent(uuid,text)'::regprocedure),
  'leer intento conserva SECURITY DEFINER'
);

select ok(
  has_function_privilege('anon', 'public.create_payment_intent(uuid,text,text)', 'execute')
    and has_function_privilege('authenticated', 'public.create_payment_intent(uuid,text,text)', 'execute'),
  'crear intento conserva acceso guest y autenticado por RPC'
);

select ok(
  has_function_privilege('anon', 'public.get_payment_intent(uuid,text)', 'execute')
    and has_function_privilege('authenticated', 'public.get_payment_intent(uuid,text)', 'execute'),
  'leer intento conserva acceso guest y autenticado por RPC'
);

select * from finish();
