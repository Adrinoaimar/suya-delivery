begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(13);

select has_function('private', 'payment_claim_hmac', array['text'],
  'la huella de evidencia vive en una función privada');
select has_function('public', 'declare_manual_payment', array['uuid', 'text', 'text', 'text'],
  'la declaración manual tiene contrato server-side');
select has_function('public', 'get_payment_declaration', array['uuid', 'text'],
  'la consulta de declaración está protegida por token/usuario');
select ok(
  (select exists (select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'payment_attempts' and column_name = 'payment_declared_at')),
  'el intento conserva la hora de declaración'
);
select ok(
  (select exists (select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'payment_attempts' and column_name = 'payer_code_hmac')),
  'el intento conserva HMAC del código'
);
select ok(
  (select exists (select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'wallet_observations' and column_name = 'code_hmac')),
  'la observación conserva HMAC del código'
);
select ok(
  (select exists (select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'payment_claims')),
  'la declaración tiene entidad auditable separada'
);
select ok(
  (select pg_get_functiondef('private.payment_claim_hmac(text)'::regprocedure) like '%extensions.hmac%'),
  'la huella nueva usa HMAC de clave server-side'
);
select ok(
  (select pg_get_functiondef('public.declare_manual_payment(uuid,text,text,text)'::regprocedure) like '%payment_claims%'),
  'la declaración persiste una claim sin exponer el código'
);
select ok(
  (select pg_get_functiondef('public.refresh_payment_intent(uuid,text,text)'::regprocedure) like '%v_declared_at%'),
  'la renovación inspecciona la declaración antes de crear otro intento'
);
select ok(
  (select pg_get_functiondef('public.list_wallet_payment_candidates(uuid)'::regprocedure) like '%24 hours%'),
  'la tolerancia tardía se limita a propuestas'
);
select ok(
  (select pg_get_functiondef('public.verify_wallet_payment(uuid,uuid)'::regprocedure) like '%payment_declared_at%'),
  'la verificación final revalida la declaración y la ventana'
);
select ok(
  (select pg_get_functiondef('private.write_audit_log()'::regprocedure) like '%payer_code_hmac%'),
  'la auditoría no persiste hashes ni HMAC del pagador'
);

select * from finish();
rollback;
