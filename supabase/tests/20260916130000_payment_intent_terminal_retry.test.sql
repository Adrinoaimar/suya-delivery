begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(6);

select has_function('public', 'create_payment_intent', array['uuid', 'text', 'text'],
  'create_payment_intent conserva su contrato');
select ok(
  (select pg_get_functiondef('public.create_payment_intent(uuid,text,text)'::regprocedure) like '%:retry:%'),
  'un intento terminal usa una clave de reintento única'
);
select ok(
  (select pg_get_functiondef('public.create_payment_intent(uuid,text,text)'::regprocedure) like '%for update%'),
  'la creación mantiene lock por pedido'
);
select ok(
  (select exists (select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'payment_attempts' and column_name = 'idempotency_key')),
  'los intentos conservan la clave idempotente'
);
select ok(
  (select exists (select 1 from pg_constraint
    where conrelid = 'public.payment_attempts'::regclass and contype = 'u'
      and pg_get_constraintdef(oid) like '%idempotency_key%')),
  'la clave idempotente sigue siendo única'
);
select ok(
  (select pg_get_functiondef('public.create_payment_intent(uuid,text,text)'::regprocedure) like '%v_has_prior_attempt%'),
  'el sufijo de reintento solo aparece tras un intento previo'
);

select * from finish();
rollback;
