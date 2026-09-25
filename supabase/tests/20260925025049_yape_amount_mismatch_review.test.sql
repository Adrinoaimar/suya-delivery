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
  pg_get_functiondef('public.confirm_manual_wallet_payment_by_code_v2(uuid,text,text)'::regprocedure)
    like '%^[0-9]{3}$%',
  'exige un código de exactamente tres dígitos'
);
select ok(
  pg_get_functiondef('public.confirm_manual_wallet_payment_by_code_v2(uuid,text,text)'::regprocedure)
    like '%if v_matching_observations <> 1 then%',
  'un código repetido queda ambiguo'
);
select ok(
  pg_get_functiondef('public.confirm_manual_wallet_payment_by_code_v2(uuid,text,text)'::regprocedure)
    like '%if v_observation.amount_cents <> round(v_attempt.amount * 100) then%'
    and pg_get_functiondef('public.confirm_manual_wallet_payment_by_code_v2(uuid,text,text)'::regprocedure)
      like '%''amount_mismatch''::text%'
    and pg_get_functiondef('public.confirm_manual_wallet_payment_by_code_v2(uuid,text,text)'::regprocedure)
      like '%set verification_status = ''under_review''%',
  'un importe distinto se deriva a revisión sin autorizar'
);
select ok(
  pg_get_functiondef('public.confirm_manual_wallet_payment_by_code_v2(uuid,text,text)'::regprocedure)
    like '%wo.receiver_account_id = v_attempt.receiver_account_id%'
    and pg_get_functiondef('public.confirm_manual_wallet_payment_by_code_v2(uuid,text,text)'::regprocedure)
      like '%wo.code_last4 = v_confirmation_code%'
    and pg_get_functiondef('public.confirm_manual_wallet_payment_by_code_v2(uuid,text,text)'::regprocedure)
      like '%v_attempt.expires_at >= wo.observed_at%',
  'compara receptor, código y ventana del intento'
);
select ok(
  pg_get_functiondef('public.confirm_manual_wallet_payment_by_code_v2(uuid,text,text)'::regprocedure)
    like '%wo.amount_cents = round(v_attempt.amount * 100)%'
    and pg_get_functiondef('public.confirm_manual_wallet_payment_by_code_v2(uuid,text,text)'::regprocedure)
      like '%''code_mismatch''::text%'
    and pg_get_functiondef('public.confirm_manual_wallet_payment_by_code_v2(uuid,text,text)'::regprocedure)
      like '%if v_other_observations > 1 then%',
  'solo informa código distinto con un único pago por el monto esperado'
);
select ok(
  pg_get_function_result('public.confirm_manual_wallet_payment_by_code_v2(uuid,text,text)'::regprocedure)
    like '%observed_amount_cents bigint%',
  'devuelve el monto observado para explicar un abono parcial al cliente'
);

select * from finish();
rollback;
