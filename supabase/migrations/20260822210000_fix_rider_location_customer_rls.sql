-- La política anterior resolvía rider_id de forma ambigua dentro del EXISTS.
-- Califica ambas columnas para autorizar solo al rider asignado al pedido del cliente.
drop policy if exists rider_locations_participant_select on public.rider_locations;
create policy rider_locations_participant_select on public.rider_locations for select to authenticated
using (
  public.rider_locations.rider_id = (select auth.uid())
  or private.is_platform_admin()
  or exists (
    select 1 from public.orders o
    where o.id = public.rider_locations.order_id
      and o.customer_id = (select auth.uid())
      and o.rider_id = public.rider_locations.rider_id
      and o.status in ('picked_up', 'on_the_way')
  )
);
