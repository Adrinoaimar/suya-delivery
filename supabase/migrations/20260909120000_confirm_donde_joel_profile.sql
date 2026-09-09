-- Confirmación comercial inicial de Donde Joel.
-- No activa pedidos: falta publicar horarios, tarifas y reglas operativas desde backoffice.
do $$
declare
  target_restaurant_id constant uuid := '23000000-0000-4000-8000-000000000001';
begin
  update public.restaurants
  set address = 'Calle Ciro Alegría 309, El Obrero, Sullana',
      phone = '939 876 935',
      image_url = '/images/stores/donde-joel/cover.png',
      logo_url = '/images/stores/donde-joel/logo.png',
      schedule = jsonb_build_object(
        'status', 'manual',
        'label', 'Horario gestionado desde backoffice'
      ),
      data_note = concat_ws(' ',
        'Carta y precios confirmados por el negocio.',
        'Delivery en Sullana; tarifa configurable desde backoffice.',
        'Modalidades: delivery, recojo y consumo en local sin reserva.',
        'Pagos: efectivo, Yape, Plin, Lemon, tarjeta y otros.',
        'QR compartido configurable desde backoffice; se solicita comprobante y validación manual.',
        'Datos operativos restantes por confirmar.',
        'Pedidos permanecen desactivados hasta aplicar configuración operativa y validación del propietario.'
      )
  where id = target_restaurant_id;

  if not found then
    raise exception 'No existe Donde Joel (%)', target_restaurant_id;
  end if;
end $$;
