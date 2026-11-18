begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(1);

do $$
declare
  operator_id uuid := extensions.gen_random_uuid();
  category_id uuid := extensions.gen_random_uuid();
  store_id uuid := extensions.gen_random_uuid();
  adriano_order uuid := extensions.gen_random_uuid();
  jean_order uuid := extensions.gen_random_uuid();
  other_order uuid := extensions.gen_random_uuid();
  pair text;
  primary_device record;
  backup_device record;
  intent record;
  captured_at timestamptz;
  origin jsonb := '{"packageName":"com.bcp.innovacxion.yapeapp","operationKind":"incoming_payment"}';
begin
  insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
  values (operator_id, 'authenticated', 'authenticated', 'observer-routing@example.test', '{}', '{}');
  insert into public.categories (id, slug, name, icon)
  values (category_id, 'observer-routing-fixture', 'Pruebas', 'wallet');
  insert into public.restaurants (id, slug, category_id, name, address, active, accepting_orders)
  values (store_id, 'observer-routing-fixture', category_id, 'Prueba', 'Sullana', true, true);
  insert into public.restaurant_members (restaurant_id, user_id, role) values (store_id, operator_id, 'owner');
  perform set_config('request.jwt.claims', jsonb_build_object('sub', operator_id, 'role', 'authenticated')::text, true);

  assert (select count(*) = 6 from public.list_wallet_observer_routes(store_id));
  perform public.save_wallet_observer_route(store_id, 1, 'yape', 'Adriano Prueba', '000201-test-qr-primary');
  perform public.save_wallet_observer_route(store_id, 1, 'lemon', 'Adriano Prueba', '000201-test-qr-lemon');
  perform public.save_wallet_observer_route(store_id, 2, 'yape', 'Jean Prueba', '000201-test-qr-backup');

  select pairing_code into pair from public.create_routed_wallet_observer_pairing(store_id, 1, 'Adriano');
  select * into primary_device from public.complete_wallet_observer_pairing(pair);
  select pairing_code into pair from public.create_routed_wallet_observer_pairing(store_id, 2, 'Jean');
  begin
    perform public.complete_profiled_wallet_observer_pairing(pair, 'APK de Adriano', 1);
    raise exception 'se consumió un código de otro puesto' using errcode = '22000';
  exception when raise_exception then
    assert sqlerrm = 'invalid or expired pairing code for this observer';
  end;
  select * into backup_device from public.complete_profiled_wallet_observer_pairing(pair, 'APK de Jean', 2);

  assert not public.report_wallet_observer_health(backup_device.device_id::text || repeat('x', 64),
    true, array['yape'], 0), 'el dispositivo requiere su credencial';
  assert public.report_wallet_observer_health(primary_device.device_token, true, array['yape', 'lemon'], 0);
  assert public.report_wallet_observer_health(backup_device.device_token, true, array['yape'], 0);

  begin
    perform public.set_wallet_observer_route_enabled(store_id, 1, 'yape',
      (select version from public.list_wallet_observer_routes(store_id) where priority = 1 and provider = 'yape'), true);
    raise exception 'se habilitó sin abono de prueba' using errcode = '22000';
  exception when raise_exception then
    assert sqlerrm like '%abono de prueba observado%';
  end;

  perform public.ingest_wallet_observation(primary_device.device_token, 'probe-primary', 'yape',
    'Persona Prueba', '123', 500, 'PEN', now(), origin);
  perform public.ingest_wallet_observation(backup_device.device_token, 'probe-backup', 'yape',
    'Persona Prueba', '124', 500, 'PEN', now(), origin);
  perform public.set_wallet_observer_route_enabled(store_id, 1, 'yape',
    (select version from public.list_wallet_observer_routes(store_id) where priority = 1 and provider = 'yape'), true);
  perform public.set_wallet_observer_route_enabled(store_id, 2, 'yape',
    (select version from public.list_wallet_observer_routes(store_id) where priority = 2 and provider = 'yape'), true);
  perform public.ingest_wallet_observation(primary_device.device_token, 'probe-lemon', 'lemon',
    'Persona Prueba', null, 500, 'PEN', now(),
    '{"packageName":"com.applemoncash","operationKind":"incoming_payment"}'::jsonb);
  perform public.set_wallet_observer_route_enabled(store_id, 1, 'lemon',
    (select version from public.list_wallet_observer_routes(store_id) where priority = 1 and provider = 'lemon'), true);
  perform public.set_wallet_observer_checkout(store_id, true);
  perform public.set_wallet_observer_device_auto_settle(primary_device.device_id, true);
  perform public.set_wallet_observer_device_auto_settle(backup_device.device_id, true);

  insert into public.orders (id, code, customer_id, restaurant_id, status, payment_method, subtotal, delivery_fee,
    customer_name, customer_phone, delivery_address, estimated_minutes, idempotency_key)
  values
    (adriano_order, 'OBSROUTE1', operator_id, store_id, 'pending_payment', 'yape', 30, 0, 'Nombre Pagador', '999999999', 'Calle 1', 30, extensions.gen_random_uuid()),
    (jean_order, 'OBSROUTE2', operator_id, store_id, 'pending_payment', 'yape', 30, 0, 'Nombre Pagador', '999999999', 'Calle 1', 30, extensions.gen_random_uuid()),
    (other_order, 'OBSROUTE3', operator_id, store_id, 'pending_payment', 'yape', 30, 0, 'Nombre Pagador', '999999999', 'Calle 1', 30, extensions.gen_random_uuid());

  select * into intent from public.create_payment_intent(adriano_order, 'yape');
  assert intent.qr_payload = '000201-test-qr-primary', 'prioridad del observer principal';

  assert public.report_wallet_observer_health(primary_device.device_token, true, array['lemon'], 0);
  assert (select supports_lemon from public.get_public_checkout_payment_options(store_id)), 'Lemon sigue disponible aunque falle Yape';
  update public.wallet_observer_devices set heartbeat_at = now() - interval '4 minutes'
  where id = primary_device.device_id;
  select * into intent from public.create_payment_intent(jean_order, 'yape');
  assert intent.qr_payload = '000201-test-qr-backup' and intent.amount = 30, 'respaldo y monto exacto';
  begin
    perform public.save_wallet_observer_route(store_id, 1, 'yape', 'Adriano Prueba', '000201-qr-primary-replacement');
    raise exception 'se cambió el QR con un pedido abierto' using errcode = '22000';
  exception when raise_exception then
    assert sqlerrm like 'Hay pagos abiertos con este QR.%';
  end;
  perform public.create_payment_intent(other_order, 'yape');
  assert (select qr_payload from public.get_payment_intent(adriano_order)) = '000201-test-qr-primary',
    'el QR ya entregado se conserva tras la caída';
  assert (select account_label from public.get_payment_receiver_label(adriano_order)) = 'Adriano Prueba';

  perform public.ingest_wallet_observation(backup_device.device_token, 'backup-payment', 'yape',
    'Nombre Pagador', '543', 3000, 'PEN', clock_timestamp(), origin);
  assert (select count(*) = 3 from public.orders where id in (adriano_order, jean_order, other_order)
    and status = 'pending_payment'), 'la colisión requiere una referencia compartida';

  perform public.declare_manual_payment(jean_order, '543', 'Nombre Pagador');
  assert (select status = 'confirmed' from public.orders where id = jean_order);
  assert (select status = 'pending_payment' from public.orders where id = adriano_order);

  perform public.ingest_wallet_observation(backup_device.device_token, 'backup-payment', 'yape',
    'Nombre Pagador', '543', 3000, 'PEN', clock_timestamp(), origin);
  assert (select status = 'pending_payment' from public.orders where id = other_order), 'el replay no confirma un segundo pedido';

  perform public.ingest_wallet_observation(primary_device.device_token, 'primary-payment', 'yape',
    'Nombre Pagador', '543', 3000, 'PEN', clock_timestamp(), origin);
  assert (select status = 'confirmed' from public.orders where id = adriano_order),
    'el reenvío de Adriano se reconoce por cuenta aunque el código se repita en Jean';

  update public.wallet_observer_devices set heartbeat_at = now() - interval '4 minutes'
  where id in (primary_device.device_id, backup_device.device_id);
  assert (select not supports_yape and not supports_lemon from public.get_public_checkout_payment_options(store_id));
  assert (select qr_payload from public.get_payment_intent(other_order)) = '000201-test-qr-backup';
  captured_at := clock_timestamp();
  update public.payment_attempts set expires_at = captured_at - interval '1 second'
  where order_id = other_order and status = 'pending';
  perform public.save_wallet_observer_route(store_id, 2, 'yape', 'Jean Prueba', '000201-qr-backup-replacement');
  perform public.ingest_wallet_observation(backup_device.device_token, 'queued-before-replacement', 'yape',
    'Nombre Pagador', '765', 3000, 'PEN', captured_at, origin);
  assert exists (
    select 1 from public.wallet_observations wo join public.payment_attempts pa
      on pa.observer_route_id = wo.observer_route_id and pa.observer_route_version = wo.observer_route_version
    where wo.event_id = 'queued-before-replacement' and pa.order_id = other_order
  ), 'un aviso capturado antes del cambio conserva la versión original';
  assert (select status = 'pending_payment' from public.orders where id = other_order),
    'un abono tardío se conserva para revisión';

  perform set_config('request.jwt.claims', '{}', true);
  assert not exists (select 1 from public.get_payment_intent(other_order)), 'el QR de un pedido ajeno no se expone';
end;
$$;

select pass('asignación, respaldo, conciliación, reenvío y autorización del pedido');
select * from finish();
rollback;
