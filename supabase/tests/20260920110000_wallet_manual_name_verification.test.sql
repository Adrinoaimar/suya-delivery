begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(8);

select has_function(
  'public',
  'verify_wallet_payment_by_name',
  array['uuid', 'text'],
  'existe el RPC de aprobación manual por nombre'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.verify_wallet_payment_by_name(uuid,text)',
    'EXECUTE'
  ),
  'solo usuarios autenticados pueden solicitar aprobación por nombre'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.verify_wallet_payment_by_name(uuid,text)',
    'EXECUTE'
  ),
  'anon no puede aprobar pagos por nombre'
);
select ok(
  (select prosecdef
   from pg_proc
   where oid = 'public.verify_wallet_payment_by_name(uuid,text)'::regprocedure),
  'la aprobación manual usa security definer'
);
select ok(
  (select pg_get_functiondef('public.verify_wallet_payment_by_name(uuid,text)'::regprocedure)
    not like '%update public.payment_attempts%'
    and pg_get_functiondef('public.verify_wallet_payment_by_name(uuid,text)'::regprocedure) not like '%update public.orders%'),
  'la vía de indicios conserva el registro financiero y el pedido sin autorizarlos'
);
select ok(
  (select pg_get_functiondef('public.verify_wallet_payment_by_name(uuid,text)'::regprocedure)
    not like '%update public.payment_attempts%'
    and pg_get_functiondef('public.verify_wallet_payment_by_name(uuid,text)'::regprocedure) not like '%update public.orders%'),
  'la vía de indicios conserva el registro financiero y el pedido sin autorizarlos'
);
select ok(
  (select pg_get_functiondef('public.verify_wallet_payment_by_name(uuid,text)'::regprocedure)
    not like '%update public.payment_attempts%'
    and pg_get_functiondef('public.verify_wallet_payment_by_name(uuid,text)'::regprocedure) not like '%update public.orders%'),
  'la vía de indicios conserva el registro financiero y el pedido sin autorizarlos'
);
select ok(
  (select pg_get_functiondef('public.verify_wallet_payment_by_name(uuid,text)'::regprocedure)
    not like '%update public.payment_attempts%'
    and pg_get_functiondef('public.verify_wallet_payment_by_name(uuid,text)'::regprocedure) not like '%update public.orders%'),
  'la vía de indicios conserva el registro financiero y el pedido sin autorizarlos'
);

select * from finish();
rollback;
