-- Harden private storage and remove direct anonymous execution from RPCs
-- intended for authenticated staff or customers. Supabase function defaults
-- may grant anon directly, so revoking PUBLIC alone is not sufficient.

alter table private.guest_order_rate_limits enable row level security;
alter table private.payment_claim_secrets enable row level security;

revoke all on table private.guest_order_rate_limits
  from public, anon, authenticated;
revoke all on table private.payment_claim_secrets
  from public, anon, authenticated;

revoke all on function private.audit_wallet_observation_insert()
  from public, anon, authenticated;
revoke all on function private.refresh_table_session_totals()
  from public, anon, authenticated;

create or replace function public.get_order_codes(target_order uuid)
returns table (delivery_code text, cancel_code text)
language sql
stable
security definer
set search_path = ''
as $$
  select s.delivery_code, s.cancel_code
  from private.order_secrets s
  join public.orders o on o.id = s.order_id
  where o.id = target_order
    and (select auth.uid()) is not null
    and o.customer_id = (select auth.uid());
$$;

revoke all on function public.get_order_codes(uuid) from public, anon;
grant execute on function public.get_order_codes(uuid) to authenticated;

create or replace function public.confirm_order_delivery(target_order uuid, supplied_code text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  order_row public.orders%rowtype;
  secret_row private.order_secrets%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception 'authentication required';
  end if;

  perform set_config('suya.delivery_verification_mutation', '0', true);
  select * into order_row
  from public.orders
  where id = target_order and rider_id = (select auth.uid())
  for update;
  if not found or order_row.status <> 'on_the_way' then return false; end if;

  select * into secret_row
  from private.order_secrets
  where order_id = target_order
  for update;
  if secret_row.locked_until is not null and secret_row.locked_until > now() then
    return false;
  end if;

  if extensions.crypt(btrim(supplied_code), secret_row.delivery_code_hash)
    <> secret_row.delivery_code_hash then
    update private.order_secrets set
      delivery_failed_attempts = least(delivery_failed_attempts + 1, 10),
      locked_until = case
        when delivery_failed_attempts + 1 >= 5 then now() + interval '15 minutes'
        else locked_until
      end
    where order_id = target_order;
    return false;
  end if;

  perform set_config('suya.delivery_verification_mutation', '1', true);
  update public.orders
  set delivery_verified_at = now(), status = 'delivered'
  where id = target_order;
  perform set_config('suya.delivery_verification_mutation', '0', true);
  return true;
end;
$$;

revoke all on function public.confirm_order_delivery(uuid, text)
  from public, anon;
grant execute on function public.confirm_order_delivery(uuid, text)
  to authenticated;

revoke all on function public.create_restaurant_table(uuid, text)
  from public, anon;
grant execute on function public.create_restaurant_table(uuid, text)
  to authenticated;
revoke all on function public.regenerate_restaurant_table_qr(uuid)
  from public, anon;
grant execute on function public.regenerate_restaurant_table_qr(uuid)
  to authenticated;
revoke all on function public.set_restaurant_table_active(uuid, boolean)
  from public, anon;
grant execute on function public.set_restaurant_table_active(uuid, boolean)
  to authenticated;
revoke all on function public.list_restaurant_tables(uuid[])
  from public, anon;
grant execute on function public.list_restaurant_tables(uuid[])
  to authenticated;

revoke all on function public.list_suya_analytics_daily(integer)
  from public, anon;
grant execute on function public.list_suya_analytics_daily(integer)
  to authenticated;

revoke all on function public.open_table_session(uuid) from public, anon;
grant execute on function public.open_table_session(uuid) to authenticated;
