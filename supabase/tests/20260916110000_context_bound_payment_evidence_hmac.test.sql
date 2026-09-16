begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(12);

select ok(
  (select exists (select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'payment_attempts' and column_name = 'payer_code_hmac_context')),
  'el intento conserva HMAC contextual'
);
select ok(
  (select exists (select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'wallet_observations' and column_name = 'code_hmac_context')),
  'la observación conserva HMAC contextual'
);
select ok(
  (select exists (select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'payment_claims' and column_name = 'code_hmac_context')),
  'la claim conserva HMAC contextual'
);
select has_function('private', 'payment_claim_hmac', array['text', 'text'],
  'existe el HMAC privado con contexto'
);
select has_function('private', 'payment_claim_hmac', array['text'],
  'se conserva el HMAC legacy para compatibilidad'
);
select ok(
  (select pg_get_functiondef('private.payment_claim_hmac(text,text)'::regprocedure) like '%suya-payment-evidence:v2%'),
  'el HMAC contextual incluye una versión de dominio separada'
);
select ok(
  (select pg_get_functiondef('public.declare_manual_payment(uuid,text,text,text)'::regprocedure) like '%payment_claim_hmac(v_code, v_context)%'),
  'la declaración liga la evidencia a cuenta y método'
);
select ok(
  (select pg_get_functiondef('public.ingest_wallet_observation(text,text,text,text,text,bigint,text,timestamptz)'::regprocedure) like '%code_hmac_context%'),
  'la ingesta persiste el HMAC contextual'
);
select ok(
  (select pg_get_functiondef('public.set_wallet_observation_code(uuid,text)'::regprocedure) like '%payment_claim_hmac(v_code, v_context)%'),
  'la corrección operativa liga la evidencia a cuenta y proveedor'
);
select ok(
  (select pg_get_functiondef('public.list_wallet_payment_candidates(uuid)'::regprocedure) like '%payer_code_hmac_context%'),
  'la lista prioriza coincidencia contextual'
);
select ok(
  (select pg_get_functiondef('public.verify_wallet_payment(uuid,uuid)'::regprocedure) like '%v_context_hmac%'),
  'la verificación final exige contexto cuando existe en ambos lados'
);
select ok(
  (select pg_get_functiondef('private.write_audit_log()'::regprocedure) like '%payer_code_hmac_context%'),
  'la auditoría excluye también el HMAC contextual'
);

select * from finish();
rollback;
