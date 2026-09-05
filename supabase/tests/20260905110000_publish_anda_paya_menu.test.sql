begin;
select plan(2);
select results_eq(
  $$select public_slug from public.restaurant_menu_settings where public_slug = 'anda-paya-menu'$$,
  array['anda-paya-menu'::text],
  'verified restaurant has a stable public menu slug'
);
select results_eq(
  $$select published from public.restaurant_menu_settings where public_slug = 'anda-paya-menu'$$,
  array[true],
  'verified restaurant menu is published'
);
select * from finish();
rollback;
