-- Permite cancelación explícita del cliente mientras pedido no fue entregado.
-- Código de cancelación sigue siendo obligatorio; función conserva control de ownership y lock.
create or replace function public.cancel_order_with_code(target_order uuid, supplied_code text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  order_row public.orders%rowtype;
  secret_row private.order_secrets%rowtype;
begin
  select * into order_row from public.orders
  where id = target_order and customer_id = (select auth.uid()) for update;
  if not found or order_row.status in ('delivered', 'cancelled') then return false; end if;
  select * into secret_row from private.order_secrets where order_id = target_order for update;
  if secret_row.locked_until is not null and secret_row.locked_until > now() then return false; end if;
  if extensions.crypt(btrim(supplied_code), secret_row.cancel_code_hash) <> secret_row.cancel_code_hash then
    update private.order_secrets set
      cancel_failed_attempts = least(cancel_failed_attempts + 1, 10),
      locked_until = case when cancel_failed_attempts + 1 >= 5 then now() + interval '15 minutes' else locked_until end
    where order_id = target_order;
    return false;
  end if;
  update public.orders set status = 'cancelled', cancelled_at = now(),
    cancellation_reason = 'cancelled_by_customer' where id = target_order;
  return true;
end;
$$;
