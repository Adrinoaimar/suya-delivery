-- Las RPC Culqi históricas comparaban customer_id con auth.uid() sin tratar
-- NULL como rechazo. Se conservan internamente para compatibilidad, pero las
-- llamadas públicas pasan por wrappers que validan identidad antes de delegar.

create or replace function private.require_payment_actor(
  p_order_id uuid,
  p_guest_access_token text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer_id uuid;
  v_guest_ok boolean := false;
begin
  select o.customer_id into v_customer_id
  from public.orders o
  where o.id = p_order_id;
  if not found then raise exception 'order not found'; end if;

  if v_customer_id is null then
    select exists (
      select 1 from private.order_secrets s
      where s.order_id = p_order_id
        and p_guest_access_token is not null
        and length(p_guest_access_token) between 32 and 128
        and s.guest_access_token_hash is not null
        and extensions.crypt(p_guest_access_token, s.guest_access_token_hash) = s.guest_access_token_hash
    ) into v_guest_ok;
    if not v_guest_ok then raise exception 'guest order token is invalid'; end if;
  elsif (select auth.uid()) is null or v_customer_id <> (select auth.uid()) then
    raise exception 'order owner required';
  end if;
end;
$$;

create or replace function private.require_payment_attempt_actor(
  p_payment_attempt_id uuid,
  p_guest_access_token text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_id uuid;
begin
  select pa.order_id into v_order_id
  from public.payment_attempts pa
  where pa.id = p_payment_attempt_id;
  if not found then raise exception 'payment attempt not found'; end if;
  perform private.require_payment_actor(v_order_id, p_guest_access_token);
end;
$$;

create or replace function public.create_culqi_payment_intent_secure(
  p_order_id uuid,
  p_method text,
  p_guest_access_token text default null
)
returns table (
  attempt_id uuid,
  order_id uuid,
  method public.payment_method,
  status public.payment_status,
  amount numeric,
  currency text,
  checkout_reference text,
  expires_at timestamptz,
  provider text,
  provider_reference text,
  qr_payload text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_payment_actor(p_order_id, p_guest_access_token);
  return query select * from public.create_culqi_payment_intent(
    p_order_id, p_method, p_guest_access_token
  );
end;
$$;

create or replace function public.claim_culqi_order_creation_secure(
  p_payment_attempt_id uuid,
  p_method text,
  p_guest_access_token text default null
)
returns table (
  attempt_id uuid,
  order_id uuid,
  order_code text,
  method public.payment_method,
  status public.payment_status,
  amount numeric,
  currency text,
  checkout_reference text,
  expires_at timestamptz,
  provider text,
  provider_reference text,
  qr_payload text,
  claim_token text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_payment_attempt_actor(p_payment_attempt_id, p_guest_access_token);
  return query select * from public.claim_culqi_order_creation(
    p_payment_attempt_id, p_method, p_guest_access_token
  );
end;
$$;

create or replace function public.claim_culqi_payment_secure(
  p_payment_attempt_id uuid,
  p_method text,
  p_guest_access_token text default null
)
returns table (
  attempt_id uuid,
  order_id uuid,
  order_code text,
  method public.payment_method,
  amount numeric,
  currency text,
  customer_name text,
  customer_phone text,
  claim_token text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_payment_attempt_actor(p_payment_attempt_id, p_guest_access_token);
  return query select * from public.claim_culqi_payment(
    p_payment_attempt_id, p_method, p_guest_access_token
  );
end;
$$;

create or replace function public.authorize_culqi_payment_secure(
  p_payment_attempt_id uuid,
  p_method text,
  p_provider_reference text,
  p_claim_token text,
  p_guest_access_token text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_payment_attempt_actor(p_payment_attempt_id, p_guest_access_token);
  return public.authorize_culqi_payment(
    p_payment_attempt_id, p_method, p_provider_reference, p_claim_token, p_guest_access_token
  );
end;
$$;

create or replace function public.fail_culqi_payment_claim_secure(
  p_payment_attempt_id uuid,
  p_claim_token text,
  p_failure_code text,
  p_guest_access_token text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_payment_attempt_actor(p_payment_attempt_id, p_guest_access_token);
  return public.fail_culqi_payment_claim(
    p_payment_attempt_id, p_claim_token, p_failure_code, p_guest_access_token
  );
end;
$$;

revoke all on function private.require_payment_actor(uuid, text) from public, anon, authenticated;
revoke all on function private.require_payment_attempt_actor(uuid, text) from public, anon, authenticated;

revoke all on function public.create_culqi_payment_intent(uuid, text, text) from public, anon, authenticated;
revoke all on function public.claim_culqi_order_creation(uuid, text, text) from public, anon, authenticated;
revoke all on function public.claim_culqi_payment(uuid, text, text) from public, anon, authenticated;
revoke all on function public.authorize_culqi_payment(uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.fail_culqi_payment_claim(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.get_culqi_card_payment_context(uuid, text) from public, anon, authenticated;
revoke all on function public.authorize_culqi_card_payment(uuid, text, text) from public, anon, authenticated;

grant execute on function public.create_culqi_payment_intent_secure(uuid, text, text) to anon, authenticated;
grant execute on function public.claim_culqi_order_creation_secure(uuid, text, text) to anon, authenticated;
grant execute on function public.claim_culqi_payment_secure(uuid, text, text) to anon, authenticated;
grant execute on function public.authorize_culqi_payment_secure(uuid, text, text, text, text) to anon, authenticated;
grant execute on function public.fail_culqi_payment_claim_secure(uuid, text, text, text) to anon, authenticated;

comment on function private.require_payment_actor(uuid, text)
  is 'Autoriza ordenes autenticadas por propietario o guest por token; NULL nunca autoriza.';
