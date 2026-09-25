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
  pg_get_functiondef('public.confirm_manual_wallet_payment_by_code_v2(uuid,text,text)'::regprocedure)
    like '%v_observation.amount_cents < round(v_attempt.amount * 100)%'
    and pg_get_functiondef('public.confirm_manual_wallet_payment_by_code_v2(uuid,text,text)'::regprocedure)
      like '%v_order.status in (''confirmed'', ''preparing'')%',
  'solo un abono menor al total en pedido confirmado o en preparación inicia cancelación automática'
);
select ok(
  pg_get_functiondef('public.confirm_manual_wallet_payment_by_code_v2(uuid,text,text)'::regprocedure)
    like '%set verification_status = ''under_review''%'
    and pg_get_functiondef('public.confirm_manual_wallet_payment_by_code_v2(uuid,text,text)'::regprocedure)
      like '%cancellation_reason = ''partial_wallet_payment''%',
  'conserva el abono para Caja y registra la causa de cancelación'
);
select ok(
  pg_get_functiondef('public.confirm_manual_wallet_payment_by_code_v2(uuid,text,text)'::regprocedure)
    like '%set_config(''suya.cancellation_mutation'', ''1'', true)%'
    and pg_get_functiondef('public.confirm_manual_wallet_payment_by_code_v2(uuid,text,text)'::regprocedure)
      like '%set observed_wallet_observation_id = v_observation.id%'
    and pg_get_functiondef('public.confirm_manual_wallet_payment_by_code_v2(uuid,text,text)'::regprocedure)
      like '%failure_code = ''partial_payment_review''%',
  'usa el contexto interno de cancelación y deja la observación asociada a revisión'
);
select ok(
  pg_get_functiondef('public.confirm_manual_wallet_payment_by_code_v2(uuid,text,text)'::regprocedure)
    like '%v_order.cancellation_reason = ''partial_wallet_payment''%'
    and pg_get_functiondef('public.confirm_manual_wallet_payment_by_code_v2(uuid,text,text)'::regprocedure)
      like '%v_attempt.failure_code = ''partial_payment_review''%',
  'un reintento devuelve el mismo resultado sin repetir la cancelación'
);

select * from finish();
rollback;
