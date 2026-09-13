begin;

select plan(9);

select is(
  (select count(*)::integer from public.restaurants
   where slug in ('anda-paya', 'anda-paya-cevicheria')
     and delivery_fee = 0
     and promo_label = 'Delivery gratis por lanzamiento'),
  2,
  'ambas fichas Andá Paya publican delivery gratis'
);

select is(
  (select promo_label from public.restaurants where slug = 'donde-joel'),
  'Primer cuarto S/ 20 + segundo a S/ 1',
  'Donde Joel publica la mecánica autorizada'
);

select is(
  (select price from public.products
   where id = '24000000-0000-4000-8000-000000000001'),
  21.00::numeric,
  'el combo cobra exactamente S/ 21'
);

select is(
  (select price from public.products
   where restaurant_id = '23000000-0000-4000-8000-000000000001'
     and name = '1/4 de pollo broaster'),
  20.00::numeric,
  'el cuarto individual conserva su precio de S/ 20'
);

select is(
  (select image_url from public.products
   where id = '24000000-0000-4000-8000-000000000001'),
  '/images/generated/donde-joel/promo-2-cuartos-broaster.webp',
  'el combo enlaza su imagen IA'
);

select ok(
  (select image_is_stock from public.products
   where id = '24000000-0000-4000-8000-000000000001'),
  'la imagen se declara ilustrativa'
);

select ok(
  (select popular from public.products
   where id = '24000000-0000-4000-8000-000000000001'),
  'el combo queda destacado'
);

select ok(
  (select active from public.products
   where id = '24000000-0000-4000-8000-000000000001'),
  'el combo queda activo'
);

select is(
  (select count(*)::integer from public.products
   where restaurant_id in (
       '20000000-0000-4000-8000-000000000001',
       '20000000-0000-4000-8000-000000000002'
     )
     and name in (
       'Chicharrón de pescado', 'Sudado de cabrilla', 'Parihuela',
       'Chupe de cangrejo', 'Cabrilla al ajo', 'Canastas acevichadas',
       'Chaufa de mariscos'
     )
     and image_url like '/images/generated/anda-paya/%'
     and image_is_stock),
  14,
  'siete imágenes IA se enlazan en ambas fichas Andá Paya'
);

select * from finish();
rollback;
