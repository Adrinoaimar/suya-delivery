-- Wallet notification evidence is separate from payment_attempts.
-- A notification is not proof of payment and must never release an order by itself.

create table public.wallet_observer_devices (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  label text not null check (length(trim(label)) between 1 and 80),
  token_hash text not null unique,
  token_last4 text not null check (token_last4 ~ '^[a-f0-9]{4}$'),
  active boolean not null default true,
  last_seen_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.wallet_observations (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.wallet_observer_devices(id) on delete restrict,
  restaurant_id uuid not null references public.restaurants(id) on delete restrict,
  event_id text not null check (length(trim(event_id)) between 1 and 160),
  provider text not null check (provider in ('yape', 'lemon', 'plin', 'mercado_pago', 'generic')),
  sender_name text check (sender_name is null or length(trim(sender_name)) between 1 and 120),
  code_digest text,
  code_last4 text check (code_last4 is null or length(code_last4) between 1 and 4),
  amount_cents bigint not null check (amount_cents > 0 and amount_cents <= 100000000),
  currency text not null default 'PEN' check (currency in ('PEN', 'ARS', 'USD')),
  verification_status text not null default 'unverified'
    check (verification_status in ('unverified', 'under_review', 'verified', 'rejected')),
  observed_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (device_id, event_id)
);

create index wallet_observations_restaurant_observed_idx
  on public.wallet_observations (restaurant_id, observed_at desc);

alter table public.wallet_observer_devices enable row level security;
alter table public.wallet_observations enable row level security;

revoke all on public.wallet_observer_devices from public, anon, authenticated;
revoke all on public.wallet_observations from public, anon;
grant select on public.wallet_observations to authenticated;

create policy wallet_observations_owner_select
  on public.wallet_observations
  for select to authenticated
  using (
    private.is_platform_admin()
    or private.has_restaurant_role(
      restaurant_id,
      array['owner', 'manager']::public.restaurant_role[]
    )
  );

create or replace function private.audit_wallet_observation_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.audit_log (actor_id, table_name, row_id, action, old_data, new_data)
  values (
    null,
    'wallet_observations',
    new.id::text,
    'INSERT',
    null,
    jsonb_build_object(
      'restaurant_id', new.restaurant_id,
      'provider', new.provider,
      'amount_cents', new.amount_cents,
      'currency', new.currency,
      'verification_status', new.verification_status,
      'observed_at', new.observed_at
    )
  );
  return new;
end;
$$;

create trigger wallet_observations_audit
  after insert on public.wallet_observations
  for each row execute function private.audit_wallet_observation_insert();

create or replace function public.create_wallet_observer_device(
  p_restaurant_id uuid,
  p_label text
)
returns table (
  device_id uuid,
  device_label text,
  device_token text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text;
  v_id uuid;
  v_label text;
begin
  if not (
    private.is_platform_admin()
    or private.has_restaurant_role(
      p_restaurant_id,
      array['owner', 'manager']::public.restaurant_role[]
    )
  ) then
    raise exception 'not authorized';
  end if;

  v_label := nullif(left(regexp_replace(trim(coalesce(p_label, '')), '\s+', ' ', 'g'), 80), '');
  if v_label is null then
    raise exception 'device label is required';
  end if;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.wallet_observer_devices (
    restaurant_id, label, token_hash, token_last4, created_by
  )
  values (
    p_restaurant_id,
    v_label,
    extensions.crypt(v_token, extensions.gen_salt('bf')),
    right(v_token, 4),
    auth.uid()
  )
  returning id into v_id;

  return query select v_id, v_label, v_token;
end;
$$;

revoke execute on function public.create_wallet_observer_device(uuid, text)
  from public, anon;
grant execute on function public.create_wallet_observer_device(uuid, text)
  to authenticated;

create or replace function public.list_wallet_observer_devices(p_restaurant_id uuid)
returns table (
  device_id uuid,
  device_label text,
  device_active boolean,
  token_last4 text,
  last_seen_at timestamptz,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (
    private.is_platform_admin()
    or private.has_restaurant_role(
      p_restaurant_id,
      array['owner', 'manager']::public.restaurant_role[]
    )
  ) then
    raise exception 'not authorized';
  end if;

  return query
  select d.id, d.label, d.active, d.token_last4, d.last_seen_at, d.created_at
  from public.wallet_observer_devices d
  where d.restaurant_id = p_restaurant_id
  order by d.created_at desc;
end;
$$;

revoke execute on function public.list_wallet_observer_devices(uuid)
  from public, anon;
grant execute on function public.list_wallet_observer_devices(uuid)
  to authenticated;

create or replace function public.ingest_wallet_observation(
  p_device_token text,
  p_event_id text,
  p_provider text,
  p_sender_name text,
  p_code text,
  p_amount_cents bigint,
  p_currency text,
  p_observed_at timestamptz
)
returns table (
  observation_id uuid,
  was_inserted boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_device public.wallet_observer_devices%rowtype;
  v_event_id text := nullif(left(trim(coalesce(p_event_id, '')), 160), '');
  v_provider text := lower(trim(coalesce(p_provider, '')));
  v_currency text := upper(trim(coalesce(p_currency, 'PEN')));
  v_name text := nullif(left(regexp_replace(trim(coalesce(p_sender_name, '')), '\s+', ' ', 'g'), 120), '');
  v_code text := nullif(left(trim(coalesce(p_code, '')), 160), '');
  v_observation_id uuid;
begin
  if length(trim(coalesce(p_device_token, ''))) < 48 then
    raise exception 'invalid device token';
  end if;
  if v_event_id is null or v_provider not in ('yape', 'lemon', 'plin', 'mercado_pago', 'generic') then
    raise exception 'invalid wallet observation';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 or p_amount_cents > 100000000 then
    raise exception 'invalid amount';
  end if;
  if v_currency not in ('PEN', 'ARS', 'USD') then
    raise exception 'unsupported currency';
  end if;
  if p_observed_at is null
     or p_observed_at < now() - interval '7 days'
     or p_observed_at > now() + interval '5 minutes' then
    raise exception 'invalid observed_at';
  end if;

  select d.* into v_device
  from public.wallet_observer_devices d
  where d.active
    and extensions.crypt(trim(p_device_token), d.token_hash) = d.token_hash
  limit 1;

  if not found then
    raise exception 'invalid device token';
  end if;

  insert into public.wallet_observations (
    device_id, restaurant_id, event_id, provider, sender_name,
    code_digest, code_last4, amount_cents, currency, verification_status, observed_at
  )
  values (
    v_device.id,
    v_device.restaurant_id,
    v_event_id,
    v_provider,
    v_name,
    case when v_code is null then null else extensions.crypt(v_code, extensions.gen_salt('bf')) end,
    case when v_code is null then null else right(v_code, 4) end,
    p_amount_cents,
    v_currency,
    'unverified',
    p_observed_at
  )
  on conflict (device_id, event_id) do nothing
  returning id into v_observation_id;

  update public.wallet_observer_devices
  set last_seen_at = greatest(coalesce(last_seen_at, p_observed_at), p_observed_at)
  where id = v_device.id;

  if v_observation_id is null then
    select o.id into v_observation_id
    from public.wallet_observations o
    where o.device_id = v_device.id and o.event_id = v_event_id;
    return query select v_observation_id, false;
  else
    return query select v_observation_id, true;
  end if;
end;
$$;

revoke execute on function public.ingest_wallet_observation(text, text, text, text, text, bigint, text, timestamptz)
  from public;
grant execute on function public.ingest_wallet_observation(text, text, text, text, text, bigint, text, timestamptz)
  to anon, authenticated;
