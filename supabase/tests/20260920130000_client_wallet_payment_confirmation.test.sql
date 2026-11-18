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
    not like '%update public.payment_attempts%'
    and pg_get_functiondef('public.confirm_manual_wallet_payment(uuid,text,text)'::regprocedure) not like '%update public.orders%'),
  'la vía de indicios conserva el registro financiero y el pedido sin autorizarlos'
);
select ok(
  (select pg_get_functiondef('public.confirm_manual_wallet_payment(uuid,text,text)'::regprocedure)
    not like '%update public.payment_attempts%'
    and pg_get_functiondef('public.confirm_manual_wallet_payment(uuid,text,text)'::regprocedure) not like '%update public.orders%'),
  'la vía de indicios conserva el registro financiero y el pedido sin autorizarlos'
);
select ok(
  (select pg_get_functiondef('public.confirm_manual_wallet_payment(uuid,text,text)'::regprocedure)
    not like '%update public.payment_attempts%'
    and pg_get_functiondef('public.confirm_manual_wallet_payment(uuid,text,text)'::regprocedure) not like '%update public.orders%'),
  'la vía de indicios conserva el registro financiero y el pedido sin autorizarlos'
);

select * from finish();
rollback;
