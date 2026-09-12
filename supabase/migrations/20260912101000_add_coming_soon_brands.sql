-- Fichas autorizadas de marcas conocidas. Se muestran para anunciar disponibilidad futura,
-- pero no tienen carta ni condiciones operativas y nunca aceptan pedidos en esta fase.
do $$
declare
  category_id uuid;
begin
  select id into category_id from public.categories where slug = 'restaurantes' limit 1;
  if category_id is null then raise exception 'Falta categoría restaurantes'; end if;

  insert into public.restaurants (
    id, slug, category_id, name, description, address, delivery_fee, minimum_order,
    eta_min_minutes, eta_max_minutes, schedule, theme, logo_url, gallery, active,
    verified_at, tags, featured, local_business, accepting_orders, data_note, promo_label
  ) values
    ('21000000-0000-4000-8000-000000000010', 'kfc', category_id, 'KFC',
      'KFC estará próximamente en Suya.', 'Ubicación por confirmar', 0, 0, 20, 45,
      '{}'::jsonb, '{}'::jsonb, '/brand/stores/kfc-logo.png', '[]'::jsonb, true, null,
      array['Fast Food'], false, false, false,
      'Ficha de próxima apertura. Carta, horario, delivery y contacto pendientes de alta comercial.', null),
    ('21000000-0000-4000-8000-000000000011', 'inkafarma', category_id, 'Inkafarma',
      'Inkafarma estará próximamente en Suya.', 'Ubicación por confirmar', 0, 0, 20, 45,
      '{}'::jsonb, '{}'::jsonb, '/brand/stores/inkafarma-logo.png', '[]'::jsonb, true, null,
      array['Salud y cuidado'], false, false, false,
      'Ficha de próxima apertura. Catálogo, horario, delivery y contacto pendientes de alta comercial.', null),
    ('21000000-0000-4000-8000-000000000012', 'papa-johns', category_id, 'Papa John''s',
      'Papa John''s estará próximamente en Suya.', 'Ubicación por confirmar', 0, 0, 20, 45,
      '{}'::jsonb, '{}'::jsonb, '/brand/stores/papa-johns-logo.svg', '[]'::jsonb, true, null,
      array['Pizzas'], false, false, false,
      'Ficha de próxima apertura. Carta, horario, delivery y contacto pendientes de alta comercial.', null),
    ('21000000-0000-4000-8000-000000000013', 'tottus', category_id, 'Tottus',
      'Tottus estará próximamente en Suya.', 'Ubicación por confirmar', 0, 0, 20, 45,
      '{}'::jsonb, '{}'::jsonb, '/brand/stores/tottus-logo.svg', '[]'::jsonb, true, null,
      array['Mercado'], false, false, false,
      'Ficha de próxima apertura. Catálogo, horario, delivery y contacto pendientes de alta comercial.', null)
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    description = excluded.description,
    address = excluded.address,
    delivery_fee = excluded.delivery_fee,
    minimum_order = excluded.minimum_order,
    eta_min_minutes = excluded.eta_min_minutes,
    eta_max_minutes = excluded.eta_max_minutes,
    schedule = excluded.schedule,
    theme = excluded.theme,
    logo_url = excluded.logo_url,
    gallery = excluded.gallery,
    active = excluded.active,
    verified_at = null,
    tags = excluded.tags,
    featured = excluded.featured,
    local_business = excluded.local_business,
    accepting_orders = false,
    data_note = excluded.data_note,
    promo_label = excluded.promo_label;
end $$;

