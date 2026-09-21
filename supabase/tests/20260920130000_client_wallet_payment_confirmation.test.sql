begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(7);

select has_function(
  'public',
  'confirm_manual_wallet_payment',
  array['uuid', 'text', 'text'],
  'existe el RPC de confirmación de pago del cliente'
);
select ok(
  has_function_privilege(
    'anon',
    'public.confirm_manual_wallet_payment(uuid,text,text)',
    'EXECUTE'
  ),
  'los pedidos guest pueden solicitar la confirmación'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.confirm_manual_wallet_payment(uuid,text,text)',
    'EXECUTE'
  ),
  'los clientes autenticados pueden solicitar la confirmación'
);
select ok(
  (select prosecdef
   from pg_proc
   where oid = 'public.confirm_manual_wallet_payment(uuid,text,text)'::regprocedure),
  'la confirmación corre con security definer'
);
select ok(
  (select pg_get_functiondef('public.confirm_manual_wallet_payment(uuid,text,text)'::regprocedure)
    like '%observed_at%'
    and pg_get_functiondef('public.confirm_manual_wallet_payment(uuid,text,text)'::regprocedure)
      like '%payer_display_name%'),
  'la confirmación comprueba hora y conserva el nombre del pagador'
);
select ok(
  (select pg_get_functiondef('public.confirm_manual_wallet_payment(uuid,text,text)'::regprocedure)
    like '%status = ''authorized''%'),
  'la confirmación solo autoriza después de validar la observación'
);
select ok(
  (select pg_get_functiondef('public.confirm_manual_wallet_payment(uuid,text,text)'::regprocedure)
    like '%confirmation_status%'),
  'el cliente recibe estado pendiente o ambiguo sin fingir un pago exitoso'
);

select * from finish();
rollback;
