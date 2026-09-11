-- Publica el logo suministrado de Donde Joel también en Suya Menús.
-- La migración anterior confirmó la ficha, pero dejó el logo del menú nulo.
update public.restaurants
set logo_url = '/images/stores/donde-joel/logo.png',
    image_url = '/images/stores/donde-joel/cover.png',
    updated_at = now()
where slug = 'donde-joel';

update public.restaurant_menu_settings settings
set logo_url = '/images/stores/donde-joel/logo.png',
    hero_image_url = '/images/stores/donde-joel/menus/carta-01.jpg',
    updated_at = now()
from public.restaurants restaurant
where settings.restaurant_id = restaurant.id
  and restaurant.slug = 'donde-joel';
