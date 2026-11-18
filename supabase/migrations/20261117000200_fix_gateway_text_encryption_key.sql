-- La clave histórica es text; encode requiere bytea. Conserva la clave y
-- convierte explícitamente sus bytes UTF-8 para guardar y leer credenciales.
do $$
declare
  v_function regprocedure;
  v_definition text;
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'private' and table_name = 'payment_claim_secrets'
      and column_name = 'hmac_key' and data_type = 'text'
  ) then
    foreach v_function in array array[
      'public.upsert_payment_gateway_config(uuid,text,text,text,text,text,text,text,text,boolean)'::regprocedure,
      'public.get_payment_gateway_runtime_config(uuid,text)'::regprocedure
    ] loop
      v_definition := pg_get_functiondef(v_function);
      execute replace(v_definition, 'encode(hmac_key, ''hex'')',
        'encode(convert_to(hmac_key, ''UTF8''), ''hex'')');
    end loop;
  end if;
end;
$$;
