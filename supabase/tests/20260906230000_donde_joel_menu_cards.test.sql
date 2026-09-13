begin;

select plan(18);

select is(
  (select count(*)::integer from public.restaurants where id = '23000000-0000-4000-8000-000000000001'),
  1,
  'Donde Joel usa una identidad determinista'
);

select is(
  (select slug from public.restaurants where id = '23000000-0000-4000-8000-000000000001'),
  'donde-joel',
  'slug público estable'
);

select is(
  (select active from public.restaurants where id = '23000000-0000-4000-8000-000000000001'),
  true,
  'catálogo visible'
);

select is(
  (select accepting_orders from public.restaurants where id = '23000000-0000-4000-8000-000000000001'),
  true,
  'Donde Joel queda habilitado como uno de los tres negocios activos'
);

select ok(
  (select data_note is null or data_note not ilike '%pedidos permanecen desactivados%'
   from public.restaurants
   where id = '23000000-0000-4000-8000-000000000001'),
  'la ficha activa no conserva una advertencia de pedidos desactivados'
);

select is(
  (select jsonb_array_length(gallery)
   from public.restaurants
   where id = '23000000-0000-4000-8000-000000000001'),
  4,
  'cuatro cartas originales publicadas en galería'
);

select is(
  (select count(*)::integer
   from public.products
   where restaurant_id = '23000000-0000-4000-8000-000000000001'),
  134,
  '133 conceptos de carta y una promoción publicados'
);

select is(
  (select count(distinct id)::integer
   from public.products
   where restaurant_id = '23000000-0000-4000-8000-000000000001'),
  134,
  'todos los productos tienen identidad única'
);

select is(
  (select count(*)::integer from public.products
   where restaurant_id = '23000000-0000-4000-8000-000000000001'
     and sort_order between 10 and 130),
  13,
  'carta 1 aporta 13 conceptos'
);

select is(
  (select count(*)::integer from public.products
   where restaurant_id = '23000000-0000-4000-8000-000000000001'
     and sort_order between 140 and 570),
  44,
  'carta 2 aporta 44 conceptos'
);

select is(
  (select count(*)::integer from public.products
   where restaurant_id = '23000000-0000-4000-8000-000000000001'
     and sort_order between 580 and 1040),
  47,
  'carta 3 aporta 47 conceptos'
);

select is(
  (select count(*)::integer from public.products
   where restaurant_id = '23000000-0000-4000-8000-000000000001'
     and sort_order between 1050 and 1330),
  29,
  'carta 4 aporta 29 conceptos'
);

select is(
  (select count(*)::integer from public.products
   where restaurant_id = '23000000-0000-4000-8000-000000000001'
     and name in (
       'Ceviche de caballa', 'Dúo de alitas', 'Combo para 2',
       'Mostrialitas - clásico', 'Cerveza Cristal', 'Sangría', 'Agua sin/con gas'
     )),
  0,
  'ambigüedades, elecciones abiertas y alcohol no se importan'
);

select is(
  (select public_slug from public.restaurant_menu_settings
   where restaurant_id = '23000000-0000-4000-8000-000000000001'
     and published),
  'donde-joel-menu',
  'menú público publicado con slug estable'
);

select is(
  (select count(*)::integer
   from public.restaurants r,
        jsonb_array_elements(r.gallery) item
   where r.id = '20000000-0000-4000-8000-000000000001'
     and item->>'src' = '/images/stores/anda-paya/menus/carta-2026-09-06.jpg'),
  1,
  'carta nueva de Andá Paya queda visible una sola vez sin reemplazar productos'
);

select throws_ok(
  $$
    select * from public.create_menu_order(
      '23000000-0000-4000-8000-000000000001',
      '[{"product_id":"00000000-0000-4000-8000-000000000001","quantity":1,"extra_ids":[]}]'::jsonb,
      '999999999',
      'Dirección de prueba',
      '',
      '23000000-0000-4000-8000-000000000099'
    )
  $$,
  'P0001',
  'product is unavailable',
  'RPC rechaza productos inexistentes aunque el negocio esté activo'
);

select lives_ok(
  $$
    insert into public.products (
      id, restaurant_id, section, name, description, price, image_url,
      image_is_stock, popular, extras, active, sort_order
    ) values (
      md5('suya:donde-joel:p01-001')::uuid,
      '23000000-0000-4000-8000-000000000001',
      'Marinos', 'Arroz con mariscos', '', 25, null,
      false, false, '[]'::jsonb, true, 10
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
      sort_order = excluded.sort_order
  $$,
  'reaplicar una clave de origen conserva idempotencia'
);

select is(
  (select count(*)::integer
   from public.products
   where restaurant_id = '23000000-0000-4000-8000-000000000001'),
  134,
  'reaplicar la clave no duplica productos'
);

select * from finish();
rollback;
