begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(8);

select has_function(
  'public',
  'create_wallet_observer_pairing',
  array['uuid', 'uuid', 'text'],
  'existe la RPC autenticada para crear emparejamientos'
);
select has_function(
  'public',
  'complete_wallet_observer_pairing',
  array['text', 'text'],
  'existe la RPC de consumo de un emparejamiento'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.create_wallet_observer_pairing(uuid,uuid,text)',
    'EXECUTE'
  ),
  'solo sesiones autenticadas crean códigos'
);
select ok(
  has_function_privilege(
    'anon',
    'public.complete_wallet_observer_pairing(text,text)',
    'EXECUTE'
  ),
  'el APK puede consumir el código sin login'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.create_wallet_observer_pairing(uuid,uuid,text)',
    'EXECUTE'
  ),
  'anon no puede crear emparejamientos'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.wallet_observer_pairings'::regclass),
  'la tabla de códigos tiene RLS habilitado'
);
select ok(
  (select pg_get_functiondef('public.complete_wallet_observer_pairing(text,text)'::regprocedure)
    like '%consumed_at is null%'
    and pg_get_functiondef('public.complete_wallet_observer_pairing(text,text)'::regprocedure)
      like '%expires_at > now()%'),
  'el código solo sirve una vez y antes de expirar'
);
select ok(
  (select pg_get_functiondef('public.complete_wallet_observer_pairing(text,text)'::regprocedure)
    like '%device_token%'
    and pg_get_functiondef('public.complete_wallet_observer_pairing(text,text)'::regprocedure)
      like '%token_hash%'),
  'la credencial se genera y almacena como hash en servidor'
);

select * from finish();
rollback;
