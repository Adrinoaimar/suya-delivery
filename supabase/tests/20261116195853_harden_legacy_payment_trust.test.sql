begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(17);

select ok(
  not has_function_privilege('anon', signature, 'EXECUTE')
    and not has_function_privilege('authenticated', signature, 'EXECUTE')
    and has_function_privilege('service_role', signature, 'EXECUTE'),
  signature || ' solo permite reservas/finalización al servidor'
)
from unnest(array[
  'public.claim_culqi_payment_secure(uuid,text,text)',
  'public.claim_culqi_order_creation_secure(uuid,text,text)',
  'public.authorize_culqi_payment_secure(uuid,text,text,text,text)',
  'public.fail_culqi_payment_claim_secure(uuid,text,text,text)'
]) signature;

set local role authenticated;
select throws_ok(
  $$ select public.authorize_culqi_payment_secure(null, 'yape', 'chr_test_inventado', 'codigo-inventado-con-32-caracteres') $$,
  '42501', 'permission denied for function authorize_culqi_payment_secure',
  'un cliente no puede autorizar una transacción inventada'
);
select throws_ok(
  $$ select * from public.claim_culqi_payment_secure(null, 'yape') $$,
  '42501', 'permission denied for function claim_culqi_payment_secure',
  'un cliente no puede obtener el secreto de reserva'
);
select throws_ok(
  $$ select public.verify_wallet_payment(null, null) $$,
  'P0001', 'La notificación no acredita el abono. Verifica el movimiento en el canal oficial del proveedor; esta vía no permite autorizar pagos.',
  'ni un operador puede convertir una observación sin verificación financiera en pago'
);
select throws_ok(
  $$ select public.verify_wallet_payment_by_name(null, 'Nombre') $$,
  'P0001', 'El nombre y la notificación no acreditan el abono. Se requiere confirmación financiera del proveedor.',
  'el nombre no basta para confirmar dinero recibido'
);
reset role;

select ok(
  exists(select 1 from pg_trigger where tgrelid = 'public.payment_attempts'::regclass
    and tgname = 'payment_attempts_trusted_authorization_guard' and not tgisinternal),
  'la barrera contra autorización por observación también existe en la tabla'
);
select ok(
  pg_get_functiondef('private.require_trusted_payment_authorization()'::regprocedure)
    like '%new.provider = ''wallet_observer''%'
  and pg_get_functiondef('private.require_trusted_payment_authorization()'::regprocedure)
    like '%wallet_observation:%',
  'la barrera rechaza proveedor de observación y referencias de observación'
);
select ok(
  pg_get_functiondef('public.claim_culqi_payment(uuid,text,text)'::regprocedure)
    like '%if v_attempt.gateway_claimed_at is not null then%',
  'un cargo incierto no puede repetirse por caducidad de la reserva'
);
select ok(
  pg_get_functiondef('public.claim_culqi_order_creation(uuid,text,text)'::regprocedure)
    like '%expired gateway order requires reconciliation%',
  'una orden externa vencida se conserva hasta conciliar'
);
select ok(
  has_function_privilege('anon', 'public.check_culqi_payment_actor_secure(uuid,text)', 'EXECUTE')
    and has_function_privilege('authenticated', 'public.check_culqi_payment_actor_secure(uuid,text)', 'EXECUTE'),
  'el cliente conserva la comprobación de acceso sin secretos'
);
select ok(
  pg_get_functiondef('public.check_culqi_payment_actor_secure(uuid,text)'::regprocedure)
    like '%private.require_payment_attempt_actor%',
  'la comprobación conserva propietario o token guest'
);
select ok(
  pg_get_functiondef(signature::regprocedure) not like '%update public.payment_attempts%'
    and pg_get_functiondef(signature::regprocedure) not like '%update public.orders%',
  signature || ' declara indicios sin autorizar ni cancelar'
)
from unnest(array[
  'public.confirm_manual_wallet_payment(uuid,text,text)',
  'public.confirm_manual_wallet_payment_by_code(uuid,text,text)',
  'public.confirm_manual_wallet_payment_by_code_v2(uuid,text,text)'
]) signature;
select * from finish();
rollback;
