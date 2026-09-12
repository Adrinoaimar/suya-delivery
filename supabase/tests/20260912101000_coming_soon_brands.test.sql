begin;
select plan(8);

select is(
  (select count(*)::integer from public.restaurants
   where slug in ('kfc', 'inkafarma', 'papa-johns', 'tottus')),
  4,
  'las cuatro fichas de próxima apertura existen'
);

select is(
  (select count(*)::integer from public.restaurants
   where slug in ('kfc', 'inkafarma', 'papa-johns', 'tottus') and active and not accepting_orders),
  4,
  'las fichas están visibles pero no aceptan pedidos'
);

select is(
  (select logo_url from public.restaurants where slug = 'kfc'),
  '/brand/stores/kfc-logo.png',
  'KFC conserva su logo de próxima apertura'
);

select is(
  (select logo_url from public.restaurants where slug = 'inkafarma'),
  '/brand/stores/inkafarma-logo.png',
  'Inkafarma conserva su logo de próxima apertura'
);

select is(
  (select logo_url from public.restaurants where slug = 'papa-johns'),
  '/brand/stores/papa-johns-logo.svg',
  'Papa John''s conserva su logo de próxima apertura'
);

select is(
  (select logo_url from public.restaurants where slug = 'tottus'),
  '/brand/stores/tottus-logo.svg',
  'Tottus conserva su logo de próxima apertura'
);

select is(
  (select verified_at is null from public.restaurants where slug = 'kfc'),
  true,
  'KFC no se presenta como verificado sin alta comercial'
);

select is(
  (select count(*)::integer from public.products p
   join public.restaurants r on r.id = p.restaurant_id
   where r.slug in ('kfc', 'inkafarma', 'papa-johns', 'tottus')),
  0,
  'las fichas no inventan productos antes del alta'
);

select * from finish();
rollback;

