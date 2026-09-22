begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(10);

select has_table(
  'public',
  'suya_analytics_daily_events',
  'existe el almacenamiento agregado de eventos'
);
select has_function(
  'public',
  'record_suya_analytics_event',
  array['text', 'text'],
  'existe la RPC pública de eventos'
);
select has_function(
  'public',
  'list_suya_analytics_events',
  array['integer'],
  'existe la RPC agregada de eventos'
);
select ok(
  has_function_privilege('anon', 'public.record_suya_analytics_event(text,text)', 'EXECUTE')
    and has_function_privilege('authenticated', 'public.record_suya_analytics_event(text,text)', 'EXECUTE'),
  'el navegador puede registrar eventos agregados'
);
select ok(
  not has_table_privilege('anon', 'public.suya_analytics_daily_events', 'SELECT,INSERT,UPDATE,DELETE'),
  'anon no puede leer ni mutar eventos directamente'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.suya_analytics_daily_events'::regclass),
  'la tabla de eventos tiene RLS'
);
select ok(
  (select prosecdef and proconfig = array['search_path=""']::text[]
   from pg_proc
   where oid = 'public.record_suya_analytics_event(text,text)'::regprocedure),
  'el registro de eventos usa SECURITY DEFINER con search_path vacío'
);
select ok(
  (select pg_get_functiondef('public.record_suya_analytics_event(text,text)'::regprocedure)
    like '%event_name in%'
    and pg_get_functiondef('public.record_suya_analytics_event(text,text)'::regprocedure)
      like '%event_key !~%'),
  'la RPC valida evento y clave'
);
select ok(
  (select pg_get_functiondef('public.record_suya_analytics_event(text,text)'::regprocedure)
    like '%America/Lima%'
    and pg_get_functiondef('public.record_suya_analytics_event(text,text)'::regprocedure)
      like '%least(public.suya_analytics_daily_events.event_count + 1, 1000000)%'),
  'los eventos usan día local y límite anti-desborde'
);
select ok(
  (select pg_get_functiondef('public.list_suya_analytics_events(integer)'::regprocedure)
    like '%private.is_platform_admin()%'
    and pg_get_functiondef('public.list_suya_analytics_events(integer)'::regprocedure)
      like '%event_count%'),
  'solo administración recibe agregados de eventos'
);

select * from finish();
rollback;
