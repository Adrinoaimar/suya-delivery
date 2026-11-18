-- Pruebas de base de datos: requieren SUYA-STAGING-QA remoto con migraciones aplicadas.
-- No arrancan PostgreSQL local. Todos los fixtures se revierten al finalizar.
-- Firma HTTP, caída de red y API externa se prueban en la suite Edge/Vitest, no aquí.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

-- Barreras de acceso: ningún navegador puede guardar secretos o confirmar dinero.
select ok(
  not has_function_privilege('anon', signature, 'EXECUTE')
    and not has_function_privilege('authenticated', signature, 'EXECUTE')
    and has_function_privilege('service_role', signature, 'EXECUTE'),
  signature || ' permite dinero/secretos únicamente al servidor'
) from unnest(array[
  'public.get_gateway_config_secret(uuid,integer)',
  'public.save_gateway_config(uuid,text,text,text,boolean,boolean,boolean,integer)',
  'public.get_gateway_attempt(uuid)',
  'public.mark_gateway_webhook_verified(uuid,integer)',
  'public.bind_gateway_checkout(uuid,text,text,text)',
  'public.apply_gateway_payment(text,text,uuid,text,bigint,text,text,timestamptz,jsonb)',
  'public.list_gateway_reconciliation_batch()'
]) signature;
select ok(not has_table_privilege('anon', relation, 'SELECT')
  and not has_table_privilege('authenticated', relation, 'SELECT'),
  relation || ' no expone datos privados')
from unnest(array[
  'private.payment_gateway_configs','private.gateway_transactions',
  'private.gateway_creation_claims','private.gateway_events','private.gateway_admin_audit'
]) relation;
select ok(relrowsecurity, relname || ' tiene RLS activado')
from pg_class where oid in (
  'private.payment_gateway_configs'::regclass,'private.gateway_transactions'::regclass,
  'private.gateway_creation_claims'::regclass,'private.gateway_events'::regclass,
  'private.gateway_admin_audit'::regclass
);

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select '00000000-0000-0000-0000-000000000000',md5('gateway-qa-user-'||i)::uuid,
  'authenticated','authenticated','gateway-qa-'||i||'@example.test','',now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"display_name":"Prueba pagos oficial"}'::jsonb,now(),now()
from generate_series(1,3) i;
insert into public.categories(id,slug,name,icon)
values(md5('gateway-qa-category')::uuid,'gateway-qa-category','QA Cobros','wallet');
insert into public.restaurants(id,slug,category_id,name,address,active,accepting_orders)
values(md5('gateway-qa-restaurant')::uuid,'gateway-qa-restaurant',md5('gateway-qa-category')::uuid,
  'Restaurante QA cobros','Sullana',true,true);
insert into public.restaurant_members(restaurant_id,user_id,role)
values(md5('gateway-qa-restaurant')::uuid,md5('gateway-qa-user-2')::uuid,'owner');
insert into private.payment_gateway_configs(restaurant_id,version,environment,
  credentials_encrypted,collector_id,verified_at,webhook_verified_at,enabled,production_permissions_confirmed)
values
  (md5('gateway-qa-restaurant')::uuid,1,'live',repeat('x',80),'qa-collector',now(),now(),true,true),
  (md5('gateway-qa-restaurant')::uuid,2,'test',repeat('t',80),'qa-test-collector',now(),now(),false,false);
-- La versión 2 de prueba no se usa para crear intentos de cliente; fixtures pinnean la versión.
-- La restauramos a 1 como última versión mientras probamos el flujo real.
delete from private.payment_gateway_configs where restaurant_id=md5('gateway-qa-restaurant')::uuid and version=2;

create function pg_temp.gateway_order_id(i integer) returns uuid language sql immutable as $$
  select md5('gateway-qa-order-'||i)::uuid;
$$;
create function pg_temp.gateway_attempt_id(i integer) returns uuid language sql immutable as $$
  select md5('gateway-qa-attempt-'||i)::uuid;
$$;
create function pg_temp.gateway_fixture(i integer, environment text default 'live') returns uuid
language plpgsql as $$
declare attempt uuid := pg_temp.gateway_attempt_id(i);
begin
  insert into public.orders(id,code,customer_id,restaurant_id,status,payment_method,subtotal,
    delivery_fee,customer_name,customer_phone,delivery_address,estimated_minutes,idempotency_key)
  values(pg_temp.gateway_order_id(i),'GWQA'||lpad(i::text,4,'0'),md5('gateway-qa-user-1')::uuid,
    md5('gateway-qa-restaurant')::uuid,'pending_payment','yape',20,0,'Cliente QA pagos',
    '999999999','Calle QA Sullana',30,md5('gateway-qa-request-'||i)::uuid);
  insert into public.payment_attempts(id,order_id,provider,provider_reference,method,status,amount,
    idempotency_key,checkout_reference,expires_at,gateway_config_version,gateway_environment,
    gateway_state,last_reconciled_at)
  values(attempt,pg_temp.gateway_order_id(i),'mercadopago','pref-qa-'||i,'yape','pending',20,
    'gateway-qa-idem-'||i,'SUYA-GWQA-'||i,now()+interval '30 minutes',
    case when environment='test' then 2 else 1 end,environment,'pending',now());
  return attempt;
end;
$$;
create function pg_temp.gateway_event(i integer, event_id text, transaction_id text,
  state text default 'approved', amount_cents bigint default 2000, currency text default 'PEN',
  paid_at timestamptz default now(), extra jsonb default '{}'::jsonb) returns jsonb
language sql as $$
  select public.apply_gateway_payment('mercadopago',event_id,pg_temp.gateway_attempt_id(i),
    transaction_id,amount_cents,currency,state,paid_at,
    jsonb_build_object('collector_id','qa-collector',
      'external_reference',pg_temp.gateway_attempt_id(i)::text,
      'order_id',pg_temp.gateway_order_id(i)::text,'config_version','1','live_mode','true',
      'provider_updated_at',now()::text)||extra);
$$;

grant usage on schema pg_temp to anon,authenticated;
grant execute on function pg_temp.gateway_order_id(integer),pg_temp.gateway_attempt_id(integer) to anon,authenticated;

select pg_temp.gateway_fixture(i) from generate_series(1,22) i;
select is((select amount_cents from public.payment_attempts where id=pg_temp.gateway_attempt_id(1)),
  2000::bigint,'importe se guarda como céntimos exactos');

-- 1. Pago correcto: confirma pedido pero el restaurante aún debe aceptarlo.
select is(pg_temp.gateway_event(1,'qa-event-1','qa-txn-1')->>'outcome','approved',
  'pago financiero correcto es aprobado');
select is((select status::text from public.payment_attempts where id=pg_temp.gateway_attempt_id(1)),
  'authorized','intento autorizado');
select is((select status::text from public.orders where id=pg_temp.gateway_order_id(1)),
  'confirmed','pedido confirmado sin preparación automática');
select is((select count(*) from public.order_events where order_id=pg_temp.gateway_order_id(1)
  and status='confirmed'),1::bigint,'restaurante recibe un único evento de confirmación');
select is((select authorized_transaction_id from public.payment_attempts where id=pg_temp.gateway_attempt_id(1)),
  'qa-txn-1','se conserva identidad de la transacción que autorizó');

-- 2. Dos pedidos iguales: nunca asociar por coincidencia de monto.
select is((select status::text from public.orders where id=pg_temp.gateway_order_id(2)),
  'pending_payment','otro pedido por S/20 permanece sin pagar');
select is(pg_temp.gateway_event(2,'qa-reuse-event','qa-txn-1')->>'outcome','transaction_reuse',
  'una transacción no puede autorizar el segundo pedido');
select is((select status::text from public.payment_attempts where id=pg_temp.gateway_attempt_id(2)),
  'pending','reutilizar dinero no altera el segundo intento');
select is((select attempt_id from private.gateway_transactions where provider='mercadopago'
  and transaction_id='qa-txn-1'),pg_temp.gateway_attempt_id(1),'el dueño original del movimiento no cambia');
select is(pg_temp.gateway_event(2,'qa-event-2','qa-txn-2')->>'outcome','approved',
  'otro ID financiero y referencia exacta sí paga el segundo pedido');

-- 3. Webhook repetido y distintas notificaciones de la misma transacción.
select is(pg_temp.gateway_event(1,'qa-event-1','qa-txn-1')->>'outcome','duplicate',
  'el mismo evento se reconoce como duplicado');
select lives_ok($$ select pg_temp.gateway_event(1,'qa-event-1-retry','qa-txn-1') $$,
  'otro evento del mismo pago es idempotente');
select is((select count(*) from public.order_events where order_id=pg_temp.gateway_order_id(1)
  and status='confirmed'),1::bigint,'los reintentos no notifican dos veces');
select is((select count(*) from private.gateway_transactions where provider='mercadopago'
  and transaction_id='qa-txn-1'),1::bigint,'la identidad financiera es única');

-- 4. Monto, moneda, cuenta, referencia y versión no coincidentes.
select is(pg_temp.gateway_event(3,'qa-wrong-amount','qa-txn-3','approved',1999)->>'outcome',
  'amount_mismatch','S/19.99 no satisface pedido S/20.00');
select is((select status::text from public.orders where id=pg_temp.gateway_order_id(3)),
  'pending_payment','importe incorrecto no confirma pedido');
select is(pg_temp.gateway_event(12,'qa-wrong-currency','qa-txn-12','approved',2000,'USD')->>'outcome',
  'amount_mismatch','dólares no satisfacen la solicitud PEN');
select is(pg_temp.gateway_event(13,'qa-wrong-collector','qa-txn-13','approved',2000,'PEN',now(),
  '{"collector_id":"otra-cuenta"}')->>'outcome','identity_mismatch','otra cuenta receptora no autoriza');
select is(pg_temp.gateway_event(14,'qa-wrong-reference','qa-txn-14','approved',2000,'PEN',now(),
  '{"external_reference":"otro-intento"}')->>'outcome','identity_mismatch','referencia errónea no autoriza');
select is(pg_temp.gateway_event(15,'qa-wrong-version','qa-txn-15','approved',2000,'PEN',now(),
  '{"config_version":"99"}')->>'outcome','identity_mismatch','otra versión no autoriza');
select is(pg_temp.gateway_event(16,'qa-wrong-mode','qa-txn-16','approved',2000,'PEN',now(),
  '{"live_mode":"false"}')->>'outcome','identity_mismatch','sandbox no se hace pasar por producción');

select is(pg_temp.gateway_event(22,'qa-wrong-order','qa-txn-22','approved',2000,'PEN',now(),
  jsonb_build_object('order_id',pg_temp.gateway_order_id(1)::text))->>'outcome',
  'identity_mismatch','ID de pedido ajeno no autoriza aunque coincida monto');
select is(pg_temp.gateway_event(21,'qa-future-paid','qa-txn-21','approved',2000,'PEN',now()+interval '10 minutes')->>'outcome',
  'late_review','fecha de recepción futura no confirma dinero hoy');

-- 5. Rechazado, pendiente, reintento del servidor y recuperación posterior.
select is(pg_temp.gateway_event(4,'qa-rejected','qa-txn-4','rejected')->>'outcome','rejected',
  'rechazo financiero queda explícito');
select is((select status::text from public.payment_attempts where id=pg_temp.gateway_attempt_id(4)),
  'failed','intento rechazado falla');
select is((select status::text from public.orders where id=pg_temp.gateway_order_id(4)),
  'pending_payment','rechazo no pasa al restaurante');
select is(pg_temp.gateway_event(5,'qa-pending','qa-txn-5','pending')->>'outcome','pending',
  'pendiente no se autoriza');
select is((select status::text from public.payment_attempts where id=pg_temp.gateway_attempt_id(5)),
  'pending','estado pendiente permanece sin autorización');
select is(pg_temp.gateway_event(5,'qa-pending-recovery','qa-txn-5','approved',2000,'PEN',now(),
  jsonb_build_object('provider_updated_at',(now()+interval '1 second')::text))->>'outcome',
  'approved','un reintento con estado financiero más nuevo recupera el pago');

-- 6. Expiración y llegada tardía: nunca reabrir automáticamente un pedido vencido.
update public.payment_attempts set expires_at=now()-interval '1 minute',
  created_at=now()-interval '31 minutes',last_reconciled_at=now()-interval '10 minutes'
where id in (pg_temp.gateway_attempt_id(6),pg_temp.gateway_attempt_id(7));
select lives_ok($$ select public.list_gateway_reconciliation_batch() $$,
  'reconciliación programada expira los intentos vencidos');
select is((select gateway_state from public.payment_attempts where id=pg_temp.gateway_attempt_id(6)),
  'expired','vencimiento visible');
select is((select status::text from public.payment_attempts where id=pg_temp.gateway_attempt_id(6)),
  'failed','intento vencido deja de estar cobrable');
select is(pg_temp.gateway_event(7,'qa-late','qa-txn-7','approved',2000,'PEN',now()-interval '2 minutes')->>'outcome',
  'late_review','confirmación después de expirar se conserva para conciliación');
select is((select status::text from public.orders where id=pg_temp.gateway_order_id(7)),
  'pending_payment','abono tardío no reabre el pedido');

-- 7. Cancelación de pedido durante el pago.
select set_config('suya.cancellation_mutation','1',true);
update public.orders set status='cancelled',cancelled_at=now(),cancellation_reason='qa_customer_cancelled'
where id=pg_temp.gateway_order_id(8);
select set_config('suya.cancellation_mutation','0',true);
select is(pg_temp.gateway_event(8,'qa-after-cancel','qa-txn-8')->>'outcome','late_review',
  'dinero de pedido cancelado requiere excepción financiera');
select is((select status::text from public.orders where id=pg_temp.gateway_order_id(8)),
  'cancelled','pedido cancelado nunca revive por webhook');

-- 8. Segunda transacción, otros rechazos o discrepancias no degradan el cobro canónico.
select lives_ok($$ select pg_temp.gateway_event(1,'qa-second-payment','qa-second-txn-1') $$,
  'un segundo abono al mismo pedido se registra sin repetir cumplimiento');
select lives_ok($$ select pg_temp.gateway_event(1,'qa-other-rejected','qa-other-txn-1','rejected') $$,
  'rechazo de otro intento externo no revierte autorización');
select lives_ok($$ select pg_temp.gateway_event(1,'qa-other-mismatch','qa-other-txn-2','approved',2500) $$,
  'otro pago con discrepancia se registra como excepción');
select is((select status::text from public.payment_attempts where id=pg_temp.gateway_attempt_id(1)),
  'authorized','el pago válido no se degrada por otros movimientos');
select is((select authorized_transaction_id from public.payment_attempts where id=pg_temp.gateway_attempt_id(1)),
  'qa-txn-1','se mantiene el movimiento canónico');
select is((select gateway_state from public.payment_attempts where id=pg_temp.gateway_attempt_id(1)),
  'approved','la discrepancia ajena no oculta el pago aprobado');

select lives_ok($$ select pg_temp.gateway_event(2,'qa-canonical-new-pending','qa-txn-2','pending',2000,'PEN',now(),
  jsonb_build_object('provider_updated_at',(now()+interval '4 seconds')::text)) $$,
  'estado no financiero posterior no degrada la transacción canónica');
select is((select state from private.gateway_transactions where provider='mercadopago'
  and transaction_id='qa-txn-2'),'approved','ledger financiero canónico permanece aprobado');

-- 9. Devolución de otra transacción, devolución real y eventos antiguos.
select lives_ok($$ select pg_temp.gateway_event(1,'qa-other-refund','qa-other-txn-1','refunded',2000,'PEN',now(),
  jsonb_build_object('provider_updated_at',(now()+interval '2 seconds')::text)) $$,
  'refund de otra transacción se procesa como excepción');
select is((select status::text from public.payment_attempts where id=pg_temp.gateway_attempt_id(1)),
  'authorized','devolver otra transacción no devuelve el cobro canónico');
select is(pg_temp.gateway_event(11,'qa-refund-initial','qa-txn-11')->>'outcome','approved',
  'se registra pago antes de devolverlo');
select lives_ok($$ select pg_temp.gateway_event(11,'qa-full-refund','qa-txn-11','refunded',2000,'PEN',now(),
  jsonb_build_object('provider_updated_at',(now()+interval '3 seconds')::text)) $$,
  'refund del movimiento canónico se conserva');
select is((select status::text from public.payment_attempts where id=pg_temp.gateway_attempt_id(11)),
  'refunded','devolución total financiera explícita');
select lives_ok($$ select pg_temp.gateway_event(11,'qa-stale-approved','qa-txn-11','approved',2000,'PEN',now(),
  jsonb_build_object('provider_updated_at',(now()-interval '1 second')::text)) $$,
  'un aprobado antiguo posterior al refund se ignora de forma segura');
select is((select status::text from public.payment_attempts where id=pg_temp.gateway_attempt_id(11)),
  'refunded','evento aprobado fuera de orden no resucita dinero devuelto');
select is((select gateway_state from public.payment_attempts where id=pg_temp.gateway_attempt_id(11)),
  'refunded','el estado visible conserva la devolución');
select is((select count(*) from public.order_events where order_id=pg_temp.gateway_order_id(11)
  and status='confirmed'),1::bigint,'la devolución no repite el cumplimiento');
select is(pg_temp.gateway_event(17,'qa-partial-initial','qa-txn-17')->>'outcome','approved',
  'pago inicial para devolución parcial');
select lives_ok($$ select pg_temp.gateway_event(17,'qa-partial-refund','qa-txn-17','partial_refund',2000,'PEN',now(),
  jsonb_build_object('provider_updated_at',(now()+interval '2 seconds')::text)) $$,
  'devolución parcial se procesa');
select is((select gateway_state from public.payment_attempts where id=pg_temp.gateway_attempt_id(17)),
  'partial_refund','devolución parcial no se oculta como nueva aprobación');

-- 10. Fallo DB durante confirmación: se revierte pago, movimiento, evento y pedido.
create function pg_temp.fail_gateway_confirmation() returns trigger language plpgsql as $$
begin
  if new.id=pg_temp.gateway_order_id(10) and new.status='confirmed' then
    raise exception 'QA forced confirmation failure';
  end if;
  return new;
end;
$$;
create trigger qa_fail_gateway_confirmation before update of status on public.orders
for each row execute function pg_temp.fail_gateway_confirmation();
select throws_ok($$ select pg_temp.gateway_event(10,'qa-db-failure','qa-txn-10') $$,
  'P0001','QA forced confirmation failure','fallo del pedido revierte toda la operación financiera');
select is((select status::text from public.payment_attempts where id=pg_temp.gateway_attempt_id(10)),
  'pending','rollback conserva intento pendiente');
select is((select status::text from public.orders where id=pg_temp.gateway_order_id(10)),
  'pending_payment','rollback conserva pedido pendiente');
select is((select count(*) from private.gateway_transactions where transaction_id='qa-txn-10'),
  0::bigint,'rollback no consume una transacción que no se pudo aplicar');
select is((select count(*) from private.gateway_events where event_id='qa-db-failure'),
  0::bigint,'rollback permite reentrega del evento');
drop trigger qa_fail_gateway_confirmation on public.orders;
select is(pg_temp.gateway_event(10,'qa-db-failure','qa-txn-10')->>'outcome','approved',
  'el reintento después del fallo DB puede completar exactamente una vez');

-- 11. Datos incompletos o timestamp inválido no crean movimientos.
select throws_ok($$ select public.apply_gateway_payment(null,'qa-null-provider',pg_temp.gateway_attempt_id(18),
  'qa-null-provider-txn',2000,'PEN','approved',now(),'{}') $$,
  'P0001','invalid verified payment event','proveedor NULL se rechaza');
select throws_ok($$ select public.apply_gateway_payment('mercadopago','qa-null-amount',pg_temp.gateway_attempt_id(18),
  'qa-null-amount-txn',null,'PEN','approved',now(),'{}') $$,
  'P0001','invalid verified payment event','monto NULL se rechaza');
select throws_ok($$ select public.apply_gateway_payment('mercadopago','qa-null-state',pg_temp.gateway_attempt_id(18),
  'qa-null-state-txn',2000,'PEN',null,now(),'{}') $$,
  'P0001','invalid verified payment event','estado NULL se rechaza');
select throws_ok($$ select pg_temp.gateway_event(18,'qa-null-updated','qa-txn-18','approved',2000,'PEN',now(),
  '{"provider_updated_at":null}') $$,'P0001','valid provider timestamp is required',
  'no se admite transacción sin fecha de actualización oficial');

-- 12. Sandbox no confirma pedidos reales, incluso si el proveedor responde approved.
insert into private.payment_gateway_configs(restaurant_id,version,environment,
  credentials_encrypted,collector_id,verified_at,webhook_verified_at,enabled,production_permissions_confirmed)
values(md5('gateway-qa-restaurant')::uuid,2,'test',repeat('t',80),'qa-test-collector',now(),now(),false,false);
select pg_temp.gateway_fixture(23,'test');
select is(pg_temp.gateway_event(23,'qa-sandbox','qa-test-txn','approved',2000,'PEN',now(),
  '{"collector_id":"qa-test-collector","config_version":"2","live_mode":"false"}')->>'outcome',
  'test_confirmed','sandbox se distingue de dinero real');
select is((select status::text from public.orders where id=pg_temp.gateway_order_id(23)),
  'pending_payment','sandbox jamás confirma un pedido operativo');

-- Un cliente ordinario no recibe ni reserva solicitudes sandbox aunque sea dueño del pedido.
select set_config('request.jwt.claims',jsonb_build_object('sub',md5('gateway-qa-user-1')::uuid,
  'role','authenticated')::text,true);
set local role authenticated;
select is((public.gateway_config_public(md5('gateway-qa-restaurant')::uuid)->>'test_available')::boolean,
  false,'sandbox no se ofrece a clientes ordinarios');
select throws_ok($$ select public.prepare_gateway_payment(pg_temp.gateway_order_id(23),'yape') $$,
  'P0001','official gateway is not available','el backend rechaza crear sandbox para un cliente ordinario');
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',md5('gateway-qa-user-1')::uuid,
  'role','authenticated','app_metadata',jsonb_build_object('role','platform_admin'))::text,true);
set local role authenticated;
select is((public.gateway_config_public(md5('gateway-qa-restaurant')::uuid)->>'test_available')::boolean,
  true,'sólo platform_admin descubre sandbox verificado');
select lives_ok($$ select public.prepare_gateway_payment(pg_temp.gateway_order_id(23),'yape') $$,
  'administrador puede probar un pedido propio sin activar producción');
reset role;

-- 13. La reserva evita solicitudes externas simultáneas y permite repetición del bind.
delete from private.payment_gateway_configs where restaurant_id=md5('gateway-qa-restaurant')::uuid and version=2;
update public.payment_attempts set provider_reference=null where id=pg_temp.gateway_attempt_id(19);
select set_config('request.jwt.claims',jsonb_build_object('sub',md5('gateway-qa-user-1')::uuid,
  'role','authenticated')::text,true);
create temporary table qa_gateway_claim as
select public.prepare_gateway_payment(pg_temp.gateway_order_id(19),'yape') value;
select ok((select length(value->>'claim_token')=64 from qa_gateway_claim),
  'reserva de creación usa 256 bits aleatorios');
select throws_ok($$ select public.prepare_gateway_payment(pg_temp.gateway_order_id(19),'yape') $$,
  'P0001','checkout creation in progress; retry shortly','segunda solicitud no obtiene otra reserva');
select throws_ok($$ select public.bind_gateway_checkout(pg_temp.gateway_attempt_id(19),
  (select value->>'claim_token' from qa_gateway_claim),'qa-checkout-19',null) $$,
  'P0001','invalid provider checkout','URL NULL no puede vincularse');
select lives_ok($$ select public.bind_gateway_checkout(pg_temp.gateway_attempt_id(19),
  (select value->>'claim_token' from qa_gateway_claim),'qa-checkout-19',
  'https://www.mercadopago.com.pe/checkout/v1/redirect?pref_id=qa-checkout-19') $$,
  'reserva válida vincula el checkout externo');
select lives_ok($$ select public.bind_gateway_checkout(pg_temp.gateway_attempt_id(19),
  (select value->>'claim_token' from qa_gateway_claim),'qa-checkout-19',
  'https://www.mercadopago.com.pe/checkout/v1/redirect?pref_id=qa-checkout-19') $$,
  'repetir el mismo bind es seguro después de borrar la reserva');
select is((select count(*) from public.payment_attempts where order_id=pg_temp.gateway_order_id(19)),
  1::bigint,'solicitudes repetidas no duplican el intento');
select is((select count(*) from private.gateway_creation_claims where attempt_id=pg_temp.gateway_attempt_id(19)),
  0::bigint,'reserva consumida queda eliminada');

-- 14. Rotación conserva versiones y ciphertext exclusivamente en RPC service-role.
create temporary table qa_gateway_config_save as
select public.save_gateway_config(md5('gateway-qa-restaurant')::uuid,'live',repeat('z',80),
  'qa-new-collector',true,true,true,1) value;
select ok((select value ? 'credentials_encrypted' from qa_gateway_config_save),
  'RPC exclusiva del servidor conserva ciphertext para el adaptador; Edge lo elimina de la respuesta pública');
select is((select (value->>'version')::integer from qa_gateway_config_save),2,
  'rotación crea una versión nueva');
select ok(not (select (value->>'enabled')::boolean from qa_gateway_config_save),
  'credenciales nuevas exigen comprobación antes de activar');
select is((select collector_id from private.payment_gateway_configs
  where restaurant_id=md5('gateway-qa-restaurant')::uuid and version=1),'qa-collector',
  'rotación no cambia el receptor de intentos históricos');
select is((public.gateway_config_public(md5('gateway-qa-restaurant')::uuid)->>'available')::boolean,
  false,'configuración nueva no verificada no aparece disponible');
select throws_ok($$ select public.save_gateway_config(md5('gateway-qa-restaurant')::uuid,
  'live',repeat('z',80),'qa-new-collector',true,false,true,1) $$,
  'P0001','configuration changed; reload before saving','versión antigua no pisa configuración concurrente');
select throws_ok($$ select public.save_gateway_config(md5('gateway-qa-restaurant')::uuid,
  'live',repeat('z',80),'qa-new-collector',true,true,true,2) $$,
  '23514',null,'sin webhook real verificado no se puede activar');
select lives_ok($$ select public.mark_gateway_webhook_verified(md5('gateway-qa-restaurant')::uuid,2) $$,
  'servidor registra una prueba auténtica de callback');
select lives_ok($$ select public.save_gateway_config(md5('gateway-qa-restaurant')::uuid,
  'live',repeat('z',80),'qa-new-collector',true,true,true,2) $$,
  'con API, callback y permisos de producción comprobados puede activarse');
select is((public.gateway_config_public(md5('gateway-qa-restaurant')::uuid)->>'available')::boolean,
  true,'sólo configuración comprobada aparece disponible');
select is(pg_temp.gateway_event(20,'qa-old-config-payment','qa-txn-20')->>'outcome','approved',
  'transacción histórica se verifica contra versión original aun tras rotar');

-- 15. Cliente dueño puede leer su cobro; terceros no pueden consultar ni configurar.
set local role authenticated;
select lives_ok($$ select public.get_gateway_payment_intent(pg_temp.gateway_order_id(19)) $$,
  'dueño del pedido puede consultar estado');
select throws_ok($$ select public.apply_gateway_payment('mercadopago','qa-browser',
  pg_temp.gateway_attempt_id(21),'invented',2000,'PEN','approved',now(),'{}') $$,
  '42501','permission denied for function apply_gateway_payment',
  'cliente autenticado no puede aprobar pedido sin pagar');
select throws_ok($$ select public.get_gateway_config_secret(md5('gateway-qa-restaurant')::uuid) $$,
  '42501','permission denied for function get_gateway_config_secret','navegador no lee credenciales');
select throws_ok($$ update public.payment_attempts set status='authorized'
  where id=pg_temp.gateway_attempt_id(21) $$,'42501',null,
  'cliente no cambia estado financiero directamente');
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',md5('gateway-qa-user-2')::uuid,
  'role','authenticated')::text,true);
set local role authenticated;
select ok(public.list_gateway_payments(md5('gateway-qa-restaurant')::uuid) ? 'payments',
  'dueño del restaurante consulta cobros y excepciones');
select ok(not (public.list_gateway_payments(md5('gateway-qa-restaurant')::uuid)::text
  like '%credentials_encrypted%'),'historial administrativo no expone ciphertext');
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',md5('gateway-qa-user-3')::uuid,
  'role','authenticated')::text,true);
set local role authenticated;
select throws_ok($$ select public.get_gateway_payment_intent(pg_temp.gateway_order_id(19)) $$,
  'P0001',null,'otro cliente no consulta el cobro ajeno');
select throws_ok($$ select public.list_gateway_payments(md5('gateway-qa-restaurant')::uuid) $$,
  'P0001','payment configuration requires owner or manager','otro cliente no ve la caja del restaurante');
reset role;
select set_config('request.jwt.claims','{"role":"anon"}',true);
set local role anon;
select throws_ok($$ select public.get_gateway_payment_intent(pg_temp.gateway_order_id(19)) $$,
  'P0001',null,'anónimo sin token no ve pedido autenticado');
select throws_ok($$ select public.apply_gateway_payment('mercadopago','qa-anon',
  pg_temp.gateway_attempt_id(21),'invented-anon',2000,'PEN','approved',now(),'{}') $$,
  '42501','permission denied for function apply_gateway_payment','anónimo no autoriza dinero');
select ok(not (public.gateway_config_public(md5('gateway-qa-restaurant')::uuid) ? 'credentials_encrypted'),
  'estado público sólo contiene capacidades, nunca credenciales');
reset role;

-- 16. Contrato de concurrencia: inspección estructural, no ejecución de dos sesiones.
-- La prueba de carrera real se documenta en gateway-concurrency.spec y queda pendiente en QA remoto.
select ok(pg_get_functiondef('private.create_gateway_intent(uuid,text,text)'::regprocedure)
  like '%from public.orders where id=p_order_id for update%',
  'creación serializa intentos usando lock del pedido');
select ok(pg_get_functiondef('public.apply_gateway_payment(text,text,uuid,text,bigint,text,text,timestamptz,jsonb)'::regprocedure)
  like '%for update of o1%', 'aplicación bloquea pedido antes de actualizar pago');
select ok(exists(select 1 from pg_constraint where conrelid='private.gateway_transactions'::regclass
  and contype='p'), 'clave financiera única también protege eventos concurrentes');
select ok(exists(select 1 from pg_constraint where conrelid='private.gateway_events'::regclass
  and contype='u'), 'eventos tienen unicidad atómica en PostgreSQL');
select * from finish();
rollback;
