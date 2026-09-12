-- Publica el activo de marca autorizado de Andá Paya en la ficha y en Suya Menús.
-- El PNG se deriva del encabezado de la carta suministrada por el negocio.
update public.restaurants
set logo_url = '/brand/stores/anda-paya-logo.webp',
    data_note = 'Carta y logotipo entregados por el negocio y autorizados para publicación. Precios y datos operativos quedan sujetos a conciliación comercial.'
where slug = 'anda-paya';

insert into public.restaurant_menu_settings (
  restaurant_id, public_slug, published, logo_url, hero_image_url,
  primary_color, accent_color, font_family
)
select
  restaurant.id,
  'anda-paya-menu',
  true,
  '/brand/stores/anda-paya-logo.webp',
  '/images/stores/anda-paya/menus/carta-2026-09-06.jpg',
  '#090909',
  '#F20E18',
  'DM Sans'
from public.restaurants restaurant
where restaurant.slug = 'anda-paya'
on conflict (restaurant_id) do update set
  public_slug = excluded.public_slug,
  published = excluded.published,
  logo_url = excluded.logo_url,
  hero_image_url = excluded.hero_image_url,
  primary_color = excluded.primary_color,
  accent_color = excluded.accent_color,
  font_family = excluded.font_family;
