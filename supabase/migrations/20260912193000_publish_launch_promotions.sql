-- Promociones de lanzamiento autorizadas para los tres negocios activos.
update public.restaurants
set delivery_fee = 0,
    promo_label = 'Delivery gratis por lanzamiento'
where slug in ('anda-paya', 'anda-paya-cevicheria');

update public.restaurants
set promo_label = 'Primer cuarto S/ 20 + segundo a S/ 1'
where slug = 'donde-joel';

insert into public.products (
  id, restaurant_id, section, name, description, price, image_url,
  image_is_stock, popular, extras, active, sort_order
) values (
  '24000000-0000-4000-8000-000000000001',
  '23000000-0000-4000-8000-000000000001',
  'Promociones',
  'Promo: 2 cuartos de pollo broaster',
  'Incluye dos cuartos de pollo broaster. Primer cuarto S/ 20 y segundo S/ 1.',
  21,
  '/images/generated/donde-joel/promo-2-cuartos-broaster.webp',
  true,
  true,
  '[]'::jsonb,
  true,
  1
)
on conflict (id) do update set
  restaurant_id = excluded.restaurant_id,
  section = excluded.section,
  name = excluded.name,
  description = excluded.description,
  price = excluded.price,
  image_url = excluded.image_url,
  image_is_stock = excluded.image_is_stock,
  popular = excluded.popular,
  extras = excluded.extras,
  active = excluded.active,
  sort_order = excluded.sort_order;

with assets(name, image_url) as (
  values
    ('Chicharrón de pescado', '/images/generated/anda-paya/ap-001-chicharron-de-pescado.webp'),
    ('Sudado de cabrilla', '/images/generated/anda-paya/ap-002-sudado-de-cabrilla.webp'),
    ('Parihuela', '/images/generated/anda-paya/ap-003-parihuela.webp'),
    ('Chupe de cangrejo', '/images/generated/anda-paya/ap-004-chupe-de-cangrejo.webp'),
    ('Cabrilla al ajo', '/images/generated/anda-paya/ap-008-cabrilla-al-ajo.webp'),
    ('Canastas acevichadas', '/images/generated/anda-paya/ap-014-canastas-acevichadas.webp'),
    ('Chaufa de mariscos', '/images/generated/anda-paya/ap-018-chaufa-de-mariscos.webp')
)
update public.products p
set image_url = assets.image_url,
    image_is_stock = true
from assets
where p.restaurant_id in (
    '20000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000002'
  )
  and p.name = assets.name;
