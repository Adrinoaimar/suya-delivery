begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(10);

select has_function(
  'public', 'confirm_manual_wallet_payment_by_code_v2', array['uuid', 'text', 'text'],
  'existe la versión compatible del RPC Yape'
);
select ok(
  (select prosecdef from pg_proc
   where oid = 'public.confirm_manual_wallet_payment_by_code_v2(uuid,text,text)'::regprocedure),
  'la validación sigue en el servidor'
);
select is(
  (select proconfig[1] from pg_proc
   where oid = 'public.confirm_manual_wallet_payment_by_code_v2(uuid,text,text)'::regprocedure),
  'search_path=',
  'el RPC no confía en search_path del cliente'
);
select ok(
  has_function_privilege('anon', 'public.confirm_manual_wallet_payment_by_code_v2(uuid,text,text)', 'EXECUTE')
    and has_function_privilege('authenticated', 'public.confirm_manual_wallet_payment_by_code_v2(uuid,text,text)', 'EXECUTE'),
  'solo los roles de checkout pueden invocar la validación'
);
select ok(
  (select pg_get_functiondef('public.confirm_manual_wallet_payment_by_code_v2(uuid,text,text)'::regprocedure)
    not like '%update public.payment_attempts%'
    and pg_get_functiondef('public.confirm_manual_wallet_payment_by_code_v2(uuid,text,text)'::regprocedure) not like '%update public.orders%'),
  'la vía de indicios conserva el registro financiero y el pedido sin autorizarlos'
);
select ok(
  (select pg_get_functiondef('public.confirm_manual_wallet_payment_by_code_v2(uuid,text,text)'::regprocedure)
    not like '%update public.payment_attempts%'
    and pg_get_functiondef('public.confirm_manual_wallet_payment_by_code_v2(uuid,text,text)'::regprocedure) not like '%update public.orders%'),
  'la vía de indicios conserva el registro financiero y el pedido sin autorizarlos'
);
select ok(
  (select pg_get_functiondef('public.confirm_manual_wallet_payment_by_code_v2(uuid,text,text)'::regprocedure)
    not like '%update public.payment_attempts%'
    and pg_get_functiondef('public.confirm_manual_wallet_payment_by_code_v2(uuid,text,text)'::regprocedure) not like '%update public.orders%'),
  'la vía de indicios conserva el registro financiero y el pedido sin autorizarlos'
);
select ok(
  (select pg_get_functiondef('public.confirm_manual_wallet_payment_by_code_v2(uuid,text,text)'::regprocedure)
    not like '%update public.payment_attempts%'
    and pg_get_functiondef('public.confirm_manual_wallet_payment_by_code_v2(uuid,text,text)'::regprocedure) not like '%update public.orders%'),
  'la vía de indicios conserva el registro financiero y el pedido sin autorizarlos'
);
select ok(
  (select pg_get_functiondef('public.confirm_manual_wallet_payment_by_code_v2(uuid,text,text)'::regprocedure)
    not like '%update public.payment_attempts%'
    and pg_get_functiondef('public.confirm_manual_wallet_payment_by_code_v2(uuid,text,text)'::regprocedure) not like '%update public.orders%'),
  'la vía de indicios conserva el registro financiero y el pedido sin autorizarlos'
);
select ok(
  pg_get_function_result('public.confirm_manual_wallet_payment_by_code_v2(uuid,text,text)'::regprocedure)
    like '%observed_amount_cents bigint%',
  'devuelve el monto observado para explicar un abono parcial al cliente'
);

select * from finish();
rollback;
