begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(6);

select has_function(
  'public', 'confirm_manual_wallet_payment_by_code_v2', array['uuid', 'text', 'text'],
  'el RPC de confirmación Yape sigue disponible'
);
select ok(
  (select prosecdef from pg_proc
   where oid = 'public.confirm_manual_wallet_payment_by_code_v2(uuid,text,text)'::regprocedure)
    and (select proconfig[1] from pg_proc
         where oid = 'public.confirm_manual_wallet_payment_by_code_v2(uuid,text,text)'::regprocedure)
      = 'search_path=',
  'el cambio conserva security definer con search_path vacío'
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

select * from finish();
rollback;
