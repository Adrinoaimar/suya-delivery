-- Reemplaza el SVG recreado de La Waka por el activo oficial optimizado.
-- La migración anterior se conserva para no reescribir el historial aplicado.
update public.restaurants
set logo_url = '/brand/stores/la-waka-logo.webp', updated_at = now()
where slug = 'la-waka';

update public.restaurant_menu_settings
set logo_url = '/brand/stores/la-waka-logo.webp', updated_at = now()
where public_slug = 'la-waka-menu';
