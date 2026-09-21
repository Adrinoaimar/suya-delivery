select plan(4);

select is(
  (select image_url from public.restaurants where slug = 'donde-joel'),
  '/images/stores/donde-joel/cover.png',
  'Donde Joel usa portada first-party'
);

select is(
  (select logo_url from public.restaurants where slug = 'donde-joel'),
  '/images/stores/donde-joel/logo.png',
  'Donde Joel usa logo first-party'
);

select is(
  (select settings.logo_url from public.restaurant_menu_settings settings
   join public.restaurants restaurant on restaurant.id = settings.restaurant_id
   where restaurant.slug = 'donde-joel'),
  '/images/stores/donde-joel/logo.png',
  'El menú público usa logo first-party'
);

select ok(
  not exists (
    select 1
    from public.restaurants
    where slug = 'donde-joel'
      and (
        image_url like 'https://raw.githubusercontent.com/%'
        or logo_url like 'https://raw.githubusercontent.com/%'
        or gallery::text like '%raw.githubusercontent.com%'
      )
  ),
  'Donde Joel no conserva URLs raw de GitHub'
);

select * from finish();
