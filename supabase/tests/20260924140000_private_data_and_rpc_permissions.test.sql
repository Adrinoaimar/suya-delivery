begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(13);

select ok(
  (select bool_and(relrowsecurity)
   from pg_class
   where oid in (
     'private.guest_order_rate_limits'::regclass,
     'private.payment_claim_secrets'::regclass
   )),
  'RLS is enabled on private rate-limit and payment-secret tables'
);

select is_empty($$
  select 1
  from (values
    ('private.guest_order_rate_limits'::regclass),
    ('private.payment_claim_secrets'::regclass)
  ) as protected_tables(table_oid)
  where has_table_privilege('anon', table_oid, 'SELECT')
     or has_table_privilege('authenticated', table_oid, 'SELECT')
$$, 'client roles cannot read private tables');

select ok(
  has_table_privilege('service_role', 'private.payment_claim_secrets', 'SELECT'),
  'service role retains access needed by payment-claim functions'
);

select is_empty($$
  select 1
  from pg_proc p
  where p.oid in (
    'public.get_order_codes(uuid)'::regprocedure,
    'public.confirm_order_delivery(uuid,text)'::regprocedure,
    'public.create_restaurant_table(uuid,text)'::regprocedure,
    'public.regenerate_restaurant_table_qr(uuid)'::regprocedure,
    'public.set_restaurant_table_active(uuid,boolean)'::regprocedure,
    'public.list_restaurant_tables(uuid[])'::regprocedure,
    'public.list_suya_analytics_daily(integer)'::regprocedure,
    'public.open_table_session(uuid)'::regprocedure
  ) and has_function_privilege('anon', p.oid, 'EXECUTE')
$$, 'anon cannot execute authenticated-only order, rider, table, or analytics RPCs');

select ok(
  (select bool_and(has_function_privilege('authenticated', p.oid, 'EXECUTE'))
   from pg_proc p
   where p.oid in (
     'public.get_order_codes(uuid)'::regprocedure,
     'public.confirm_order_delivery(uuid,text)'::regprocedure,
     'public.create_restaurant_table(uuid,text)'::regprocedure,
     'public.regenerate_restaurant_table_qr(uuid)'::regprocedure,
     'public.set_restaurant_table_active(uuid,boolean)'::regprocedure,
     'public.list_restaurant_tables(uuid[])'::regprocedure,
     'public.list_suya_analytics_daily(integer)'::regprocedure,
     'public.open_table_session(uuid)'::regprocedure
   )),
  'authenticated users retain intended RPC access'
);

select ok(
  has_function_privilege('anon', 'public.get_guest_order(uuid,text)', 'EXECUTE'),
  'anonymous guests retain token-gated order reads'
);

select ok(
  has_function_privilege('anon', 'public.open_guest_table_session(text)', 'EXECUTE'),
  'anonymous guests can still open a session with a QR token'
);

select ok(
  has_function_privilege('anon', 'public.set_guest_order_delivery_coordinates(uuid,text,double precision,double precision)', 'EXECUTE'),
  'guest delivery coordinates stay available through their token-gated RPC'
);

select ok(
  has_function_privilege('anon', 'public.create_menu_order_with_customer(uuid,jsonb,text,text,text,text,uuid,text,text,double precision,double precision)', 'EXECUTE'),
  'anonymous menu checkout remains available'
);

select ok(
  has_function_privilege('anon', 'public.create_payment_intent(uuid,text,text)', 'EXECUTE'),
  'guest wallet checkout remains available through its access-token guard'
);

select is_empty($$
  select 1
  from pg_proc p
  where p.oid in (
    'private.audit_wallet_observation_insert()'::regprocedure,
    'private.refresh_table_session_totals()'::regprocedure
  )
  and (has_function_privilege('anon', p.oid, 'EXECUTE')
    or has_function_privilege('authenticated', p.oid, 'EXECUTE'))
$$, 'trigger-only private functions cannot be called by client roles');

select ok(
  lower(pg_get_functiondef('public.get_order_codes(uuid)'::regprocedure))
    like '%(select auth.uid()) is not null%',
  'order-code lookup rejects null identity before matching guest orders'
);

select ok(
  lower(pg_get_functiondef('public.confirm_order_delivery(uuid,text)'::regprocedure))
    like '%authentication required%',
  'delivery confirmation rejects anonymous callers inside the function too'
);

select * from finish();
rollback;
