begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(1);

do $$
declare
  operator_id uuid := extensions.gen_random_uuid();
  category_id uuid := extensions.gen_random_uuid();
  store_id uuid := extensions.gen_random_uuid();
  retry_order uuid := extensions.gen_random_uuid();
  limited_order uuid := extensions.gen_random_uuid();
  pair text;
  primary_device record;
  origin jsonb := '{"packageName":"com.bcp.innovacxion.yapeapp","operationKind":"incoming_payment"}';
begin
  insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
  values (operator_id, 'authenticated', 'authenticated', 'yape-retry@example.test', '{}', '{}');
  insert into public.categories (id, slug, name, icon)
  values (category_id, 'yape-retry-fixture', 'Pruebas', 'wallet');
  insert into public.restaurants (id, slug, category_id, name, address, active, accepting_orders)
  values (store_id, 'yape-retry-fixture', category_id, 'Prueba', 'Sullana', true, true);
  insert into public.restaurant_members (restaurant_id, user_id, role) values (store_id, operator_id, 'owner');
  perform set_config('request.jwt.claims', jsonb_build_object('sub', operator_id, 'role', 'authenticated')::text, true);

  perform public.save_wallet_observer_route(store_id, 1, 'yape', 'Titular de prueba', '000201-test-qr-yape-retry');
  select pairing_code into pair from public.create_routed_wallet_observer_pairing(store_id, 1, 'Suya Caja');
  select * into primary_device from public.complete_wallet_observer_pairing(pair);
  assert public.report_wallet_observer_health(primary_device.device_token, true, array['yape'], 0);
  -- La prueba verifica los códigos sobre una ruta cuya activación ya fue comprobada.
  update private.wallet_observer_routes set enabled = true, tested_at = now() where restaurant_id = store_id;
  perform public.set_wallet_observer_checkout(store_id, true);
  perform public.set_wallet_observer_device_auto_settle(primary_device.device_id, true);

  insert into public.orders (id, code, customer_id, restaurant_id, status, payment_method, subtotal, delivery_fee,
    customer_name, customer_phone, delivery_address, estimated_minutes, idempotency_key)
  values
    (retry_order, 'OBSYAPERETRY', operator_id, store_id, 'pending_payment', 'yape', 1, 0, 'Cliente Prueba', '999999999', 'Calle 1', 30, extensions.gen_random_uuid()),
    (limited_order, 'OBSYAPELIMIT', operator_id, store_id, 'pending_payment', 'yape', 2, 0, 'Cliente Prueba', '999999999', 'Calle 1', 30, extensions.gen_random_uuid());

  perform public.create_payment_intent(retry_order, 'yape');
  perform public.ingest_wallet_observation(primary_device.device_token, 'retry-payment', 'yape',
    null, '047', 100, 'PEN', clock_timestamp(), origin);
  assert public.verify_routed_yape_code(retry_order, '123') = 'code_mismatch', 'rechaza el código incorrecto';
  assert (select status = 'pending_payment' from public.orders where id = retry_order);
  assert public.verify_routed_yape_code(retry_order, '047') = 'authorized', 'permite corregir el código';
  assert (select status = 'confirmed' from public.orders where id = retry_order);

  perform public.create_payment_intent(limited_order, 'yape');
  assert public.verify_routed_yape_code(limited_order, '124') = 'unobserved';
  assert public.verify_routed_yape_code(limited_order, '124') = 'unobserved';
  assert public.verify_routed_yape_code(limited_order, '125') = 'unobserved';
  assert public.verify_routed_yape_code(limited_order, '126') = 'unobserved';
  assert public.verify_routed_yape_code(limited_order, '127') = 'retry_limit';
  assert (select payer_code_last4 = '126' from public.payment_attempts where order_id = limited_order);

  perform set_config('request.jwt.claims', '{}', true);
  begin
    perform public.verify_routed_yape_code(limited_order, '126');
    raise exception 'la verificación debe exigir el titular' using errcode = '22000';
  exception when raise_exception then
    assert sqlerrm = 'order owner required';
  end;
end;
$$;

select pass('código incorrecto, corrección, verificación sin abono y límite de intentos');
select * from finish();
rollback;
