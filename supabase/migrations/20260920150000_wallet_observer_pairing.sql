-- One-time pairing removes manual token handling without making ingestion public.
-- The long-lived device token is still generated server-side and stored only in
-- the Android Keystore after the pairing code is consumed.

create table if not exists public.wallet_observer_pairings (
  id uuid primary key default extensions.gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  receiver_account_id uuid not null references public.restaurant_payment_accounts(id) on delete cascade,
  label text not null check (length(trim(label)) between 1 and 80),
  code_hash text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists wallet_observer_pairings_active_idx
  on public.wallet_observer_pairings (restaurant_id, receiver_account_id, expires_at)
  where consumed_at is null;

alter table public.wallet_observer_pairings enable row level security;
revoke all on public.wallet_observer_pairings from public, anon, authenticated;

create or replace function public.create_wallet_observer_pairing(
  p_restaurant_id uuid,
  p_receiver_account_id uuid,
  p_label text
)
returns table (
  pairing_id uuid,
  pairing_code text,
  expires_at timestamptz,
  restaurant_id uuid,
  receiver_account_id uuid,
  device_label text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text := upper(substr(encode(extensions.gen_random_bytes(8), 'hex'), 1, 8));
  v_label text := nullif(left(regexp_replace(trim(coalesce(p_label, '')), '\s+', ' ', 'g'), 80), '');
  v_pairing_id uuid := extensions.gen_random_uuid();
  v_expires_at timestamptz := now() + interval '10 minutes';
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
  if v_label is null then raise exception 'device label is required'; end if;
  if not exists (
    select 1
    from public.restaurant_payment_accounts account
    where account.id = p_receiver_account_id
      and account.restaurant_id = p_restaurant_id
      and account.active
  ) then
    raise exception 'receiver payment account is invalid';
  end if;

  update public.wallet_observer_pairings
  set consumed_at = now()
  where restaurant_id = p_restaurant_id
    and receiver_account_id = p_receiver_account_id
    and consumed_at is null
    and expires_at > now();

  insert into public.wallet_observer_pairings (
    id, restaurant_id, receiver_account_id, label, code_hash, expires_at, created_by
  ) values (
    v_pairing_id,
    p_restaurant_id,
    p_receiver_account_id,
    v_label,
    extensions.crypt(lower(v_code), extensions.gen_salt('bf')),
    v_expires_at,
    (select auth.uid())
  );

  return query select
    v_pairing_id,
    v_code,
    v_expires_at,
    p_restaurant_id,
    p_receiver_account_id,
    v_label;
end;
$$;

revoke all on function public.create_wallet_observer_pairing(uuid, uuid, text) from public, anon;
grant execute on function public.create_wallet_observer_pairing(uuid, uuid, text) to authenticated;

create or replace function public.complete_wallet_observer_pairing(
  p_pairing_code text,
  p_device_label text default null
)
returns table (
  device_id uuid,
  device_label text,
  device_token text,
  restaurant_id uuid,
  receiver_account_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text := lower(regexp_replace(trim(coalesce(p_pairing_code, '')), '\s+', '', 'g'));
  v_pairing public.wallet_observer_pairings%rowtype;
  v_device_id uuid := extensions.gen_random_uuid();
  v_device_token text := v_device_id::text || '.' || encode(extensions.gen_random_bytes(32), 'hex');
  v_label text;
begin
  if v_code !~ '^[a-f0-9]{8}$' then
    raise exception 'invalid or expired pairing code';
  end if;

  select pairing.* into v_pairing
  from public.wallet_observer_pairings pairing
  where pairing.consumed_at is null
    and pairing.expires_at > now()
    and extensions.crypt(v_code, pairing.code_hash) = pairing.code_hash
  order by pairing.created_at desc
  limit 1
  for update;
  if not found then raise exception 'invalid or expired pairing code'; end if;

  v_label := nullif(left(regexp_replace(trim(coalesce(p_device_label, '')), '\s+', ' ', 'g'), 80), '');
  v_label := coalesce(v_label, v_pairing.label);

  insert into public.wallet_observer_devices (
    id, restaurant_id, receiver_account_id, label, token_hash, token_last4, created_by
  ) values (
    v_device_id,
    v_pairing.restaurant_id,
    v_pairing.receiver_account_id,
    v_label,
    extensions.crypt(v_device_token, extensions.gen_salt('bf')),
    right(v_device_token, 4),
    null
  );

  update public.wallet_observer_pairings
  set consumed_at = now()
  where id = v_pairing.id;

  return query select
    v_device_id,
    v_label,
    v_device_token,
    v_pairing.restaurant_id,
    v_pairing.receiver_account_id;
end;
$$;

revoke all on function public.complete_wallet_observer_pairing(text, text) from public;
grant execute on function public.complete_wallet_observer_pairing(text, text) to anon, authenticated;

comment on function public.create_wallet_observer_pairing(uuid, uuid, text)
  is 'Creates a ten-minute, one-use pairing code for a wallet observer device.';
comment on function public.complete_wallet_observer_pairing(text, text)
  is 'Consumes one pairing code and returns the device credential once to the Android observer.';
