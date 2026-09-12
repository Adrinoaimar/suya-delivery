-- Ajustes posteriores a la primera publicación: conserva la carta original y limpia
-- la advertencia histórica de Donde Joel ahora que la ficha está habilitada.
update public.restaurants
set gallery = jsonb_build_array(
      jsonb_build_object('src', '/images/stores/anda-paya/cover-restaurante-background.png', 'caption', 'Andá Paya Restaurante'),
      jsonb_build_object('src', '/images/stores/anda-paya/menus/carta-2026-09-06.jpg', 'caption', 'Carta recibida el 06/09/2026')
    ),
    image_url = '/images/stores/anda-paya/cover-restaurante-background.png',
    logo_url = '/brand/stores/anda-paya-logo.webp',
    featured = true,
    local_business = true,
    accepting_orders = true,
    updated_at = now()
where slug = 'anda-paya';

update public.restaurant_menu_settings settings
set logo_url = '/brand/stores/anda-paya-logo.webp',
    hero_image_url = '/images/stores/anda-paya/cover-restaurante-background.png',
    published = true,
    updated_at = now()
from public.restaurants restaurant
where restaurant.id = settings.restaurant_id
  and restaurant.slug = 'anda-paya';

update public.restaurants
set active = true,
    accepting_orders = true,
    featured = true,
    local_business = true,
    data_note = null,
    updated_at = now()
where slug = 'donde-joel';
