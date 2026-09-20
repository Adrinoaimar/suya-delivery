begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(8);

select has_column('public', 'payment_attempts', 'checkout_reference', 'intento Lemon guarda referencia visible');
select has_column('public', 'payment_attempts', 'expires_at', 'intento Lemon guarda expiración');
select ok(
  exists (select 1 from pg_enum where enumtypid = 'public.payment_method'::regtype and enumlabel = 'lemon'),
  'payment_method incluye Lemon'
);
select has_function('public', 'create_lemon_payment_intent', array['uuid', 'text'], 'RPC crea intento Lemon');
select has_function('public', 'reconcile_lemon_payment', array['uuid', 'uuid'], 'RPC reconcilia evidencia Lemon');
select ok(
  (select prosecdef and proconfig = array['search_path=""']::text[]
   from pg_proc where oid = 'public.create_lemon_payment_intent(uuid,text)'::regprocedure),
  'RPC Lemon usa SECURITY DEFINER con search_path vacío'
);
select ok(
  has_function_privilege('anon', 'public.create_lemon_payment_intent(uuid,text)', 'execute')
  and has_function_privilege('authenticated', 'public.create_lemon_payment_intent(uuid,text)', 'execute'),
  'checkout Lemon disponible para guest y cliente autenticado'
);
select ok(
  not has_function_privilege('anon', 'public.reconcile_lemon_payment(uuid,uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.reconcile_lemon_payment(uuid,uuid)', 'execute'),
  'reconciliación Lemon cerrada a anon'
);

select * from finish();
rollback;
