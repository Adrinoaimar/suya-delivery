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
    like '%v_matching_attempts%'),
  'la aprobación rechaza coincidencias ambiguas'
);
select ok(
  (select pg_get_functiondef('public.verify_wallet_payment_by_name(uuid,text)'::regprocedure)
    like '%receiver_account_id%'),
  'la aprobación valida la cuenta receptora'
);
select ok(
  (select pg_get_functiondef('public.verify_wallet_payment_by_name(uuid,text)'::regprocedure)
    like '%payer_display_name%'),
  'la aprobación valida el nombre declarado o del pedido'
);
select ok(
  (select pg_get_functiondef('public.verify_wallet_payment_by_name(uuid,text)'::regprocedure)
    like '%verification_status = ''verified''%'
    and (select pg_get_functiondef('public.verify_wallet_payment_by_name(uuid,text)'::regprocedure)
      like '%status = ''authorized''%')),
  'la aprobación cierra observación y autoriza intento en una sola operación'
);

select * from finish();
rollback;
