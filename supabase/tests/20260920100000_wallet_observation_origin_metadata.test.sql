begin;

select plan(7);

select ok(
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'wallet_observations'
      and column_name = 'origin_metadata'
      and data_type = 'jsonb'
  ),
  'observaciones conservan metadatos de origen estructurados'
);
select has_function(
  'public',
  'ingest_wallet_observation',
  array['text', 'text', 'text', 'text', 'text', 'bigint', 'text', 'timestamp with time zone', 'jsonb'],
  'RPC de ingesta acepta origen estructurado'
);
select ok(
  has_function_privilege(
    'anon',
    'public.ingest_wallet_observation(text,text,text,text,text,bigint,text,timestamptz,jsonb)',
    'EXECUTE'
  ),
  'anon puede ingresar origen solo mediante RPC'
);
select ok(
  not has_function_privilege(
    'public',
    'public.ingest_wallet_observation(text,text,text,text,text,bigint,text,timestamptz,jsonb)',
    'EXECUTE'
  ),
  'PUBLIC no ejecuta RPC de origen'
);
select ok(
  (select prosecdef
   from pg_proc
   where oid = 'public.ingest_wallet_observation(text,text,text,text,text,bigint,text,timestamptz,jsonb)'::regprocedure),
  'RPC de origen usa security definer'
);
select ok(
  (select pg_get_functiondef(
    'public.ingest_wallet_observation(text,text,text,text,text,bigint,text,timestamptz,jsonb)'::regprocedure
  ) like '%origin_metadata%'),
  'RPC persiste metadatos sanitizados'
);
select ok(
  (select pg_get_functiondef('private.audit_wallet_observation_insert()'::regprocedure) like '%origin_metadata%'),
  'auditoría conserva metadatos de origen'
);

select * from finish();
rollback;
