begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(8);

select has_function(
  'public',
  'confirm_manual_wallet_payment_by_code',
  array['uuid', 'text', 'text'],
  'existe el RPC de confirmación Yape por código'
);
select ok(
  has_function_privilege(
    'anon',
    'public.confirm_manual_wallet_payment_by_code(uuid,text,text)',
    'EXECUTE'
  ),
  'los pedidos guest pueden confirmar por código'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.confirm_manual_wallet_payment_by_code(uuid,text,text)',
    'EXECUTE'
  ),
  'los clientes autenticados pueden confirmar por código'
);
select ok(
  (select prosecdef
   from pg_proc
   where oid = 'public.confirm_manual_wallet_payment_by_code(uuid,text,text)'::regprocedure),
  'la confirmación Yape corre con security definer'
);
select ok(
  (select pg_get_functiondef('public.confirm_manual_wallet_payment_by_code(uuid,text,text)'::regprocedure)
    like '%p_confirmation_code%'
    and pg_get_functiondef('public.confirm_manual_wallet_payment_by_code(uuid,text,text)'::regprocedure)
      like '%^[0-9]{3}$%'),
  'el RPC exige exactamente tres dígitos'
);
select ok(
  (select pg_get_functiondef('public.confirm_manual_wallet_payment_by_code(uuid,text,text)'::regprocedure)
    like '%wo.code_last4 = v_confirmation_code%'),
  'la confirmación compara el código observado'
);
select ok(
  (select pg_get_functiondef('public.confirm_manual_wallet_payment_by_code(uuid,text,text)'::regprocedure)
    like '%observed_at%'
    and pg_get_functiondef('public.confirm_manual_wallet_payment_by_code(uuid,text,text)'::regprocedure)
      like '%receiver_account_id%'),
  'la confirmación conserva límites de hora y cuenta receptora'
);
select ok(
  (select pg_get_functiondef('public.confirm_manual_wallet_payment_by_code(uuid,text,text)'::regprocedure)
    like '%status = ''authorized''%'
    and pg_get_functiondef('public.confirm_manual_wallet_payment_by_code(uuid,text,text)'::regprocedure)
      like '%confirmation_status%'),
  'el pedido solo se libera cuando existe una observación única'
);

select * from finish();
rollback;
