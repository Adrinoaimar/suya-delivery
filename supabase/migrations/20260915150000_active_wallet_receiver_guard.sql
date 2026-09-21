-- Una cuenta receptora desactivada no puede recibir nuevos bindings ni
-- observaciones. Las filas históricas se conservan para auditoría.

create or replace function private.require_active_wallet_receiver()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.receiver_account_id is null then
    return new;
  end if;

  if not exists (
    select 1
    from public.restaurant_payment_accounts account
    where account.id = new.receiver_account_id
      and account.restaurant_id = new.restaurant_id
      and account.active
  ) then
    raise exception 'receiver payment account is inactive';
  end if;

  return new;
end;
$$;

drop trigger if exists wallet_observer_devices_active_receiver_guard
  on public.wallet_observer_devices;
create trigger wallet_observer_devices_active_receiver_guard
  before insert or update of receiver_account_id, restaurant_id
  on public.wallet_observer_devices
  for each row execute function private.require_active_wallet_receiver();

drop trigger if exists wallet_observations_active_receiver_guard
  on public.wallet_observations;
create trigger wallet_observations_active_receiver_guard
  before insert or update of receiver_account_id, restaurant_id
  on public.wallet_observations
  for each row execute function private.require_active_wallet_receiver();

revoke all on function private.require_active_wallet_receiver() from public, anon, authenticated;

comment on function private.require_active_wallet_receiver() is
  'Impide nuevas observaciones y bindings hacia cuentas receptoras inactivas; conserva el histórico.';
