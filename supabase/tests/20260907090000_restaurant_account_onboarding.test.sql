begin;

select plan(16);

select is(
  (select count(*)::integer
   from public.restaurant_account_registry
   where restaurant_id in (
     '21000000-0000-4000-8000-000000000001',
     '21000000-0000-4000-8000-000000000002',
     '23000000-0000-4000-8000-000000000001'
   )),
  3,
  'registra un casillero para cada restaurante publicado por migraciones'
);

select is(
  (select count(*)::integer
   from public.restaurant_account_registry
   where account_status = 'pending_contact'),
  9,
  'casilleros quedan pendientes sin inventar contactos, incluidos los teasers'
);

select is(
  (select count(*)::integer
   from public.restaurant_account_registry
   where contact_email is not null or owner_user_id is not null),
  0,
  'ningún correo ni usuario Auth se crea automáticamente'
);

select is(
  (select count(*)::integer
   from public.restaurant_account_registry
   where restaurant_id = '21000000-0000-4000-8000-000000000001'),
  1,
  'El Tío Jhony tiene un solo casillero de cuenta propietaria'
);

select is(
  (select count(*)::integer
   from public.restaurant_account_registry
   where restaurant_id = '21000000-0000-4000-8000-000000000002'),
  1,
  'La Waka tiene un solo casillero de cuenta propietaria'
);

select is(
  (select count(*)::integer
   from public.restaurant_account_registry
   where restaurant_id = '23000000-0000-4000-8000-000000000001'),
  1,
  'Donde Joel tiene un solo casillero de cuenta propietaria'
);

select throws_ok(
  $$
    update public.restaurant_account_registry
    set contact_email = 'Owner@Example.com'
    where restaurant_id = '21000000-0000-4000-8000-000000000001'
  $$,
  '23514',
  null,
  'correo debe normalizarse a minúsculas antes de invitar'
);

select throws_ok(
  $$
    update public.restaurant_account_registry
    set account_status = 'active'
    where restaurant_id = '21000000-0000-4000-8000-000000000001'
  $$,
  '23514',
  null,
  'cuenta no puede activarse sin usuario Auth vinculado'
);

select lives_ok(
  $$
    update public.restaurant_account_registry
    set contact_email = 'owner@example.com', account_status = 'ready_to_invite'
    where restaurant_id = '21000000-0000-4000-8000-000000000001'
  $$,
  'correo confirmado deja la cuenta lista para invitar'
);

select lives_ok(
  $$
    update public.restaurant_account_registry
    set account_status = 'invited', invited_at = now()
    where restaurant_id = '21000000-0000-4000-8000-000000000001'
  $$,
  'una invitación puede quedar pendiente del primer inicio de sesión'
);

select lives_ok(
  $$
    insert into public.restaurants (
      id, slug, category_id, name, address, active, accepting_orders
    ) values (
      '24000000-0000-4000-8000-000000000001',
      'futuro-restaurante',
      '10000000-0000-4000-8000-000000000001',
      'Futuro Restaurante',
      'Por confirmar',
      false,
      false
    )
    on conflict (id) do nothing
  $$,
  'alta de restaurante crea automáticamente su casillero'
);

select is(
  (select count(*)::integer
   from public.restaurant_account_registry
   where restaurant_id = '24000000-0000-4000-8000-000000000001'),
  1,
  'restaurante nuevo recibe un único casillero pendiente'
);

select lives_ok(
  $$
    insert into public.restaurant_account_registry (restaurant_id, account_status, notes)
    values ('20000000-0000-4000-8000-000000000001', 'pending_contact', 'seed local')
    on conflict (restaurant_id) do nothing
  $$,
  'Andá Paya puede completar su casillero después del seed'
);

select is(
  (select count(*)::integer
   from public.restaurant_account_registry
   where restaurant_id = '20000000-0000-4000-8000-000000000001'),
  1,
  'Andá Paya tiene un solo casillero de cuenta propietaria'
);

select lives_ok(
  $$
    insert into public.restaurant_account_registry (restaurant_id, account_status, notes)
    select id, 'pending_contact', 'reaplicar onboarding'
    from public.restaurants
    where slug in ('tio-jhony', 'la-waka', 'donde-joel', 'anda-paya')
    on conflict (restaurant_id) do nothing
  $$,
  'reaplicar registro de onboarding conserva idempotencia'
);

select is(
  (select count(*)::integer
   from public.restaurant_account_registry
   where restaurant_id in (
     '20000000-0000-4000-8000-000000000001',
     '21000000-0000-4000-8000-000000000001',
     '21000000-0000-4000-8000-000000000002',
     '23000000-0000-4000-8000-000000000001'
   )),
  4,
  'cuatro restaurantes reales tienen casillero único'
);

select * from finish();
rollback;
