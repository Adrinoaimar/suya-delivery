-- Bloquea las filas de los comercios mientras se retira el medio duplicado de AutoCloud.
do $$
declare
  shop record;
begin
  for shop in
    select id, slug from public.restaurants
    where slug in ('inkafarma', 'tottus') and accepting_orders is false
    order by id for update
  loop
    if exists (
      select 1 from public.orders o join public.payment_attempts pa on pa.order_id = o.id
      where o.restaurant_id = shop.id and pa.provider = 'static_qr'
        and pa.status = 'pending' and pa.expires_at > now()
    ) then
      raise exception 'Hay cobros estáticos vigentes en %.', shop.slug;
    end if;

    update public.payment_gateway_configs set active = false, updated_at = now()
    where restaurant_id = shop.id and provider = 'static_qr'
      and verification_mode = 'automatic_cloud' and active;
  end loop;
end;
$$;
