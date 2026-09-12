begin;
select plan(5);

select is(
  (select count(*)::integer
   from pg_publication_tables
   where pubname = 'supabase_realtime'
     and schemaname = 'public'
     and tablename in ('categories', 'restaurants', 'restaurant_menu_settings', 'products')),
  4,
  'las tablas de catálogo están publicadas para Realtime'
);

select ok(
  exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'restaurants'),
  'los cambios de restaurantes llegan a las apps abiertas'
);

select ok(
  exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'restaurant_menu_settings'),
  'los cambios de branding y publicación llegan a las cartas'
);

select ok(
  exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'products'),
  'los cambios de productos llegan al catálogo'
);

select ok(
  exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'categories'),
  'los cambios de categorías llegan al catálogo'
);

select * from finish();
rollback;

