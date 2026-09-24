begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(5);

select ok(
  (select bool_and(prosecdef and proconfig = array['search_path=""']::text[])
   from pg_proc
   where oid in (
     'public.record_cash_sale(uuid,uuid,numeric,uuid)'::regprocedure,
     'public.add_cash_adjustment(uuid,numeric,text,uuid)'::regprocedure
   )),
  'cash register RPCs remain SECURITY DEFINER with an empty search_path'
);

select is_empty($$
  select 1 from pg_proc p
  where p.oid in (
    'public.record_cash_sale(uuid,uuid,numeric,uuid)'::regprocedure,
    'public.add_cash_adjustment(uuid,numeric,text,uuid)'::regprocedure
  )
  and lower(p.prosrc) ~ 'where[[:space:]]+session_id[[:space:]]*=[[:space:]]*p_session_id[[:space:]]+and[[:space:]]+request_id[[:space:]]*=[[:space:]]*p_request_id'
$$, 'cash entry lookup does not use ambiguous unqualified columns');

select is_empty($$
  select 1 from pg_proc p
  where p.oid in (
    'public.record_cash_sale(uuid,uuid,numeric,uuid)'::regprocedure,
    'public.add_cash_adjustment(uuid,numeric,text,uuid)'::regprocedure
  )
  and has_function_privilege('anon', p.oid, 'EXECUTE')
$$, 'anonymous role cannot call cash register mutations');

select ok(
  (select bool_and(has_function_privilege('authenticated', p.oid, 'EXECUTE'))
   from pg_proc p
   where p.oid in (
     'public.record_cash_sale(uuid,uuid,numeric,uuid)'::regprocedure,
     'public.add_cash_adjustment(uuid,numeric,text,uuid)'::regprocedure
   )),
  'authenticated restaurant staff retain cash register access'
);

select ok(
  (select bool_and(p.prosrc like '%e.session_id = p_session_id%'
       and p.prosrc like '%e.request_id = p_request_id%')
   from pg_proc p
   where p.oid in (
     'public.record_cash_sale(uuid,uuid,numeric,uuid)'::regprocedure,
     'public.add_cash_adjustment(uuid,numeric,text,uuid)'::regprocedure
   )),
  'cash entry queries qualify table columns with an alias'
);

select * from finish();
rollback;
