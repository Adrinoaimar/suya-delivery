begin;

select plan(4);

select is(
  (select logo_url from public.restaurants where slug = 'anda-paya'),
  '/brand/stores/anda-paya-logo.webp',
  'Andá Paya publica el logo autorizado'
);

select is(
  (select settings.logo_url
   from public.restaurant_menu_settings settings
   join public.restaurants restaurant on restaurant.id = settings.restaurant_id
   where restaurant.slug = 'anda-paya'),
  '/brand/stores/anda-paya-logo.webp',
  'Suya Menús usa el mismo logo autorizado'
);

select ok(
  (select published
   from public.restaurant_menu_settings settings
   join public.restaurants restaurant on restaurant.id = settings.restaurant_id
   where restaurant.slug = 'anda-paya'),
  'la carta de Andá Paya permanece publicada'
);

select is(
  (select count(*)::integer
   from public.restaurants restaurant,
        jsonb_array_elements(restaurant.gallery) item
   where restaurant.slug = 'anda-paya'
     and item->>'src' = '/images/stores/anda-paya/menus/carta-2026-09-06.jpg'),
  1,
  'la carta original permanece en la galería'
);

select * from finish();
rollback;
