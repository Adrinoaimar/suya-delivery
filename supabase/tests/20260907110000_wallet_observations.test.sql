begin;

select plan(18);

select has_table('public', 'wallet_observer_devices', 'dispositivos observadores existen');
select has_table('public', 'wallet_observations', 'observaciones de billetera existen');
select has_function(
  'public',
  'create_wallet_observer_device',
  array['uuid', 'text'],
  'RPC de provisionamiento existe'
);
select has_function(
  'public',
  'list_wallet_observer_devices',
  array['uuid'],
  'RPC de estado de dispositivos existe'
);
select has_function(
  'public',
  'ingest_wallet_observation',
  array['text', 'text', 'text', 'text', 'text', 'bigint', 'text', 'timestamp with time zone'],
  'RPC de ingesta existe'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.wallet_observations'::regclass),
  'observaciones tienen RLS'
);
select ok(
  not has_table_privilege('anon', 'public.wallet_observations', 'SELECT'),
  'anon no puede leer observaciones'
);
select ok(
  not has_table_privilege('authenticated', 'public.wallet_observations', 'INSERT'),
  'authenticated no inserta observaciones directamente'
);
select ok(
  not has_table_privilege('authenticated', 'public.wallet_observer_devices', 'SELECT'),
  'el hash de dispositivo no queda expuesto por tabla'
);
select ok(
  has_function_privilege(
    'anon',
    'public.ingest_wallet_observation(text,text,text,text,text,bigint,text,timestamptz)',
    'EXECUTE'
  ),
  'anon solo ingresa mediante RPC autenticada por token'
);
select ok(
  not has_function_privilege(
    'public',
    'public.ingest_wallet_observation(text,text,text,text,text,bigint,text,timestamptz)',
    'EXECUTE'
  ),
  'PUBLIC no tiene ejecución implícita de la RPC'
);
select ok(
  (select prosecdef from pg_proc where oid = 'public.ingest_wallet_observation(text,text,text,text,text,bigint,text,timestamptz)'::regprocedure),
  'la RPC de ingesta usa security definer controlado'
);
select ok(
  (select exists (
    select 1
    from unnest(coalesce(proconfig, '{}'::text[])) setting
    where setting like 'search_path=%'
  ) from pg_proc where oid = 'public.ingest_wallet_observation(text,text,text,text,text,bigint,text,timestamptz)'::regprocedure),
  'la RPC fija search_path'
);
select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.wallet_observations'::regclass
      and contype = 'u'
      and pg_get_constraintdef(oid) like '%device_id%event_id%'
  ),
  'event_id es idempotente por dispositivo'
);
select ok(
  exists (
    select 1 from pg_trigger
    where tgrelid = 'public.wallet_observations'::regclass
      and tgname = 'wallet_observations_audit'
  ),
  'la ingesta deja auditoría'
);
select ok(
  (select pg_get_functiondef('public.ingest_wallet_observation(text,text,text,text,text,bigint,text,timestamptz)'::regprocedure) not like '%payment_attempts%'),
  'la observación no crea payment_attempts automáticamente'
);
select ok(
  (select pg_get_functiondef('public.ingest_wallet_observation(text,text,text,text,text,bigint,text,timestamptz)'::regprocedure) like '%unverified%'),
  'la evidencia inicia sin verificación'
);
select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.wallet_observations'::regclass
      and pg_get_constraintdef(oid) like '%amount_cents%'
  ),
  'el monto tiene restricción positiva'
);

select * from finish();
rollback;
