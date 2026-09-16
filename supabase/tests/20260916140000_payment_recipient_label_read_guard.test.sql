select plan(8);

select has_function('public', 'get_payment_receiver_label', array['uuid', 'text'],
  'la lectura del destinatario conserva su contrato');

select ok(
  (select prosecdef from pg_proc
    where oid = 'public.get_payment_receiver_label(uuid,text)'::regprocedure),
  'la lectura del destinatario usa SECURITY DEFINER'
);

select ok(
  (select pg_get_functiondef('public.get_payment_receiver_label(uuid,text)'::regprocedure)
    like '%v_attempt.receiver_account_id%'),
  'la etiqueta se resuelve desde la cuenta receptora del intento'
);

select ok(
  (select pg_get_functiondef('public.get_payment_receiver_label(uuid,text)'::regprocedure)
    like '%rpa.restaurant_id = v_order.restaurant_id%'),
  'la etiqueta queda ligada al restaurante del pedido'
);

select ok(
  (select pg_get_functiondef('public.get_payment_receiver_label(uuid,text)'::regprocedure)
    like '%rpa.active%'),
  'una cuenta receptora inactiva no entrega su etiqueta'
);

select ok(
  (select pg_get_functiondef('public.get_payment_receiver_label(uuid,text)'::regprocedure)
    like '%guest_access_token_hash%'),
  'el acceso invitado requiere el token del pedido'
);

select ok(
  (select pg_get_functiondef('public.get_payment_receiver_label(uuid,text)'::regprocedure)
    like '%auth.uid()%'),
  'el usuario autenticado queda limitado al propietario del pedido'
);

select ok(
  has_function_privilege('anon', 'public.get_payment_receiver_label(uuid,text)', 'execute')
    and has_function_privilege('authenticated', 'public.get_payment_receiver_label(uuid,text)', 'execute'),
  'guest y usuario autenticado conservan lectura mínima'
);

select * from finish();
rollback;
