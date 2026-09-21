begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(10);

select has_table(
  'public',
  'suya_analytics_daily_visitors',
  'existe el almacenamiento diario de visitantes'
);
select has_function(
  'public',
  'record_suya_analytics_visit',
  array['text'],
  'existe la RPC anónima de registro'
);
select has_function(
  'public',
  'list_suya_analytics_daily',
  array['integer'],
  'existe la RPC agregada de administración'
);
select ok(
  has_function_privilege('anon', 'public.record_suya_analytics_visit(text)', 'EXECUTE')
    and has_function_privilege('authenticated', 'public.record_suya_analytics_visit(text)', 'EXECUTE'),
  'el navegador puede registrar y nada más'
);
select ok(
  not has_table_privilege('anon', 'public.suya_analytics_daily_visitors', 'SELECT,INSERT,UPDATE,DELETE'),
  'anon no puede leer ni mutar la tabla'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.suya_analytics_daily_visitors'::regclass),
  'la tabla de visitantes tiene RLS'
);
select ok(
  (select prosecdef and proconfig = array['search_path=""']::text[]
   from pg_proc
   where oid = 'public.record_suya_analytics_visit(text)'::regprocedure),
  'el registro usa SECURITY DEFINER con search_path vacío'
);
select ok(
  (select pg_get_functiondef('public.record_suya_analytics_visit(text)'::regprocedure)
    like '%extensions.digest%'
    and pg_get_functiondef('public.record_suya_analytics_visit(text)'::regprocedure)
      like '%America/Lima%'),
  'el digest queda limitado por fecha local'
);
select ok(
  (select pg_get_functiondef('public.record_suya_analytics_visit(text)'::regprocedure)
    like '%on conflict (visit_day, visitor_hash) do nothing%'),
  'visitas repetidas del mismo día son idempotentes'
);
select ok(
  (select pg_get_functiondef('public.list_suya_analytics_daily(integer)'::regprocedure)
    like '%private.is_platform_admin()%'
    and pg_get_functiondef('public.list_suya_analytics_daily(integer)'::regprocedure)
      like '%count(*)::bigint%'),
  'solo administración recibe agregados, nunca identificadores'
);

select * from finish();
rollback;
