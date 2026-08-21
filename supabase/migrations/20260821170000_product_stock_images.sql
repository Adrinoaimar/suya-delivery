alter table public.products
  add column image_is_stock boolean not null default false;

comment on column public.products.image_is_stock is
  'true cuando image_url es una foto generica de stock (no una foto real del plato del negocio). El cliente debe mostrarlo como ilustrativo.';
