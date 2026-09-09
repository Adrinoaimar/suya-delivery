-- Registro de onboarding para una cuenta propietaria por restaurante.
-- No crea usuarios en auth.users ni almacena contraseñas, tokens o secretos.
-- La invitación real requiere correo confirmado y una Edge Function con service_role.

create table if not exists public.restaurant_account_registry (
  restaurant_id uuid primary key references public.restaurants(id) on delete cascade,
  account_status text not null default 'pending_contact'
    check (account_status in ('pending_contact', 'ready_to_invite', 'invited', 'active', 'suspended')),
  contact_name text,
  contact_email text,
  owner_user_id uuid references auth.users(id) on delete set null,
  invited_at timestamptz,
  activated_at timestamptz,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (contact_name is null or length(trim(contact_name)) between 2 and 120),
  check (contact_email is null or (
    contact_email = lower(trim(contact_email))
    and contact_email ~ '^[a-z0-9.!#$%&''*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$'
  )),
  check (
    (account_status in ('pending_contact', 'ready_to_invite', 'invited') and owner_user_id is null)
    or (account_status in ('active', 'suspended') and owner_user_id is not null)
  ),
  check (account_status in ('ready_to_invite', 'invited', 'active', 'suspended') = (contact_email is not null)),
  check (account_status in ('active', 'suspended') = (owner_user_id is not null)),
  check (account_status = 'pending_contact' or contact_email is not null),
  check (account_status in ('invited', 'active', 'suspended') or invited_at is null),
  check (account_status in ('active', 'suspended') or activated_at is null)
);

comment on table public.restaurant_account_registry is
  'Un registro administrativo por restaurante. No representa una cuenta Auth activa hasta vincular owner_user_id.';
comment on column public.restaurant_account_registry.account_status is
  'pending_contact: faltan datos del propietario; ready_to_invite: correo confirmado; invited: invitación enviada; active/suspended: usuario vinculado.';
comment on column public.restaurant_account_registry.contact_email is
  'Correo confirmado por el restaurante. Nunca es contraseña ni token de invitación.';

create index if not exists restaurant_account_registry_status_idx
  on public.restaurant_account_registry (account_status);
create unique index if not exists restaurant_account_registry_owner_idx
  on public.restaurant_account_registry (owner_user_id)
  where owner_user_id is not null;

create or replace function private.restaurant_account_registry_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists restaurant_account_registry_updated_at on public.restaurant_account_registry;
create trigger restaurant_account_registry_updated_at
before update on public.restaurant_account_registry
for each row execute function private.restaurant_account_registry_updated_at();

create or replace function private.sync_restaurant_account_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and old.owner_user_id is distinct from new.owner_user_id
     and old.owner_user_id is not null then
    update public.restaurant_members
    set active = false
    where restaurant_id = new.restaurant_id
      and user_id = old.owner_user_id
      and role = 'owner';
  end if;

  if new.owner_user_id is not null then
    insert into public.restaurant_members (restaurant_id, user_id, role, active)
    values (new.restaurant_id, new.owner_user_id, 'owner', true)
    on conflict (restaurant_id, user_id) do update
      set role = 'owner', active = true;
  end if;

  return new;
end;
$$;

revoke all on function private.sync_restaurant_account_owner() from public, anon, authenticated;

create or replace function private.ensure_restaurant_account_registry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.restaurant_account_registry (restaurant_id, account_status, notes)
  values (
    new.id,
    'pending_contact',
    'Falta correo y representante confirmado. No se crea usuario Auth automáticamente.'
  )
  on conflict (restaurant_id) do nothing;
  return new;
end;
$$;

revoke all on function private.ensure_restaurant_account_registry() from public, anon, authenticated;

drop trigger if exists restaurants_account_registry_on_insert on public.restaurants;
create trigger restaurants_account_registry_on_insert
after insert on public.restaurants
for each row execute function private.ensure_restaurant_account_registry();

drop trigger if exists restaurant_account_registry_owner_sync on public.restaurant_account_registry;
create trigger restaurant_account_registry_owner_sync
after insert or update of owner_user_id on public.restaurant_account_registry
for each row execute function private.sync_restaurant_account_owner();

alter table public.restaurant_account_registry enable row level security;
revoke all on public.restaurant_account_registry from anon, authenticated;
grant select, insert, update, delete on public.restaurant_account_registry to authenticated;

drop policy if exists restaurant_account_registry_admin_all on public.restaurant_account_registry;
create policy restaurant_account_registry_admin_all
  on public.restaurant_account_registry
  for all to authenticated
  using (private.is_platform_admin())
  with check (private.is_platform_admin());

-- Cubre cualquier restaurante ya existente; el trigger cubre altas futuras.
insert into public.restaurant_account_registry (restaurant_id, account_status, notes)
select r.id, 'pending_contact',
  'Falta correo y representante confirmado. No se crea usuario Auth automáticamente.'
from public.restaurants r
on conflict (restaurant_id) do nothing;
