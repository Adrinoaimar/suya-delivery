begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(16);

select has_function(
  'private',
  'bootstrap_auth_profile',
  array[]::text[],
  'existe función privada de bootstrap'
);

select has_trigger(
  'auth',
  'users',
  'auth_user_profile_bootstrap',
  'auth.users crea perfiles mediante trigger'
);

select ok(
  (
    select prosecdef
      and proconfig = array['search_path=""']::text[]
    from pg_catalog.pg_proc
    where oid = 'private.bootstrap_auth_profile()'::pg_catalog.regprocedure
  ),
  'función usa SECURITY DEFINER con search_path vacío'
);

select ok(
  not pg_catalog.has_function_privilege(
    'anon',
    'private.bootstrap_auth_profile()',
    'EXECUTE'
  )
  and not pg_catalog.has_function_privilege(
    'authenticated',
    'private.bootstrap_auth_profile()',
    'EXECUTE'
  ),
  'roles API no pueden ejecutar función privilegiada'
);

select lives_ok(
  $$
    insert into auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at
    ) values (
      '00000000-0000-0000-0000-000000000000',
      '10000000-0000-0000-0000-000000000001',
      'authenticated',
      'authenticated',
      'maria@example.test',
      '',
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"display_name":"  María\n\tSuya  ","role":"platform_admin","roles":["rider","staff"]}'::jsonb,
      now(),
      now()
    )
  $$,
  'insertar auth.users crea perfil sin bloquear alta'
);

select is(
  (
    select display_name
    from public.profiles
    where id = '10000000-0000-0000-0000-000000000001'
  ),
  'María Suya',
  'display_name elimina controles, espacios externos y repeticiones'
);

select lives_ok(
  $$
    insert into auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at
    ) values (
      '00000000-0000-0000-0000-000000000000',
      '10000000-0000-0000-0000-000000000002',
      'authenticated',
      'authenticated',
      'fallback@example.test',
      '',
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"display_name":" x "}'::jsonb,
      now(),
      now()
    )
  $$,
  'metadata inválida usa fallback'
);

select is(
  (
    select display_name
    from public.profiles
    where id = '10000000-0000-0000-0000-000000000002'
  ),
  'fallback',
  'fallback de email satisface restricción de display_name'
);

select ok(
  exists (
    select 1
    from public.profiles
    where id = '10000000-0000-0000-0000-000000000001'
  ),
  'perfil existe antes de borrar usuario'
);

select lives_ok(
  $$
    delete from auth.users
    where id = '10000000-0000-0000-0000-000000000001'
  $$,
  'usuario Auth puede borrarse'
);

select ok(
  not exists (
    select 1
    from public.profiles
    where id = '10000000-0000-0000-0000-000000000001'
  ),
  'borrado de auth.users elimina perfil en cascade'
);

set local request.jwt.claims =
  '{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated","app_metadata":{},"user_metadata":{"role":"platform_admin"}}';

select ok(
  not private.is_platform_admin(),
  'user_metadata no autoasigna platform_admin'
);

select ok(
  not exists (
    select 1
    from public.rider_profiles
    where user_id = '10000000-0000-0000-0000-000000000002'
  ),
  'metadata no autoasigna rider'
);

select ok(
  not exists (
    select 1
    from public.restaurant_members
    where user_id = '10000000-0000-0000-0000-000000000002'
  ),
  'metadata no autoasigna staff'
);

select ok(
  not pg_catalog.has_table_privilege('authenticated', 'public.rider_profiles', 'INSERT'),
  'authenticated no puede crear rol rider'
);

select ok(
  not pg_catalog.has_table_privilege('authenticated', 'public.restaurant_members', 'INSERT'),
  'authenticated no puede crear membresía staff'
);

select * from finish();
rollback;
