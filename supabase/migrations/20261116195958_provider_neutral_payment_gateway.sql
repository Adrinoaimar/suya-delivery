-- Cobros oficiales desacoplados del proveedor. Ningún secreto sale del esquema privado.
create table private.payment_gateway_configs (
  restaurant_id uuid not null references public.restaurants(id),
  version integer not null check (version > 0),
  provider text not null default 'mercadopago' check (provider in ('mercadopago')),
  environment text not null check (environment in ('test','live')),
  credentials_encrypted text not null check (length(credentials_encrypted) between 40 and 24000),
  collector_id text,
  verified_at timestamptz,
  webhook_verified_at timestamptz,
  enabled boolean not null default false,
  production_permissions_confirmed boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (restaurant_id, version),
  check (not enabled or (verified_at is not null and webhook_verified_at is not null and collector_id is not null
    and environment = 'live' and production_permissions_confirmed))
);
alter table private.payment_gateway_configs enable row level security;
revoke all on private.payment_gateway_configs from public, anon, authenticated;

alter table public.payment_attempts
  add column amount_cents bigint generated always as ((amount * 100)::bigint) stored,
  add column checkout_url text,
  add column authorized_transaction_id text,
  add column gateway_config_version integer,
  add column gateway_environment text check (gateway_environment in ('test','live')),
  add column gateway_state text check (gateway_state in (
    'created','pending','approved','rejected','expired','cancelled','late_review',
    'amount_mismatch','identity_mismatch','refunded','partial_refund','disputed','test_confirmed'
  )),
  add column last_reconciled_at timestamptz;

create table private.gateway_creation_claims (
  attempt_id uuid primary key references public.payment_attempts(id),
  token text not null,
  expires_at timestamptz not null
);
create table private.gateway_transactions (
  provider text not null,
  transaction_id text not null,
  attempt_id uuid not null references public.payment_attempts(id),
  amount_cents bigint not null,
  currency text not null,
  state text not null,
  paid_at timestamptz,
  provider_updated_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (provider, transaction_id)
);
create table private.gateway_events (
  id bigint generated always as identity primary key,
  provider text not null,
  event_id text not null,
  attempt_id uuid not null references public.payment_attempts(id),
  transaction_id text not null,
  outcome text not null,
  received_at timestamptz not null default now(),
  unique (provider,event_id)
);
create table private.gateway_admin_audit (
  id bigint generated always as identity primary key,
  restaurant_id uuid not null references public.restaurants(id),
  action text not null,
  version integer not null,
  created_at timestamptz not null default now()
);
alter table private.gateway_creation_claims enable row level security;
alter table private.gateway_transactions enable row level security;
alter table private.gateway_events enable row level security;
alter table private.gateway_admin_audit enable row level security;
revoke all on private.gateway_creation_claims, private.gateway_transactions,
  private.gateway_events, private.gateway_admin_audit from public, anon, authenticated;

create function public.require_gateway_admin(p_restaurant_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if not (private.is_platform_admin() or private.has_restaurant_role(
    p_restaurant_id, array['owner','manager']::public.restaurant_role[]
  )) then raise exception 'payment configuration requires owner or manager'; end if;
  return true;
end;
$$;

create function public.gateway_config_public(p_restaurant_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce((select jsonb_build_object(
    'provider',c.provider,'environment',c.environment,
    'test_available',c.environment='test' and c.verified_at is not null and private.is_platform_admin(),
    'available',c.enabled and c.environment='live' and c.verified_at is not null and c.webhook_verified_at is not null and c.production_permissions_confirmed,
    'automatic',c.enabled and c.environment='live' and c.verified_at is not null and c.webhook_verified_at is not null and c.production_permissions_confirmed,
    'checkout_methods',jsonb_build_array('card')
  ) from private.payment_gateway_configs c where c.restaurant_id=p_restaurant_id
    order by c.version desc limit 1),
    '{"provider":null,"available":false,"automatic":false}'::jsonb);
$$;

create function public.get_gateway_config_secret(p_restaurant_id uuid,p_version integer default null)
returns jsonb language sql stable security definer set search_path = '' as $$
  select to_jsonb(c) from private.payment_gateway_configs c
  where c.restaurant_id=p_restaurant_id and (p_version is null or c.version=p_version)
  order by c.version desc limit 1;
$$;

create function public.save_gateway_config(
  p_restaurant_id uuid, p_environment text, p_credentials_encrypted text,
  p_collector_id text, p_verified boolean, p_enabled boolean,
  p_production_permissions_confirmed boolean, p_expected_version integer default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare c private.payment_gateway_configs%rowtype; v_version integer; changed boolean;
begin
  -- La fila del restaurante serializa también la primera configuración.
  perform 1 from public.restaurants where id=p_restaurant_id for update;
  if not found then raise exception 'restaurant not found'; end if;
  select * into c from private.payment_gateway_configs where restaurant_id=p_restaurant_id
    order by version desc limit 1 for update;
  if coalesce(c.version,0)<>coalesce(p_expected_version,0) then
    raise exception 'configuration changed; reload before saving';
  end if;
  changed := c.version is null or c.credentials_encrypted is distinct from p_credentials_encrypted
    or c.environment is distinct from p_environment;
  if changed then
    v_version := coalesce(c.version,0)+1;
    insert into private.payment_gateway_configs(restaurant_id,version,environment,credentials_encrypted)
      values(p_restaurant_id,v_version,p_environment,p_credentials_encrypted);
  else
    v_version := c.version;
    update private.payment_gateway_configs set collector_id=p_collector_id,
      verified_at=case when p_verified then coalesce(verified_at,now()) else null end,
      enabled=coalesce(p_enabled,false),
      production_permissions_confirmed=coalesce(p_production_permissions_confirmed,false),updated_at=now()
    where restaurant_id=p_restaurant_id and version=v_version;
  end if;
  -- Las versiones antiguas sirven exclusivamente para conciliar cobros ya emitidos.
  update private.payment_gateway_configs set enabled=false
    where restaurant_id=p_restaurant_id and version<>v_version;
  insert into private.gateway_admin_audit(restaurant_id,action,version)
    values(p_restaurant_id,case when changed then 'credentials_rotated'
      when p_enabled then 'enabled' when p_verified then 'connection_verified' else 'disabled' end,v_version);
  select * into c from private.payment_gateway_configs where restaurant_id=p_restaurant_id and version=v_version;
  return to_jsonb(c);
end;
$$;

create function private.gateway_intent_json(a public.payment_attempts) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('attempt_id',a.id,'order_id',a.order_id,'method',a.method,
    'status',a.status,'amount',a.amount,'amount_cents',a.amount_cents,'currency','PEN',
    'checkout_reference',a.checkout_reference,'expires_at',a.expires_at,
    'provider',a.provider,'provider_reference',a.provider_reference,'qr_payload',null,
    'checkout_url',a.checkout_url,'gateway_state',a.gateway_state,
    'config_version',a.gateway_config_version,'environment',a.gateway_environment);
$$;

create function public.get_gateway_attempt(p_attempt_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select private.gateway_intent_json(a)||jsonb_build_object('restaurant_id',o.restaurant_id)
  from public.payment_attempts a join public.orders o on o.id=a.order_id
  where a.id=p_attempt_id and a.provider='mercadopago';
$$;

create function public.get_gateway_payment_intent(p_order_id uuid,p_guest_access_token text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a public.payment_attempts%rowtype;
begin
  perform private.require_payment_actor(p_order_id,p_guest_access_token);
  select * into a from public.payment_attempts where order_id=p_order_id order by created_at desc limit 1;
  if a.provider is distinct from 'mercadopago' then return null; end if;
  return private.gateway_intent_json(a);
end;
$$;

-- Abre un intento local de forma atómica con el pedido; no llama a servicios externos.
create function private.create_gateway_intent(p_order_id uuid,p_method text,p_guest_access_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare o public.orders%rowtype; a public.payment_attempts%rowtype; c private.payment_gateway_configs%rowtype;
begin
  perform private.require_payment_actor(p_order_id,p_guest_access_token);
  if p_method not in ('yape','card') then raise exception 'unsupported gateway method'; end if;
  select * into o from public.orders where id=p_order_id for update;
  if o.payment_method::text<>p_method or o.status not in ('pending_payment','confirmed') then
    raise exception 'order is not eligible for gateway payment'; end if;
  select * into a from public.payment_attempts where order_id=p_order_id order by created_at desc limit 1 for update;
  if a.status='authorized' then return private.gateway_intent_json(a); end if;
  select * into c from private.payment_gateway_configs where restaurant_id=o.restaurant_id order by version desc limit 1;
  if c.version is null or c.verified_at is null or (not c.enabled and c.environment='live')
    or (c.environment='test' and not private.is_platform_admin()) then
    raise exception 'official gateway is not available'; end if;
  if a.id is not null and a.status='pending' then
    if a.provider<>'mercadopago' then raise exception 'another payment is already pending'; end if;
    if a.gateway_state in ('late_review','amount_mismatch','identity_mismatch','partial_refund','disputed') then
      raise exception 'a received payment needs reconciliation before another checkout'; end if;
    if a.expires_at>now() then return private.gateway_intent_json(a); end if;
    update public.payment_attempts set status='failed',gateway_state='expired',failure_code='expired',updated_at=now() where id=a.id;
  end if;
  if exists(select 1 from private.gateway_transactions t join public.payment_attempts pa on pa.id=t.attempt_id
    where pa.order_id=o.id and t.state in ('approved','late_review','amount_mismatch','partial_refund','disputed')) then
    raise exception 'a received payment needs reconciliation before another checkout'; end if;
  insert into public.payment_attempts(order_id,provider,method,amount,idempotency_key,
    gateway_config_version,gateway_environment,gateway_state)
    values(o.id,c.provider,p_method::public.payment_method,o.total,'gateway:'||gen_random_uuid()::text,
      c.version,c.environment,'created') returning * into a;
  return private.gateway_intent_json(a);
end;
$$;

create function public.prepare_gateway_payment(p_order_id uuid,p_method text,p_guest_access_token text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare j jsonb; a public.payment_attempts%rowtype; v_claim text; v_restaurant uuid;
begin
  j := private.create_gateway_intent(p_order_id,p_method,p_guest_access_token);
  select * into a from public.payment_attempts where id=(j->>'attempt_id')::uuid for update;
  select restaurant_id into v_restaurant from public.orders where id=p_order_id;
  if a.checkout_url is not null or a.status='authorized' then
    return j||jsonb_build_object('restaurant_id',v_restaurant,'claim_token',null); end if;
  if exists(select 1 from private.gateway_creation_claims where attempt_id=a.id and expires_at>now()) then
    raise exception 'checkout creation in progress; retry shortly'; end if;
  v_claim := encode(extensions.gen_random_bytes(32),'hex');
  insert into private.gateway_creation_claims(attempt_id,token,expires_at) values(a.id,v_claim,now()+interval '60 seconds')
    on conflict(attempt_id) do update set token=excluded.token,expires_at=excluded.expires_at;
  return j||jsonb_build_object('restaurant_id',v_restaurant,'claim_token',v_claim);
end;
$$;

create function public.bind_gateway_checkout(p_attempt_id uuid,p_claim_token text,p_provider_reference text,p_checkout_url text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a public.payment_attempts%rowtype;
begin
  select * into a from public.payment_attempts where id=p_attempt_id for update;
  if not found or a.provider<>'mercadopago' then raise exception 'gateway attempt not found'; end if;
  if a.provider_reference=p_provider_reference and a.checkout_url=p_checkout_url then return private.gateway_intent_json(a); end if;
  if a.status<>'pending' or a.expires_at<=now() or a.checkout_url is not null then raise exception 'attempt is not bindable'; end if;
  if not exists(select 1 from private.gateway_creation_claims where attempt_id=a.id and token=p_claim_token and expires_at>now()) then
    raise exception 'invalid creation claim'; end if;
  if p_checkout_url is null or p_provider_reference is null or length(p_provider_reference) not between 1 and 200
    or p_checkout_url !~ '^https://([a-z0-9-]+\.)?mercadopago\.(com\.pe|com)/' then
    raise exception 'invalid provider checkout'; end if;
  update public.payment_attempts set provider_reference=p_provider_reference,checkout_url=p_checkout_url,gateway_state='pending',updated_at=now()
    where id=a.id returning * into a;
  delete from private.gateway_creation_claims where attempt_id=a.id;
  return private.gateway_intent_json(a);
end;
$$;

create function public.apply_gateway_payment(
  p_provider text,p_event_id text,p_attempt_id uuid,p_transaction_id text,p_amount_cents bigint,
  p_currency text,p_state text,p_paid_at timestamptz,p_metadata jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare a public.payment_attempts%rowtype; o public.orders%rowtype; c private.payment_gateway_configs%rowtype;
  t private.gateway_transactions%rowtype; v_outcome text; v_status public.payment_status;
  v_updated timestamptz; v_mutate_attempt boolean := true;
begin
  if p_provider is null or p_provider<>'mercadopago' or p_event_id is null or length(p_event_id) not between 1 and 240
    or p_transaction_id is null or length(p_transaction_id) not between 1 and 200
    or p_amount_cents is null or p_amount_cents<=0 or p_currency is null or p_metadata is null
    or p_state is null or p_state not in ('approved','pending','rejected','cancelled','refunded','partial_refund','disputed') then
    raise exception 'invalid verified payment event'; end if;
  v_updated := nullif(p_metadata->>'provider_updated_at','')::timestamptz;
  if v_updated is null or not isfinite(v_updated) or v_updated>now()+interval '5 minutes' then
    raise exception 'valid provider timestamp is required'; end if;
  -- Orden de locks uniforme: pedido, intento, transacción.
  select o1.* into o from public.orders o1 join public.payment_attempts pa on pa.order_id=o1.id
    where pa.id=p_attempt_id for update of o1;
  select * into a from public.payment_attempts where id=p_attempt_id for update;
  if a.id is null or a.provider<>p_provider then raise exception 'attempt does not belong to provider'; end if;
  select * into c from private.payment_gateway_configs where restaurant_id=o.restaurant_id and version=a.gateway_config_version;
  if exists(select 1 from private.gateway_events where provider=p_provider and event_id=p_event_id) then
    return jsonb_build_object('outcome','duplicate','status',a.status); end if;
  v_outcome := p_state;
  if c.version is null or p_metadata->>'collector_id' is distinct from c.collector_id
    or p_metadata->>'external_reference' is distinct from a.id::text
    or p_metadata->>'order_id' is distinct from o.id::text
    or p_metadata->>'config_version' is distinct from a.gateway_config_version::text
    or p_metadata->>'live_mode' is distinct from (a.gateway_environment='live')::text then
    v_outcome := 'identity_mismatch'; v_mutate_attempt := false;
  elsif p_currency<>'PEN' or p_amount_cents<>a.amount_cents then
    v_outcome := 'amount_mismatch';
  end if;
  if v_outcome<>'identity_mismatch' then
    insert into private.gateway_transactions(provider,transaction_id,attempt_id,amount_cents,currency,state,paid_at)
      values(p_provider,p_transaction_id,a.id,p_amount_cents,p_currency,v_outcome,p_paid_at)
      on conflict(provider,transaction_id) do nothing;
    select * into t from private.gateway_transactions where provider=p_provider and transaction_id=p_transaction_id for update;
    if t.attempt_id<>a.id then v_outcome := 'transaction_reuse'; v_mutate_attempt:=false;
    elsif t.provider_updated_at is not null and t.provider_updated_at>=v_updated then
      v_outcome := 'stale_event'; v_mutate_attempt:=false;
    end if;
  end if;
  if v_outcome='approved' then
    if a.authorized_transaction_id is not null then
      if a.authorized_transaction_id=p_transaction_id then
        v_outcome := case when a.status='refunded' then 'ignored_after_final' else 'duplicate' end;
      else v_outcome := 'late_review'; end if;
      v_mutate_attempt := false;
    elsif a.gateway_environment='test' then v_outcome:='test_confirmed';
    elsif a.status<>'pending' or a.expires_at<=now() or p_paid_at is null
      or p_paid_at>now()+interval '2 minutes' or p_paid_at>a.expires_at or p_paid_at<a.created_at-interval '2 minutes'
      or o.status<>'pending_payment' or not c.production_permissions_confirmed
      or c.verified_at is null or c.webhook_verified_at is null then v_outcome:='late_review';
    end if;
  end if;
  if a.status in ('authorized','refunded') then
    if v_outcome in ('pending','rejected','cancelled','amount_mismatch','test_confirmed') then
      v_mutate_attempt:=false;
    elsif v_outcome in ('refunded','partial_refund','disputed')
      and a.authorized_transaction_id is distinct from p_transaction_id then
      v_mutate_attempt:=false;
    end if;
  end if;
  -- Una transacción devuelta o disputada nunca vuelve a aprobarse por un evento antiguo.
  if (t.state in ('refunded','partial_refund','disputed') and v_outcome in ('approved','pending','rejected','cancelled'))
    or (t.state='approved' and a.authorized_transaction_id=p_transaction_id
      and v_outcome in ('pending','rejected','cancelled','amount_mismatch')) then
    v_outcome:='ignored_after_final'; v_mutate_attempt:=false;
  end if;
  insert into private.gateway_events(provider,event_id,attempt_id,transaction_id,outcome)
    values(p_provider,p_event_id,a.id,p_transaction_id,v_outcome);
  if v_outcome not in ('transaction_reuse','identity_mismatch','stale_event','duplicate','ignored_after_final') then
    update private.gateway_transactions set state=v_outcome,provider_updated_at=v_updated,updated_at=now()
      where provider=p_provider and transaction_id=p_transaction_id and attempt_id=a.id;
  end if;
  if not v_mutate_attempt then return jsonb_build_object('outcome',v_outcome,'status',a.status); end if;
  v_status := case when v_outcome='approved' then 'authorized'::public.payment_status
    when v_outcome in ('refunded','partial_refund','disputed') then 'refunded'::public.payment_status
    when v_outcome in ('rejected','cancelled') and a.status='pending' then 'failed'::public.payment_status else a.status end;
  update public.payment_attempts set status=v_status,gateway_state=v_outcome,
    authorized_transaction_id=case when v_outcome in ('approved','refunded','partial_refund','disputed') then p_transaction_id else authorized_transaction_id end,
    failure_code=case when v_outcome in ('approved','pending','test_confirmed','refunded') then null else v_outcome end,
    updated_at=now(),last_reconciled_at=now() where id=a.id;
  -- El trigger existente confirma el pedido y crea order_events en ESTA transacción.
  -- Nunca llama transition_order ni acepta el pedido en nombre del restaurante.
  return jsonb_build_object('outcome',v_outcome,'status',v_status);
end;
$$;

create function public.mark_gateway_webhook_verified(p_restaurant_id uuid,p_version integer)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update private.payment_gateway_configs set webhook_verified_at=coalesce(webhook_verified_at,now())
    where restaurant_id=p_restaurant_id and version=p_version;
  return found;
end;
$$;
revoke all on function public.mark_gateway_webhook_verified(uuid,integer) from public,anon,authenticated;
grant execute on function public.mark_gateway_webhook_verified(uuid,integer) to service_role;

create function public.list_gateway_payments(p_restaurant_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_payments jsonb; v_events jsonb;
begin
  perform public.require_gateway_admin(p_restaurant_id);
  select coalesce(jsonb_agg(j),'[]'::jsonb) into v_payments from (
    select private.gateway_intent_json(a)||jsonb_build_object('id',a.id,'failure_code',a.failure_code,'updated_at',a.updated_at) j
    from public.payment_attempts a join public.orders o on o.id=a.order_id
    where o.restaurant_id=p_restaurant_id and a.provider='mercadopago' order by a.created_at desc limit 100
  ) s;
  select coalesce(jsonb_agg(j),'[]'::jsonb) into v_events from (
    select to_jsonb(e) j from private.gateway_events e join public.payment_attempts a on a.id=e.attempt_id
    join public.orders o on o.id=a.order_id where o.restaurant_id=p_restaurant_id order by e.id desc limit 100
  ) s;
  return jsonb_build_object('payments',v_payments,'events',v_events);
end;
$$;

create function public.list_gateway_reconciliation_batch() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_result jsonb;
begin
  with picked as (
    select a.id from public.payment_attempts a where a.provider='mercadopago'
      and a.provider_reference is not null and a.created_at>now()-interval '7 days'
      and a.status in ('pending','failed','authorized')
      and (a.last_reconciled_at is null or a.last_reconciled_at<now()-interval '5 minutes')
    order by a.last_reconciled_at nulls first,a.created_at limit 20 for update skip locked
  ), marked as (
    update public.payment_attempts a set last_reconciled_at=now(),
      gateway_state=case when a.status='pending' and a.expires_at<=now() then 'expired' else a.gateway_state end,
      status=case when a.status='pending' and a.expires_at<=now() then 'failed'::public.payment_status else a.status end
    from picked where a.id=picked.id returning a.*
  ) select coalesce(jsonb_agg(private.gateway_intent_json(m)||jsonb_build_object('restaurant_id',o.restaurant_id)),'[]'::jsonb)
    into v_result from marked m join public.orders o on o.id=m.order_id;
  return v_result;
end;
$$;

-- Privilegios explícitos; los RPC de dinero no están disponibles en el navegador.
revoke all on function private.gateway_intent_json(public.payment_attempts) from public,anon,authenticated;
revoke all on function private.create_gateway_intent(uuid,text,text) from public,anon,authenticated;
revoke all on function public.require_gateway_admin(uuid) from public,anon;
grant execute on function public.require_gateway_admin(uuid) to authenticated;
revoke all on function public.gateway_config_public(uuid) from public;
grant execute on function public.gateway_config_public(uuid) to anon,authenticated;
revoke all on function public.get_gateway_config_secret(uuid,integer) from public,anon,authenticated;
grant execute on function public.get_gateway_config_secret(uuid,integer) to service_role;
revoke all on function public.save_gateway_config(uuid,text,text,text,boolean,boolean,boolean,integer) from public,anon,authenticated;
grant execute on function public.save_gateway_config(uuid,text,text,text,boolean,boolean,boolean,integer) to service_role;
revoke all on function public.get_gateway_attempt(uuid) from public,anon,authenticated;
grant execute on function public.get_gateway_attempt(uuid) to service_role;
revoke all on function public.get_gateway_payment_intent(uuid,text) from public;
grant execute on function public.get_gateway_payment_intent(uuid,text) to anon,authenticated;
revoke all on function public.prepare_gateway_payment(uuid,text,text) from public;
grant execute on function public.prepare_gateway_payment(uuid,text,text) to anon,authenticated;
revoke all on function public.bind_gateway_checkout(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.bind_gateway_checkout(uuid,text,text,text) to service_role;
revoke all on function public.apply_gateway_payment(text,text,uuid,text,bigint,text,text,timestamptz,jsonb) from public,anon,authenticated;
grant execute on function public.apply_gateway_payment(text,text,uuid,text,bigint,text,text,timestamptz,jsonb) to service_role;
revoke all on function public.list_gateway_payments(uuid) from public,anon;
grant execute on function public.list_gateway_payments(uuid) to authenticated;
revoke all on function public.list_gateway_reconciliation_batch() from public,anon,authenticated;
grant execute on function public.list_gateway_reconciliation_batch() to service_role;

-- Contratos de creación atómica: entrega, carta pública y mesa.
create or replace function public.create_delivery_order_with_gateway_payment(
  p_restaurant_id uuid, p_items jsonb, p_customer_phone text, p_delivery_address text,
  p_delivery_reference text, p_request_id uuid, p_method text, p_offer_code text default null,
  p_delivery_latitude double precision default null, p_delivery_longitude double precision default null
)
returns table (order_id uuid, delivery_code text, cancel_code text)
language plpgsql security definer set search_path = '' as $$
declare result record; intent jsonb;
begin
  if lower(trim(coalesce(p_method, ''))) not in ('card', 'yape') then
    raise exception 'Gateway only supports card or Yape';
  end if;
  select * into result from private.create_order_internal_v2(
    p_restaurant_id, p_items, null, p_customer_phone, p_delivery_address, p_delivery_reference,
    p_request_id, false, 'delivery', null, null, p_method, p_offer_code,
    p_delivery_latitude, p_delivery_longitude, null
  );
  perform private.apply_app_offer(result.order_id, p_offer_code);
  select private.create_gateway_intent(result.order_id, p_method, null) into intent;
  return query select result.order_id, result.delivery_code, result.cancel_code;
end;
$$;

create or replace function public.create_menu_order_with_gateway_payment(
  p_restaurant_id uuid, p_items jsonb, p_customer_name text, p_customer_phone text,
  p_delivery_address text, p_delivery_reference text, p_request_id uuid, p_method text,
  p_offer_code text default null, p_delivery_latitude double precision default null,
  p_delivery_longitude double precision default null, p_guest_access_token text default null
)
returns table (order_id uuid, delivery_code text, cancel_code text, guest_access_token text)
language plpgsql security definer set search_path = '' as $$
declare result record; intent jsonb;
begin
  if lower(trim(coalesce(p_method, ''))) not in ('card', 'yape') then
    raise exception 'Gateway only supports card or Yape';
  end if;
  if not exists (
    select 1 from public.restaurant_menu_settings m
    join public.restaurants r on r.id = m.restaurant_id
    where m.restaurant_id = p_restaurant_id and m.published and r.active
  ) then raise exception 'menu is unavailable'; end if;
  select * into result from private.create_order_internal_v2(
    p_restaurant_id, p_items, p_customer_name, p_customer_phone, p_delivery_address,
    p_delivery_reference, p_request_id, true, 'menu', null, null, p_method, p_offer_code,
    p_delivery_latitude, p_delivery_longitude, p_guest_access_token
  );
  perform private.apply_app_offer(result.order_id, p_offer_code);
  select private.create_gateway_intent(
    result.order_id, p_method, result.guest_access_token
  ) into intent;
  return query select result.order_id, result.delivery_code, result.cancel_code, result.guest_access_token;
end;
$$;

create or replace function public.create_table_order_with_gateway_payment(
  p_restaurant_id uuid, p_items jsonb, p_customer_name text, p_customer_phone text,
  p_delivery_address text, p_delivery_reference text, p_request_id uuid, p_table_id uuid,
  p_table_session_id uuid, p_method text, p_offer_code text default null,
  p_guest_access_token text default null
)
returns table (order_id uuid, delivery_code text, cancel_code text, guest_access_token text)
language plpgsql security definer set search_path = '' as $$
declare v_session uuid; result record; intent jsonb;
begin
  if p_table_id is null then raise exception 'table is required'; end if;
  if lower(trim(coalesce(p_method, ''))) not in ('card', 'yape') then
    raise exception 'Gateway only supports card or Yape';
  end if;
  select s.id into v_session from public.table_sessions s
  join public.restaurant_tables t on t.id = s.table_id
  where s.table_id = p_table_id and s.restaurant_id = p_restaurant_id and t.active
    and s.status in ('open', 'payment_pending')
    and (p_table_session_id is null or s.id = p_table_session_id)
  order by s.opened_at desc limit 1;
  if v_session is null then raise exception 'active table session is required'; end if;
  select * into result from private.create_order_internal_v2(
    p_restaurant_id, p_items, p_customer_name, p_customer_phone, p_delivery_address,
    p_delivery_reference, p_request_id, true, 'table_qr', p_table_id, v_session, p_method,
    p_offer_code, null, null, p_guest_access_token
  );
  perform private.apply_app_offer(result.order_id, p_offer_code);
  select private.create_gateway_intent(
    result.order_id, p_method, result.guest_access_token
  ) into intent;
  return query select result.order_id, result.delivery_code, result.cancel_code, result.guest_access_token;
end;
$$;

revoke all on function public.create_delivery_order_with_gateway_payment(
  uuid, jsonb, text, text, text, uuid, text, text, double precision, double precision
) from public, anon;
grant execute on function public.create_delivery_order_with_gateway_payment(
  uuid, jsonb, text, text, text, uuid, text, text, double precision, double precision
) to authenticated;
revoke all on function public.create_menu_order_with_gateway_payment(
  uuid, jsonb, text, text, text, text, uuid, text, text, double precision, double precision, text
) from public;
grant execute on function public.create_menu_order_with_gateway_payment(
  uuid, jsonb, text, text, text, text, uuid, text, text, double precision, double precision, text
) to anon, authenticated;
revoke all on function public.create_table_order_with_gateway_payment(
  uuid, jsonb, text, text, text, text, uuid, uuid, uuid, text, text, text
) from public;
grant execute on function public.create_table_order_with_gateway_payment(
  uuid, jsonb, text, text, text, text, uuid, uuid, uuid, text, text, text
) to anon, authenticated;
