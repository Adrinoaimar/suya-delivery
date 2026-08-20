begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(10);

select has_column('public', 'restaurants', 'tags', 'restaurants tiene etiquetas');
select has_column('public', 'restaurants', 'rating', 'restaurants tiene calificación nullable');
select has_column('public', 'restaurants', 'review_count', 'restaurants tiene conteo de reseñas');
select has_column('public', 'restaurants', 'featured', 'restaurants puede destacarse');
select has_column('public', 'restaurants', 'local_business', 'restaurants identifica negocio local');
select has_column('public', 'restaurants', 'accepting_orders', 'restaurants controla recepción de pedidos');
select has_column('public', 'restaurants', 'data_note', 'restaurants conserva nota de procedencia');
select has_column('public', 'restaurants', 'promo_label', 'restaurants conserva promoción verificada');
select has_check('public', 'restaurants', 'restaurants_rating_reviews_consistent',
  'rating y review_count aparecen juntos');
select has_index('public', 'restaurants', 'restaurants_active_featured_idx',
  'catálogo activo/destacado está indexado');

select * from finish();
rollback;
