alter table public.restaurants
  add column tags text[] not null default '{}'::text[],
  add column rating numeric(2,1) check (rating is null or rating between 0 and 5),
  add column review_count integer check (review_count is null or review_count >= 0),
  add column featured boolean not null default false,
  add column local_business boolean not null default false,
  add column accepting_orders boolean not null default false,
  add column data_note text,
  add column promo_label text;

comment on column public.restaurants.rating is
  'Calificación importada de una fuente verificable; null cuando no existe.';
comment on column public.restaurants.review_count is
  'Cantidad asociada a rating; null cuando la fuente no fue verificada.';
comment on column public.restaurants.accepting_orders is
  'Control operativo explícito. No se deduce de un horario desconocido.';

alter table public.restaurants
  add constraint restaurants_rating_reviews_consistent check (
    (rating is null and review_count is null)
    or (rating is not null and review_count is not null)
  );

create index restaurants_active_featured_idx
  on public.restaurants (featured desc, name)
  where active;
