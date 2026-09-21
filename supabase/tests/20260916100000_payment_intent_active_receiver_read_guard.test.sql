select plan(4);

select has_function('public', 'get_payment_intent', array['uuid', 'text'],
  'la lectura de intent conserva su contrato');

select ok(
  (select pg_get_functiondef('public.get_payment_intent(uuid,text)'::regprocedure)
    like '%rpa.id = v_attempt.receiver_account_id%and rpa.active%'),
  'un receptor vinculado solo expone QR mientras está activo'
);

select ok(
  (select prosecdef from pg_proc
    where oid = 'public.get_payment_intent(uuid,text)'::regprocedure),
  'la lectura conserva SECURITY DEFINER y autorización interna'
);

select ok(
  has_function_privilege('anon', 'public.get_payment_intent(uuid,text)', 'execute')
    and has_function_privilege('authenticated', 'public.get_payment_intent(uuid,text)', 'execute'),
  'guest y usuario autenticado conservan acceso al comprobante'
);

select * from finish();
rollback;
