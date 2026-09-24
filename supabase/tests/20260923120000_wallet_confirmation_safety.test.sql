begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(15);

create temporary table wallet_authorization_probe (
  status text not null,
  provider text not null,
  method text not null,
  observed_wallet_observation_id uuid
);
create trigger wallet_authorization_probe_guard
before insert on wallet_authorization_probe
for each row execute function private.require_wallet_observation_for_authorization();

select has_function(
  'private', 'require_wallet_observation_for_authorization', array[]::text[],
  'existe el guard de autorización wallet'
);
select has_trigger(
  'public', 'payment_attempts', 'payment_attempts_require_wallet_observation',
  'el guard se ejecuta en intentos de pago'
);
select has_table(
  'private', 'yape_confirmation_attempt_limits',
  'existe contador privado por intento Yape'
);
select has_trigger(
  'public', 'payment_claims', 'payment_claims_limit_yape_code_attempts',
  'el límite cubre también declaraciones directas'
);
select ok(
  not has_table_privilege('anon', 'private.yape_confirmation_attempt_limits', 'SELECT'),
  'anon no puede consultar contadores privados'
);
select ok(
  not has_function_privilege('anon', 'private.consume_yape_confirmation_attempt(uuid)', 'EXECUTE'),
  'anon no puede consumir el contador directamente'
);
select throws_ok(
  $$select private.consume_yape_confirmation_attempt(null::uuid)$$,
  '23502', null,
  'el contador requiere un intento identificable'
);
select throws_ok(
  $$insert into wallet_authorization_probe values ('authorized', 'wallet_observer', 'yape', null)$$,
  'P0001', 'No se pudo validar el pago observado. Inténtalo de nuevo.',
  'rechaza Yape autorizado sin observación'
);
select lives_ok(
  $$insert into wallet_authorization_probe values ('pending', 'wallet_observer', 'yape', null)$$,
  'permite intento Yape pendiente sin observación'
);
select lives_ok(
  $$insert into wallet_authorization_probe values ('authorized', 'culqi', 'yape', null)$$,
  'no bloquea autorización Yape del PSP Culqi'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000', 'e8000000-0000-0000-0000-000000000001',
  'authenticated', 'authenticated', 'wallet-limit@example.test', '', now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now()
);
insert into public.categories (id, slug, name, icon)
values ('e8000000-0000-0000-0000-000000000002', 'wallet-limit', 'Wallet limit', 'wallet');
insert into public.restaurants (id, slug, category_id, name, address, active, accepting_orders)
values ('e8000000-0000-0000-0000-000000000003', 'wallet-limit',
  'e8000000-0000-0000-0000-000000000002', 'Wallet limit', 'Sullana', true, true);
insert into public.orders (
  id, code, customer_id, restaurant_id, status, payment_method, subtotal, delivery_fee,
  customer_name, customer_phone, delivery_address, estimated_minutes, idempotency_key
) values (
  'e8000000-0000-0000-0000-000000000004', 'WALLETLIMIT',
  'e8000000-0000-0000-0000-000000000001', 'e8000000-0000-0000-0000-000000000003',
  'confirmed', 'yape', 1, 0, 'Cliente Prueba', '999999990', 'Calle Prueba', 30,
  'e8000000-0000-0000-0000-000000000005'
);
insert into public.payment_attempts (
  id, order_id, provider, method, status, amount, idempotency_key, checkout_reference, expires_at
) values (
  'e8000000-0000-0000-0000-000000000006', 'e8000000-0000-0000-0000-000000000004',
  'wallet_observer', 'yape', 'pending', 1, 'e8000000-0000-0000-0000-000000000007',
  'SUYA-WLIMIT', now() + interval '30 minutes'
);
insert into public.payment_claims (payment_attempt_id, order_id, code_last4)
values ('e8000000-0000-0000-0000-000000000006',
  'e8000000-0000-0000-0000-000000000004', '101');
select is((select request_count from private.yape_confirmation_attempt_limits
  where payment_attempt_id = 'e8000000-0000-0000-0000-000000000006'),
  1, 'primer código consume un intento');

update public.payment_claims set code_last4 = '101'
where payment_attempt_id = 'e8000000-0000-0000-0000-000000000006';
select is((select request_count from private.yape_confirmation_attempt_limits
  where payment_attempt_id = 'e8000000-0000-0000-0000-000000000006'),
  1, 'polling del mismo código no consume más intentos');

do $$
declare v_code text;
begin
  foreach v_code in array array['102', '103', '104', '105'] loop
    update public.payment_claims set code_last4 = v_code
    where payment_attempt_id = 'e8000000-0000-0000-0000-000000000006';
  end loop;
end;
$$;
select is((select request_count from private.yape_confirmation_attempt_limits
  where payment_attempt_id = 'e8000000-0000-0000-0000-000000000006'),
  5, 'cinco códigos distintos llenan el cupo');
select throws_ok(
  $$update public.payment_claims set code_last4 = '106'
    where payment_attempt_id = 'e8000000-0000-0000-0000-000000000006'$$,
  'P0001', 'Demasiados códigos Yape. Espera 10 minutos antes de intentar de nuevo.',
  'sexto código distinto queda bloqueado'
);
select is((select request_count from private.yape_confirmation_attempt_limits
  where payment_attempt_id = 'e8000000-0000-0000-0000-000000000006'),
  5, 'el bloqueo conserva contador comprometido');

select * from finish();
rollback;
