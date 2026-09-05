-- Mantiene el menú de La Waka operativo aunque su endpoint de imagen externo no responda.
update public.restaurants
set logo_url = '/brand/stores/la-waka-logo.svg', updated_at = now()
where slug = 'la-waka';

update public.restaurant_menu_settings
set logo_url = '/brand/stores/la-waka-logo.svg', updated_at = now()
where public_slug = 'la-waka-menu';
