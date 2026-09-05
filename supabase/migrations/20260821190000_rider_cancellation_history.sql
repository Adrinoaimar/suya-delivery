-- Permite al repartidor abandonar una asignación antes de recogerla.
-- No permite cancelar pedidos ya recogidos/en ruta ni pedidos ajenos.
create or replace function public.cancel_order_by_rider(target_order uuid, reason text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  order_row public.orders%rowtype;
begin
  if actor_id is null then raise exception 'authentication required'; end if;
  reason := btrim(coalesce(reason, ''));
  if length(reason) not between 3 and 300 then raise exception 'valid cancellation reason required'; end if;
  select * into order_row from public.orders where id = target_order for update;
  if not found or order_row.rider_id is distinct from actor_id then return false; end if;
  if order_row.status not in ('confirmed', 'preparing') then return false; end if;

  update public.orders set status = 'cancelled', cancelled_at = now(),
    cancellation_reason = reason where id = target_order;
  perform private.release_rider_if_idle(actor_id);
  return true;
end;
$$;

revoke all on function public.cancel_order_by_rider(uuid, text) from public, anon, authenticated;
grant execute on function public.cancel_order_by_rider(uuid, text) to authenticated;
