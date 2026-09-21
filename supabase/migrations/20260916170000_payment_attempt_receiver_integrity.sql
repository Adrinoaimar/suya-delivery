-- P-03/P-11: enforce the receiver/order restaurant binding at the table boundary.
-- RPCs validate the relationship for normal flows; this trigger also protects
-- future server-side writers and preserves historical rows when an account is
-- later disabled.

create or replace function private.require_payment_attempt_receiver()
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
    join public.orders order_row on order_row.id = new.order_id
    where account.id = new.receiver_account_id
      and account.restaurant_id = order_row.restaurant_id
      and account.active
  ) then
    raise exception 'receiver payment account is not active for the order restaurant';
  end if;

  return new;
end;
$$;

drop trigger if exists payment_attempts_receiver_integrity_guard
  on public.payment_attempts;
create trigger payment_attempts_receiver_integrity_guard
  before insert or update of receiver_account_id, order_id
  on public.payment_attempts
  for each row execute function private.require_payment_attempt_receiver();

revoke all on function private.require_payment_attempt_receiver() from public, anon, authenticated;

comment on function private.require_payment_attempt_receiver() is
  'Impide que un intento de pago use una cuenta receptora activa de otro restaurante.';
