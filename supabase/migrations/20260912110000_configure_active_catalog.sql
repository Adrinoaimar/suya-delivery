-- Catálogo inicial publicado: tres negocios reciben pedidos; el resto anuncia próxima apertura.
-- Andá Paya Cevichería comparte datos operativos autorizados de la marca y mantiene carta
-- marina separada para no mezclar pedidos entre fichas.
do $$
declare
  source_id uuid;
  cevicheria_id uuid := '20000000-0000-4000-8000-000000000002';
begin
  -- Las semillas locales y la base productiva pueden usar UUID distintos; el slug es la identidad estable.
  select id into source_id
  from public.restaurants
  where slug = 'anda-paya'
  limit 1;

  if source_id is null then
    raise exception 'No existe la ficha fuente anda-paya';
  end if;

  update public.restaurants
  set name = 'Andá Paya Restaurante',
      description = 'Cocina marina, platos criollos, parrillas y comida norteña del valle del Chira.',
      image_url = '/images/stores/anda-paya/cover-restaurante-background.png',
      logo_url = '/brand/stores/anda-paya-logo.webp',
      gallery = jsonb_build_array(
        jsonb_build_object('src', '/images/stores/anda-paya/cover-restaurante-background.png', 'caption', 'Andá Paya Restaurante')
      ),
      featured = true,
      local_business = true,
      accepting_orders = true,
      updated_at = now()
  where id = source_id;

  insert into public.restaurants (
    id, slug, category_id, name, description, phone, address, latitude, longitude,
    delivery_fee, minimum_order, eta_min_minutes, eta_max_minutes, schedule, theme,
    image_url, logo_url, gallery, active, verified_at, tags, rating, review_count,
    featured, local_business, accepting_orders, data_note, promo_label
  )
  select
    cevicheria_id,
    'anda-paya-cevicheria',
    r.category_id,
    'Andá Paya Cevichería',
    'Ceviches, platos marinos y arroces de Andá Paya para pedir en Sullana.',
    r.phone,
    r.address,
    r.latitude,
    r.longitude,
    r.delivery_fee,
    r.minimum_order,
    r.eta_min_minutes,
    r.eta_max_minutes,
    r.schedule,
    r.theme,
    '/images/stores/anda-paya/cover-cevicheria-background.png',
    '/brand/stores/anda-paya-logo.webp',
    jsonb_build_array(
      jsonb_build_object('src', '/images/stores/anda-paya/cover-cevicheria-background.png', 'caption', 'Andá Paya Cevichería'),
      jsonb_build_object('src', '/images/stores/anda-paya/ceviche-peruano.webp', 'caption', 'Ceviche peruano')
    ),
    true,
    r.verified_at,
    array['Cevichería', 'Marinos', 'Arroces'],
    r.rating,
    r.review_count,
    true,
    true,
    true,
    'Ficha separada de Andá Paya Cevichería. Carta marina heredada de la marca; precios y datos operativos quedan sujetos a conciliación comercial.',
    null
  from public.restaurants r
  where r.id = source_id
    and not exists (select 1 from public.restaurants existing where existing.slug = 'anda-paya-cevicheria');

  update public.restaurants
  set name = 'Andá Paya Cevichería',
      image_url = '/images/stores/anda-paya/cover-cevicheria-background.png',
      logo_url = '/brand/stores/anda-paya-logo.webp',
      featured = true,
      local_business = true,
      accepting_orders = true,
      active = true,
      updated_at = now()
  where slug = 'anda-paya-cevicheria';

  update public.restaurant_menu_settings settings
  set logo_url = '/brand/stores/anda-paya-logo.webp',
      hero_image_url = '/images/stores/anda-paya/cover-restaurante-background.png',
      published = true,
      updated_at = now()
  where settings.restaurant_id = source_id;

  insert into public.restaurant_menu_settings (
    restaurant_id, public_slug, published, logo_url, hero_image_url,
    primary_color, accent_color, font_family
  ) values (
    cevicheria_id, 'anda-paya-cevicheria-menu', true,
    '/brand/stores/anda-paya-logo.webp',
    '/images/stores/anda-paya/cover-cevicheria-background.png',
    '#090909', '#F20E18', 'DM Sans'
  )
  on conflict (restaurant_id) do update set
    public_slug = excluded.public_slug,
    published = excluded.published,
    logo_url = excluded.logo_url,
    hero_image_url = excluded.hero_image_url,
    primary_color = excluded.primary_color,
    accent_color = excluded.accent_color,
    font_family = excluded.font_family,
    updated_at = now();

  insert into public.products (
    restaurant_id, section, name, description, price, image_url, image_is_stock,
    popular, extras, active, sort_order
  )
  select
    cevicheria_id, p.section, p.name, p.description, p.price, p.image_url,
    p.image_is_stock, p.popular, p.extras, p.active, p.sort_order
  from public.products p
  where p.restaurant_id = source_id
    and p.section in ('Marino', 'Ceviche', 'Arroces')
    and not exists (
      select 1 from public.products existing where existing.restaurant_id = cevicheria_id
    );

  -- Flags explícitos evitan que una ficha previa vuelva a aceptar pedidos por error.
  update public.restaurants
  set active = true,
      accepting_orders = slug in ('anda-paya', 'anda-paya-cevicheria', 'donde-joel'),
      featured = slug in ('anda-paya', 'anda-paya-cevicheria', 'donde-joel'),
      updated_at = now()
  where slug in ('anda-paya', 'anda-paya-cevicheria', 'donde-joel', 'la-waka', 'tio-jhony',
                 'kfc', 'inkafarma', 'papa-johns', 'tottus');
end $$;

comment on table public.restaurants is
  'Catálogo visible. accepting_orders identifica fichas activas; isComingSoon se deriva del allowlist del cliente.';
