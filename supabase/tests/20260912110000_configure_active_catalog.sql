begin;

select plan(7);

select is(
  (select count(*)::integer from public.restaurants where active and accepting_orders),
  3,
  'solo tres negocios aceptan pedidos'
);

select is(
  (select count(*)::integer from public.restaurants where active and slug in ('anda-paya', 'anda-paya-cevicheria', 'donde-joel') and accepting_orders),
  3,
  'las tres fichas activas son las autorizadas'
);

select is(
  (select count(*)::integer from public.restaurants where active and not accepting_orders),
  6,
  'las demás fichas permanecen visibles como próximas'
);

select is(
  (select image_url from public.restaurants where slug = 'anda-paya'),
  '/images/stores/anda-paya/cover-restaurante-background.png',
  'Andá Paya Restaurante usa portada propia'
);

select is(
  (select logo_url from public.restaurants where slug = 'anda-paya-cevicheria'),
  '/brand/stores/anda-paya-logo.webp',
  'Andá Paya Cevichería usa logo propio'
);

select is(
  (select public_slug from public.restaurant_menu_settings settings join public.restaurants r on r.id = settings.restaurant_id where r.slug = 'anda-paya-cevicheria'),
  'anda-paya-cevicheria-menu',
  'Cevichería tiene carta pública separada'
);

select ok(
  (select count(*) > 0 from public.products p join public.restaurants r on r.id = p.restaurant_id where r.slug = 'anda-paya-cevicheria' and p.active),
  'Cevichería tiene productos marinos publicados'
);

select * from finish();
rollback;
