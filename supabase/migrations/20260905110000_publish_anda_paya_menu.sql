-- Publish the verified restaurant already present in production; no demo data is created.
update public.restaurant_menu_settings settings
set published = true,
    public_slug = 'anda-paya-menu'
from public.restaurants restaurant
where restaurant.id = settings.restaurant_id
  and restaurant.slug = 'anda-paya'
  and restaurant.active;
