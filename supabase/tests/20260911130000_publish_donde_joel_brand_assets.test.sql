begin;
select plan(12);

select is(
  (select logo_url from public.restaurants where slug = 'donde-joel'),
  '/images/stores/donde-joel/logo.png',
  'Donde Joel conserva el logo suministrado en la ficha'
);

select is(
  (select settings.logo_url
   from public.restaurant_menu_settings settings
   join public.restaurants restaurant on restaurant.id = settings.restaurant_id
   where restaurant.slug = 'donde-joel'),
  '/images/stores/donde-joel/logo.png',
  'Suya Menús publica el logo suministrado de Donde Joel'
);

select is(
  (select settings.hero_image_url
   from public.restaurant_menu_settings settings
   join public.restaurants restaurant on restaurant.id = settings.restaurant_id
   where restaurant.slug = 'donde-joel'),
  '/images/stores/donde-joel/menus/carta-01.jpg',
  'Suya Menús usa la primera carta de Donde Joel como portada'
);

select is(
  (select published
   from public.restaurant_menu_settings settings
   join public.restaurants restaurant on restaurant.id = settings.restaurant_id
   where restaurant.slug = 'donde-joel'),
  true,
  'el menú público de Donde Joel sigue publicado'
);

select is(
  (select logo_url from public.restaurants where slug = 'la-waka'),
  '/brand/stores/la-waka-logo.webp',
  'La Waka usa el logo local publicado'
);

select is(
  (select settings.logo_url
   from public.restaurant_menu_settings settings
   join public.restaurants restaurant on restaurant.id = settings.restaurant_id
   where restaurant.slug = 'la-waka'),
  '/brand/stores/la-waka-logo.webp',
  'Suya Menús usa el logo local de La Waka'
);

select is(
  (select settings.logo_url
   from public.restaurant_menu_settings settings
   join public.restaurants restaurant on restaurant.id = settings.restaurant_id
   where restaurant.slug = 'tio-jhony'),
  '/brand/stores/tio-jhony-logo.webp',
  'Suya Menús usa el logo de El Tío Jhony'
);

select is(
  (select settings.logo_url
   from public.restaurant_menu_settings settings
   join public.restaurants restaurant on restaurant.id = settings.restaurant_id
   where restaurant.slug = 'anda-paya'),
  '/brand/stores/anda-paya-logo.webp',
  'Suya Menús usa el logo de Andá Paya'
);

select is(
  (select published
   from public.restaurant_menu_settings settings
   join public.restaurants restaurant on restaurant.id = settings.restaurant_id
   where restaurant.slug = 'tio-jhony'),
  true,
  'el menú público de El Tío Jhony sigue publicado'
);

select is(
  (select published
   from public.restaurant_menu_settings settings
   join public.restaurants restaurant on restaurant.id = settings.restaurant_id
   where restaurant.slug = 'anda-paya'),
  true,
  'el menú público de Andá Paya sigue publicado'
);

select is(
  (select count(*)::integer
   from jsonb_array_elements((select gallery from public.restaurants where slug = 'donde-joel'))),
  4,
  'Donde Joel conserva sus cuatro cartas'
);

select is(
  (select count(*)::integer
   from public.restaurants
   where slug in ('tio-jhony', 'la-waka', 'donde-joel', 'anda-paya')
     and logo_url is not null),
  4,
  'los cuatro restaurantes autorizados tienen logo en la ficha'
);

select * from finish();
rollback;
