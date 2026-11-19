begin;
set local plpgsql.check_asserts=on;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(1);

do $$
declare
  u uuid := extensions.gen_random_uuid();
  c uuid := extensions.gen_random_uuid();
  collector uuid := extensions.gen_random_uuid();
  first_store uuid := extensions.gen_random_uuid();
  second_store uuid := extensions.gen_random_uuid();
  first_order uuid := extensions.gen_random_uuid();
  second_order uuid := extensions.gen_random_uuid();
  collision_order uuid := extensions.gen_random_uuid();
  pair text;
  device record;
  obs_id uuid;
  expired_attempt uuid;
  fixture_qr constant text := '000201-fixture-suya-central-yape';
  origin constant jsonb := '{"packageName":"com.bcp.innovacxion.yapeapp","operationKind":"incoming_payment"}';
begin
  insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
  values (u,'authenticated','authenticated','suya-central-test@example.test','{}','{}');
  insert into public.categories (id, slug, name, icon) values (c,'suya-central-fixture','Pruebas','wallet');
  insert into public.restaurants (id, slug, category_id, name, address, active, accepting_orders)
  values (collector,'suya-central-caja',c,'Caja temporal','Sullana',true,true),
    (first_store,'suya-central-first',c,'Restaurante de prueba A','Sullana',true,true),
    (second_store,'suya-central-second',c,'Restaurante de prueba B','Sullana',true,true);

  insert into public.restaurant_members (restaurant_id,user_id,role) values (collector,u,'owner');
  perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
  perform set_config('request.jwt.claim.sub',u::text,true);
  perform public.save_wallet_observer_route(collector,1,'yape','Titular de prueba',fixture_qr);
  select pairing_code into strict pair from public.create_routed_wallet_observer_pairing(collector,1,'Caja temporal');
  select * into strict device from public.complete_wallet_observer_pairing(pair);
  assert public.report_wallet_observer_health(device.device_token,true,array['yape'],0);
  update private.wallet_observer_routes set enabled=true,tested_at=now() where restaurant_id=collector;
  perform public.set_wallet_observer_checkout(collector,true);
  perform public.set_wallet_observer_device_auto_settle(device.device_id,true);
  insert into private.central_yape_checkout values(first_store,collector),(second_store,collector);
  insert into private.wallet_observer_checkout values(first_store,true),(second_store,true);

  assert exists(select from public.get_public_checkout_payment_options(first_store) cc
    where cc.active_provider='observer_routing' and cc.supports_yape and not cc.supports_lemon), 'checkout compartido';
  insert into public.orders (id,code,customer_id,restaurant_id,status,payment_method,subtotal,delivery_fee,
    customer_name,customer_phone,delivery_address,estimated_minutes,idempotency_key)
  values (first_order,'CENTRALFIXA',u,first_store,'pending_payment','yape',1,0,'Cliente Original','999999999','Prueba',30,extensions.gen_random_uuid()),
    (second_order,'CENTRALFIXB',u,second_store,'pending_payment','yape',1,0,'Pedro Familiar','999999999','Prueba',30,extensions.gen_random_uuid()),
    (collision_order,'CENTRALFIXC',u,first_store,'pending_payment','yape',3,0,'Cliente Original','999999999','Prueba',30,extensions.gen_random_uuid());

  perform public.create_payment_intent(first_order,'yape');
  perform public.create_payment_intent(second_order,'yape');
  assert exists(select from public.get_payment_intent(first_order,null) p where p.observer_routed and p.qr_payload=fixture_qr), 'snapshot de QR compartido';

  perform public.ingest_wallet_observation(device.device_token,'central-third','yape','Pedro Familiar','047',100,'PEN',clock_timestamp(),origin);
  assert (select status='pending_payment' from public.orders where id=second_order), 'el nombre solo nunca liquida el otro local';
  select wo.id into strict obs_id from public.wallet_observations wo
  where wo.restaurant_id=collector and wo.event_id='central-third';
  assert exists(select from public.list_wallet_payment_candidates_with_store(obs_id)
    where order_code='CENTRALFIXA' and restaurant_name='Restaurante de prueba A'), 'Caja ve comercio y código candidato';
  assert public.verify_routed_yape_code(first_order,'047')='name_required', 'abono único de un tercero pide el nombre';
  assert public.verify_routed_yape_code(first_order,'047','Persona Equivocada')='review', 'nombre incorrecto no liquida';
  assert public.verify_routed_yape_code(first_order,'047','Pedro Familiar')='authorized', 'nombre exacto y código autorizan el pedido correcto';
  assert (select status='confirmed' from public.orders where id=first_order);
  assert (select status='pending_payment' from public.orders where id=second_order);
  assert exists(select from public.list_wallet_observation_orders(array[obs_id]) e
    where e.order_code='CENTRALFIXA' and e.restaurant_name='Restaurante de prueba A'), 'Caja ve origen conciliado';
  assert public.verify_routed_yape_code(second_order,'047')='unobserved', 'el abono aplicado no es reutilizable';

  perform public.create_payment_intent(collision_order,'yape');
  perform public.ingest_wallet_observation(device.device_token,'central-known','yape','Pedro Familiar','048',300,'PEN',clock_timestamp(),origin);
  perform public.ingest_wallet_observation(device.device_token,'central-masked','yape',null,'048',300,'PEN',clock_timestamp(),origin);
  assert public.verify_routed_yape_code(collision_order,'048')='review', 'colisión indistinguible va a Caja';
  assert public.verify_routed_yape_code(collision_order,'048','Pedro Familiar')='review', 'el nombre no resuelve una colisión con evidencia incompleta';

  select pa.id into strict expired_attempt from public.payment_attempts pa where pa.order_id=second_order;
  update public.payment_attempts set created_at=now()-interval '40 minutes', expires_at=now()-interval '10 minutes'
  where id=expired_attempt;
  assert public.report_expired_wallet_qr(second_order,expired_attempt,'Pedro Familiar','FIX-48') is not null;
  assert exists(select from public.list_expired_wallet_qr_claims(collector) where order_code='CENTRALFIXB'),
    'el colector puede consultar el reclamo por QR vencido';
  perform set_config('request.jwt.claim.sub',extensions.gen_random_uuid()::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('request.jwt.claim.sub'),'role','authenticated')::text,true);
  assert not exists(select from public.list_wallet_observation_orders(array[obs_id])),
    'otra cuenta no puede ver la atribución';
  assert not exists(select from public.list_wallet_payment_candidates_with_store(obs_id)),
    'otra cuenta no puede leer candidatos';
  begin
    perform public.review_expired_wallet_qr_claim(collector,expired_attempt);
    assert false, 'otra cuenta no puede revisar reclamos';
  exception when raise_exception then
    assert sqlerrm = 'No tienes permiso para administrar estas billeteras.';

  end;
  perform set_config('request.jwt.claim.sub',u::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
  assert public.review_expired_wallet_qr_claim(collector,expired_attempt);
  assert (select status='pending_payment' from public.orders where id=second_order),
    'revisar un reclamo no cambia el pago';

  update public.wallet_observer_devices set heartbeat_at=now()-interval '4 minutes' where id=device.device_id;
  assert exists(select from public.get_public_checkout_payment_options(first_store) cc
    where cc.active_provider='observer_routing' and not cc.supports_yape), 'sin señal no hay fallback a un QR distinto';
end;
$$;

select pass('El QR central conserva comercio, valida a terceros, controla colisiones y exige señal');
select * from finish();
rollback;
