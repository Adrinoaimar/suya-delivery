-- Fuente: carta comercial de Andá Paya, 2 páginas, suministrada por el usuario el 20-08-2026.
-- El PDF confirma nombres/precios y paleta; no contiene horario, teléfono, dirección exacta ni
-- precios de bebidas. Esos campos permanecen sin inventar; pedidos quedan habilitados por autorización comercial.

insert into public.categories (id, slug, name, icon, accent, sort_order, active)
values ('10000000-0000-4000-8000-000000000001', 'restaurantes', 'Restaurantes', 'utensils', 'sun', 10, true)
on conflict (id) do update set
  slug = excluded.slug, name = excluded.name, icon = excluded.icon,
  accent = excluded.accent, sort_order = excluded.sort_order, active = excluded.active;

insert into public.restaurants (
  id, slug, category_id, name, description, phone, address, delivery_fee, minimum_order,
  eta_min_minutes, eta_max_minutes, schedule, theme, image_url, logo_url, gallery,
  active, verified_at, tags, rating, review_count, featured, local_business,
  accepting_orders, data_note, promo_label
)
values (
  '20000000-0000-4000-8000-000000000001', 'anda-paya',
  '10000000-0000-4000-8000-000000000001', 'Andá Paya',
  'Cocina marina, ceviches, arroces, platos criollos, parrillas, alitas y hamburguesas.',
  null, 'Sullana, Piura', 0, 0, 25, 45, '{}'::jsonb,
  '{"primary":"#090909","accent":"#F20E18","surface":"#FFF1F1","onPrimary":"#FFFFFF"}'::jsonb,
  null, '/brand/stores/anda-paya-logo.webp',
  '[{"src":"/images/stores/anda-paya/menus/carta-2026-09-06.jpg","caption":"Carta recibida el 06/09/2026 · precios pendientes de conciliación"}]'::jsonb,
  true, now(),
  array['Comida norteña', 'Marinos', 'Criollo'], null, null, true, true, true,
  'Carta y logotipo entregados por el negocio y autorizados para publicación. Precios y datos operativos quedan sujetos a conciliación comercial.',
  null
)
on conflict (id) do update set
  category_id = excluded.category_id, name = excluded.name, description = excluded.description,
  phone = excluded.phone, address = excluded.address, schedule = excluded.schedule,
  theme = excluded.theme, image_url = excluded.image_url, logo_url = excluded.logo_url,
  gallery = excluded.gallery, active = excluded.active, verified_at = excluded.verified_at,
  tags = excluded.tags, rating = excluded.rating, review_count = excluded.review_count,
  featured = excluded.featured, local_business = excluded.local_business,
  accepting_orders = excluded.accepting_orders, data_note = excluded.data_note,
  promo_label = excluded.promo_label;

insert into public.restaurant_menu_settings (
  restaurant_id, public_slug, published, logo_url, hero_image_url,
  primary_color, accent_color, font_family
)
select
  restaurant.id,
  'anda-paya-menu',
  true,
  '/brand/stores/anda-paya-logo.webp',
  '/images/stores/anda-paya/menus/carta-2026-09-06.jpg',
  '#090909',
  '#F20E18',
  'DM Sans'
from public.restaurants restaurant
where restaurant.slug = 'anda-paya'
on conflict (restaurant_id) do update set
  public_slug = excluded.public_slug,
  published = excluded.published,
  logo_url = excluded.logo_url,
  hero_image_url = excluded.hero_image_url,
  primary_color = excluded.primary_color,
  accent_color = excluded.accent_color,
  font_family = excluded.font_family;

insert into public.products (
  id, restaurant_id, section, name, description, price, image_url, image_is_stock, popular, extras, active, sort_order
)
values
  ('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Marino','Chicharrón de pescado','',20,'/images/generated/anda-paya/ap-001-chicharron-de-pescado.webp',true,false,'[{"id":"grande","label":"Porción grande","price":15}]',true,10),
  ('30000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','Marino','Sudado de cabrilla','',30,'/images/generated/anda-paya/ap-002-sudado-de-cabrilla.webp',true,false,'[]',true,20),
  ('30000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000001','Marino','Parihuela','',40,'/images/generated/anda-paya/ap-003-parihuela.webp',true,false,'[]',true,30),
  ('30000000-0000-4000-8000-000000000004','20000000-0000-4000-8000-000000000001','Marino','Chupe de cangrejo','',35,'/images/generated/anda-paya/ap-004-chupe-de-cangrejo.webp',true,false,'[]',true,40),
  ('30000000-0000-4000-8000-000000000005','20000000-0000-4000-8000-000000000001','Marino','Chicharrón mixto','',35,'/images/stores/anda-paya/chicharron-mixto.webp',true,false,'[]',true,50),
  ('30000000-0000-4000-8000-000000000006','20000000-0000-4000-8000-000000000001','Marino','Jalea de cabrilla','',30,'/images/stores/anda-paya/jalea-mixta.webp',true,false,'[]',true,60),
  ('30000000-0000-4000-8000-000000000007','20000000-0000-4000-8000-000000000001','Marino','Cabrilla a lo macho','',40,'/images/stores/anda-paya/pescado-a-lo-macho.webp',true,false,'[]',true,70),
  ('30000000-0000-4000-8000-000000000008','20000000-0000-4000-8000-000000000001','Marino','Cabrilla al ajo','',30,'/images/generated/anda-paya/ap-008-cabrilla-al-ajo.webp',true,false,'[]',true,80),
  ('30000000-0000-4000-8000-000000000009','20000000-0000-4000-8000-000000000001','Ceviche','Ceviche de filete del día','',20,'/images/stores/anda-paya/ceviche-peruano.webp',true,true,'[{"id":"grande","label":"Porción grande","price":15}]',true,90),
  ('30000000-0000-4000-8000-000000000010','20000000-0000-4000-8000-000000000001','Ceviche','Ceviche de caballa','',20,'/images/stores/anda-paya/ceviche-peruano.webp',true,false,'[{"id":"grande","label":"Porción grande","price":15}]',true,100),
  ('30000000-0000-4000-8000-000000000011','20000000-0000-4000-8000-000000000001','Ceviche','Ceviche de filete con caballa','',25,'/images/stores/anda-paya/ceviche-peruano.webp',true,false,'[{"id":"grande","label":"Porción grande","price":10}]',true,110),
  ('30000000-0000-4000-8000-000000000012','20000000-0000-4000-8000-000000000001','Ceviche','Ceviche de filete con mariscos','',25,'/images/stores/anda-paya/ceviche-mixto.webp',true,false,'[{"id":"grande","label":"Porción grande","price":10}]',true,120),
  ('30000000-0000-4000-8000-000000000013','20000000-0000-4000-8000-000000000001','Ceviche','Causa acevichada','',18,'/images/stores/anda-paya/causa-limena.webp',true,false,'[]',true,130),
  ('30000000-0000-4000-8000-000000000014','20000000-0000-4000-8000-000000000001','Ceviche','Canastas acevichadas','',20,'/images/generated/anda-paya/ap-014-canastas-acevichadas.webp',true,false,'[]',true,140),
  ('30000000-0000-4000-8000-000000000015','20000000-0000-4000-8000-000000000001','Arroces','Arroz con mariscos','',20,'/images/stores/anda-paya/arroz-mariscos.webp',true,true,'[{"id":"grande","label":"Porción grande","price":15}]',true,150),
  ('30000000-0000-4000-8000-000000000016','20000000-0000-4000-8000-000000000001','Arroces','Chaufa de pollo','',10,'/images/stores/anda-paya/arroz-chaufa.webp',true,false,'[]',true,160),
  ('30000000-0000-4000-8000-000000000017','20000000-0000-4000-8000-000000000001','Arroces','Chaufa de chancho','',12,'/images/stores/anda-paya/arroz-chaufa.webp',true,false,'[]',true,170),
  ('30000000-0000-4000-8000-000000000018','20000000-0000-4000-8000-000000000001','Arroces','Chaufa de mariscos','',15,'/images/generated/anda-paya/ap-018-chaufa-de-mariscos.webp',true,false,'[]',true,180),
  ('30000000-0000-4000-8000-000000000019','20000000-0000-4000-8000-000000000001','Criollo','Seco de chavelo','',20,'/images/stores/anda-paya/seco-de-chabelo.webp',true,true,'[{"id":"grande","label":"Porción grande","price":15}]',true,190),
  ('30000000-0000-4000-8000-000000000020','20000000-0000-4000-8000-000000000001','Criollo','Majado de yuca','',20,'/images/stores/anda-paya/majado-yuca.webp',true,false,'[{"id":"grande","label":"Porción grande","price":15}]',true,200),
  ('30000000-0000-4000-8000-000000000021','20000000-0000-4000-8000-000000000001','Criollo','Carne aliñada','',20,'/images/stores/anda-paya/carne-parrilla.webp',true,false,'[{"id":"grande","label":"Porción grande","price":15}]',true,210),
  ('30000000-0000-4000-8000-000000000022','20000000-0000-4000-8000-000000000001','Criollo','Costillas con patacones','',20,null,false,false,'[{"id":"grande","label":"Porción grande","price":15}]',true,220),
  ('30000000-0000-4000-8000-000000000023','20000000-0000-4000-8000-000000000001','Criollo','Tacu tacu criollo','',20,'/images/stores/anda-paya/tacu-tacu.webp',true,false,'[]',true,230),
  ('30000000-0000-4000-8000-000000000024','20000000-0000-4000-8000-000000000001','Criollo','Tacu tacu marino','',20,'/images/stores/anda-paya/tacu-tacu.webp',true,false,'[]',true,240),
  ('30000000-0000-4000-8000-000000000025','20000000-0000-4000-8000-000000000001','Criollo','Tacu tacu con lomo saltado a lo pobre','',25,'/images/stores/anda-paya/tacu-tacu-lomo.webp',true,false,'[]',true,250),
  ('30000000-0000-4000-8000-000000000026','20000000-0000-4000-8000-000000000001','Criollo','Lomo saltado','',15,'/images/stores/anda-paya/lomo-saltado.webp',true,false,'[]',true,260),
  ('30000000-0000-4000-8000-000000000027','20000000-0000-4000-8000-000000000001','Criollo','Lomo saltado a lo pobre','',20,'/images/stores/anda-paya/lomo-saltado-pobre.webp',true,false,'[]',true,270),
  ('30000000-0000-4000-8000-000000000028','20000000-0000-4000-8000-000000000001','Rondas','Ronda marina','Ceviche de filete, arroz con mariscos, causa acevichada, ceviche de caballa y chicharrón.',60,null,false,true,'[]',true,280),
  ('30000000-0000-4000-8000-000000000029','20000000-0000-4000-8000-000000000001','Rondas','Ronda criolla','Seco de chavelo, majado de yuca, carne aliñada, costillas, patacones, chorizo y salsa criolla.',60,null,false,true,'[]',true,290),
  ('30000000-0000-4000-8000-000000000030','20000000-0000-4000-8000-000000000001','Rondas','Arma tu dúo','Escoge 2 platos de la lista Mi King indicada en la carta.',30,null,false,false,'[]',true,300),
  ('30000000-0000-4000-8000-000000000031','20000000-0000-4000-8000-000000000001','Rondas','Arma tu trío','Escoge 3 platos de la lista Mi King indicada en la carta.',45,null,false,false,'[]',true,310),
  ('30000000-0000-4000-8000-000000000032','20000000-0000-4000-8000-000000000001','Rondas','Arma tu ronda','Escoge 5 platos de la lista Mi King indicada en la carta.',70,null,false,false,'[]',true,320),
  ('30000000-0000-4000-8000-000000000033','20000000-0000-4000-8000-000000000001','Marino','Leche de tigre con chicharrón de pota','',15,'/images/stores/anda-paya/leche-de-tigre.webp',true,false,'[]',true,330),
  ('30000000-0000-4000-8000-000000000034','20000000-0000-4000-8000-000000000001','Alitas','Alitas (6 unidades)','Sabores: BBQ, acevichadas, broaster, anticucheras, maracuyá, picantes o al ajo.',15,'/images/stores/anda-paya/alitas-bbq.webp',true,true,'[{"id":"ocho","label":"8 unidades","price":5},{"id":"diez","label":"10 unidades","price":10}]',true,340),
  ('30000000-0000-4000-8000-000000000035','20000000-0000-4000-8000-000000000001','Paperos','Salchipapa','',10,'/images/stores/anda-paya/salchipapa.webp',true,false,'[]',true,350),
  ('30000000-0000-4000-8000-000000000036','20000000-0000-4000-8000-000000000001','Paperos','Pollipapa','',12,null,false,false,'[]',true,360),
  ('30000000-0000-4000-8000-000000000037','20000000-0000-4000-8000-000000000001','Paperos','Salchipollo','',13,null,false,false,'[]',true,370),
  ('30000000-0000-4000-8000-000000000038','20000000-0000-4000-8000-000000000001','Paperos','Pollipapa a lo pobre','',15,null,false,false,'[]',true,380),
  ('30000000-0000-4000-8000-000000000039','20000000-0000-4000-8000-000000000001','Paperos','Chicharrón de pollo','',15,null,false,false,'[]',true,390),
  ('30000000-0000-4000-8000-000000000040','20000000-0000-4000-8000-000000000001','Hamburguesas','Hamburguesa clásica','',6,'/images/stores/anda-paya/hamburguesa.webp',true,false,'[]',true,400),
  ('30000000-0000-4000-8000-000000000041','20000000-0000-4000-8000-000000000001','Hamburguesas','Hamburguesa de pollo','',7,'/images/stores/anda-paya/hamburguesa-pollo.webp',true,false,'[]',true,410),
  ('30000000-0000-4000-8000-000000000042','20000000-0000-4000-8000-000000000001','Hamburguesas','Hamburguesa royal','',10,'/images/stores/anda-paya/hamburguesa.webp',true,false,'[]',true,420),
  ('30000000-0000-4000-8000-000000000043','20000000-0000-4000-8000-000000000001','Hamburguesas','Hamburguesa AndaPaya','',13,'/images/stores/anda-paya/hamburguesa.webp',true,true,'[]',true,430),
  ('30000000-0000-4000-8000-000000000044','20000000-0000-4000-8000-000000000001','Mostritos','Mostrito de broaster','Chaufa, broaster, papas y ensalada.',15,null,false,false,'[{"id":"grande","label":"Porción grande","price":5}]',true,440),
  ('30000000-0000-4000-8000-000000000045','20000000-0000-4000-8000-000000000001','Mostritos','Mostrito con 4 alitas','Chaufa, 4 alitas, papas y ensalada.',20,'/images/stores/anda-paya/alitas-bbq.webp',true,false,'[]',true,450),
  ('30000000-0000-4000-8000-000000000046','20000000-0000-4000-8000-000000000001','Parrillas','Pollo a la parrilla','',15,'/images/stores/anda-paya/pollo-parrilla.webp',true,false,'[]',true,460),
  ('30000000-0000-4000-8000-000000000047','20000000-0000-4000-8000-000000000001','Parrillas','Mollejas','',15,'/images/stores/anda-paya/mollejas.webp',true,false,'[]',true,470),
  ('30000000-0000-4000-8000-000000000048','20000000-0000-4000-8000-000000000001','Parrillas','Pollo a la plancha','',15,'/images/stores/anda-paya/pollo-plancha.webp',true,false,'[]',true,480),
  ('30000000-0000-4000-8000-000000000049','20000000-0000-4000-8000-000000000001','Parrillas','Anticuchos','',15,'/images/stores/anda-paya/anticuchos.webp',true,false,'[]',true,490),
  ('30000000-0000-4000-8000-000000000050','20000000-0000-4000-8000-000000000001','Parrillas','Chuleta','',15,null,false,false,'[]',true,500),
  ('30000000-0000-4000-8000-000000000051','20000000-0000-4000-8000-000000000001','Adicionales','Chaufa de huevo','',7,'/images/stores/anda-paya/arroz-chaufa.webp',true,false,'[]',true,510),
  ('30000000-0000-4000-8000-000000000052','20000000-0000-4000-8000-000000000001','Adicionales','Porción de arroz','',5,'/images/stores/anda-paya/arroz-blanco.webp',true,false,'[]',true,520),
  ('30000000-0000-4000-8000-000000000053','20000000-0000-4000-8000-000000000001','Adicionales','Papas fritas','',5,'/images/stores/anda-paya/papas-fritas.webp',true,false,'[]',true,530),
  ('30000000-0000-4000-8000-000000000054','20000000-0000-4000-8000-000000000001','Adicionales','Patacones','',5,'/images/stores/anda-paya/patacones.webp',true,false,'[]',true,540),
  ('30000000-0000-4000-8000-000000000055','20000000-0000-4000-8000-000000000001','Adicionales','Plátanos maduros','',5,'/images/stores/anda-paya/platanos-maduros.webp',true,false,'[]',true,550),
  ('30000000-0000-4000-8000-000000000056','20000000-0000-4000-8000-000000000001','Adicionales','Yucas fritas','',5,'/images/stores/anda-paya/yucas-fritas.webp',true,false,'[]',true,560),
  ('30000000-0000-4000-8000-000000000057','20000000-0000-4000-8000-000000000001','Adicionales','Camote','',5,null,false,false,'[]',true,570),
  ('30000000-0000-4000-8000-000000000058','20000000-0000-4000-8000-000000000001','Adicionales','Arroz','',4,'/images/stores/anda-paya/arroz-blanco.webp',true,false,'[]',true,580)
on conflict (id) do update set
  restaurant_id = excluded.restaurant_id, section = excluded.section, name = excluded.name,
  description = excluded.description, price = excluded.price, image_url = excluded.image_url,
  image_is_stock = excluded.image_is_stock,
  popular = excluded.popular, extras = excluded.extras, active = excluded.active,
  sort_order = excluded.sort_order;

-- Casillero de onboarding sin correo, contraseña ni usuario Auth inventados.
insert into public.restaurant_account_registry (restaurant_id, account_status, notes)
select r.id, 'pending_contact',
  'Falta correo y representante confirmado. No se crea usuario Auth automáticamente.'
from public.restaurants r
where r.slug = 'anda-paya'
on conflict (restaurant_id) do nothing;

-- El seed local se ejecuta después de las migraciones. Replica la ficha separada de
-- Andá Paya Cevichería para que las pruebas y el entorno demo mantengan el catálogo real.
do $$
declare
  source_id uuid;
  cevicheria_id uuid := '20000000-0000-4000-8000-000000000002';
begin
  select id into source_id from public.restaurants where slug = 'anda-paya' limit 1;
  if source_id is null then
    raise exception 'El seed requiere la ficha anda-paya';
  end if;

  update public.restaurants
  set name = 'Andá Paya Restaurante',
      image_url = '/images/stores/anda-paya/cover-restaurante-background.png',
      gallery = jsonb_build_array(
        jsonb_build_object('src', '/images/stores/anda-paya/cover-restaurante-background.png', 'caption', 'Andá Paya Restaurante'),
        jsonb_build_object('src', '/images/stores/anda-paya/menus/carta-2026-09-06.jpg', 'caption', 'Carta recibida el 06/09/2026')
      ),
      featured = true,
      local_business = true,
      accepting_orders = true
  where id = source_id;

  update public.restaurant_menu_settings
  set hero_image_url = '/images/stores/anda-paya/cover-restaurante-background.png',
      logo_url = '/brand/stores/anda-paya-logo.webp',
      published = true
  where restaurant_id = source_id;

  insert into public.restaurants (
    id, slug, category_id, name, description, phone, address, latitude, longitude,
    delivery_fee, minimum_order, eta_min_minutes, eta_max_minutes, schedule, theme,
    image_url, logo_url, gallery, active, verified_at, tags, rating, review_count,
    featured, local_business, accepting_orders, data_note, promo_label
  )
  select
    cevicheria_id, 'anda-paya-cevicheria', r.category_id,
    'Andá Paya Cevichería',
    'Ceviches, platos marinos y arroces de Andá Paya para pedir en Sullana.',
    r.phone, r.address, r.latitude, r.longitude, r.delivery_fee, r.minimum_order,
    r.eta_min_minutes, r.eta_max_minutes, r.schedule, r.theme,
    '/images/stores/anda-paya/cover-cevicheria-background.png',
    '/brand/stores/anda-paya-logo.webp',
    jsonb_build_array(
      jsonb_build_object('src', '/images/stores/anda-paya/cover-cevicheria-background.png', 'caption', 'Andá Paya Cevichería'),
      jsonb_build_object('src', '/images/stores/anda-paya/ceviche-peruano.webp', 'caption', 'Ceviche peruano')
    ),
    true, r.verified_at, array['Cevichería', 'Marinos', 'Arroces'], r.rating, r.review_count,
    true, true, true,
    'Ficha separada de Andá Paya Cevichería. Carta marina heredada de la marca; precios y datos operativos quedan sujetos a conciliación comercial.',
    null
  from public.restaurants r
  where r.id = source_id
  on conflict (id) do update set
    category_id = excluded.category_id, name = excluded.name, description = excluded.description,
    phone = excluded.phone, address = excluded.address, latitude = excluded.latitude,
    longitude = excluded.longitude, delivery_fee = excluded.delivery_fee,
    minimum_order = excluded.minimum_order, eta_min_minutes = excluded.eta_min_minutes,
    eta_max_minutes = excluded.eta_max_minutes, schedule = excluded.schedule,
    theme = excluded.theme, image_url = excluded.image_url, logo_url = excluded.logo_url,
    gallery = excluded.gallery, active = excluded.active, verified_at = excluded.verified_at,
    tags = excluded.tags, rating = excluded.rating, review_count = excluded.review_count,
    featured = excluded.featured, local_business = excluded.local_business,
    accepting_orders = excluded.accepting_orders, data_note = excluded.data_note,
    promo_label = excluded.promo_label;

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
    public_slug = excluded.public_slug, published = excluded.published,
    logo_url = excluded.logo_url, hero_image_url = excluded.hero_image_url,
    primary_color = excluded.primary_color, accent_color = excluded.accent_color,
    font_family = excluded.font_family, updated_at = now();

  insert into public.products (
    restaurant_id, section, name, description, price, image_url, image_is_stock,
    popular, extras, active, sort_order
  )
  select cevicheria_id, p.section, p.name, p.description, p.price, p.image_url,
         p.image_is_stock, p.popular, p.extras, p.active, p.sort_order
  from public.products p
  where p.restaurant_id = source_id
    and p.section in ('Marino', 'Ceviche', 'Arroces')
    and not exists (select 1 from public.products existing where existing.restaurant_id = cevicheria_id);
end $$;

-- La configuración de catálogo se omite durante la fase de migraciones de un reset local,
-- por eso el seed deja los mismos flags operativos que producción.
update public.restaurants
set active = true,
    accepting_orders = slug in ('anda-paya', 'anda-paya-cevicheria', 'donde-joel'),
    featured = slug in ('anda-paya', 'anda-paya-cevicheria', 'donde-joel'),
    data_note = case when slug = 'donde-joel' then null else data_note end
where slug in ('anda-paya', 'anda-paya-cevicheria', 'donde-joel', 'la-waka', 'tio-jhony',
               'kfc', 'inkafarma', 'papa-johns', 'tottus');

-- El seed corre después de las migraciones: reafirma las promociones vigentes.
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
  restaurant_id = excluded.restaurant_id, section = excluded.section,
  name = excluded.name, description = excluded.description, price = excluded.price,
  image_url = excluded.image_url, image_is_stock = excluded.image_is_stock,
  popular = excluded.popular, extras = excluded.extras, active = excluded.active,
  sort_order = excluded.sort_order;

-- Aplicación final: Donde Joel se inserta después del bloque ilustrativo inicial.
-- Enlaza las imágenes IA generadas y revisadas al 2026-09-12.
-- image_is_stock=true indica material ilustrativo, no fotografía oficial.

with assets(product_id, name, image_url) as (
  values
    ('30000000-0000-4000-8000-000000000001'::uuid, 'Chicharrón de pescado', '/images/generated/anda-paya/ap-001-chicharron-de-pescado.webp'),
    ('30000000-0000-4000-8000-000000000002'::uuid, 'Sudado de cabrilla', '/images/generated/anda-paya/ap-002-sudado-de-cabrilla.webp'),
    ('30000000-0000-4000-8000-000000000003'::uuid, 'Parihuela', '/images/generated/anda-paya/ap-003-parihuela.webp'),
    ('30000000-0000-4000-8000-000000000004'::uuid, 'Chupe de cangrejo', '/images/generated/anda-paya/ap-004-chupe-de-cangrejo.webp'),
    ('30000000-0000-4000-8000-000000000005'::uuid, 'Chicharrón mixto', '/images/generated/anda-paya/ap-005-chicharron-mixto.webp'),
    ('30000000-0000-4000-8000-000000000006'::uuid, 'Jalea de cabrilla', '/images/generated/anda-paya/ap-006-jalea-de-cabrilla.webp'),
    ('30000000-0000-4000-8000-000000000007'::uuid, 'Cabrilla a lo macho', '/images/generated/anda-paya/ap-007-cabrilla-a-lo-macho.webp'),
    ('30000000-0000-4000-8000-000000000008'::uuid, 'Cabrilla al ajo', '/images/generated/anda-paya/ap-008-cabrilla-al-ajo.webp'),
    ('30000000-0000-4000-8000-000000000009'::uuid, 'Ceviche de filete del día', '/images/generated/anda-paya/ap-009-ceviche-de-filete-del-dia.webp'),
    ('30000000-0000-4000-8000-000000000010'::uuid, 'Ceviche de caballa', '/images/generated/anda-paya/ap-010-ceviche-de-caballa.webp'),
    ('30000000-0000-4000-8000-000000000011'::uuid, 'Ceviche de filete con caballa', '/images/generated/anda-paya/ap-011-ceviche-de-filete-con-caballa.webp'),
    ('30000000-0000-4000-8000-000000000012'::uuid, 'Ceviche de filete con mariscos', '/images/generated/anda-paya/ap-012-ceviche-de-filete-con-mariscos.webp'),
    ('30000000-0000-4000-8000-000000000013'::uuid, 'Causa acevichada', '/images/generated/anda-paya/ap-013-causa-acevichada.webp'),
    ('30000000-0000-4000-8000-000000000014'::uuid, 'Canastas acevichadas', '/images/generated/anda-paya/ap-014-canastas-acevichadas.webp'),
    ('30000000-0000-4000-8000-000000000015'::uuid, 'Arroz con mariscos', '/images/generated/anda-paya/ap-015-arroz-con-mariscos.webp'),
    ('30000000-0000-4000-8000-000000000016'::uuid, 'Chaufa de pollo', '/images/generated/anda-paya/ap-016-chaufa-de-pollo.webp'),
    ('30000000-0000-4000-8000-000000000017'::uuid, 'Chaufa de chancho', '/images/generated/anda-paya/ap-017-chaufa-de-chancho.webp'),
    ('30000000-0000-4000-8000-000000000018'::uuid, 'Chaufa de mariscos', '/images/generated/anda-paya/ap-018-chaufa-de-mariscos.webp'),
    ('30000000-0000-4000-8000-000000000019'::uuid, 'Seco de chavelo', '/images/generated/anda-paya/ap-019-seco-de-chavelo.webp'),
    ('30000000-0000-4000-8000-000000000020'::uuid, 'Majado de yuca', '/images/generated/anda-paya/ap-020-majado-de-yuca.webp'),
    ('30000000-0000-4000-8000-000000000021'::uuid, 'Carne aliñada', '/images/generated/anda-paya/ap-021-carne-alinada.webp'),
    ('30000000-0000-4000-8000-000000000022'::uuid, 'Costillas con patacones', '/images/generated/anda-paya/ap-022-costillas-con-patacones.webp'),
    ('30000000-0000-4000-8000-000000000023'::uuid, 'Tacu tacu criollo', '/images/generated/anda-paya/ap-023-tacu-tacu-criollo.webp'),
    ('30000000-0000-4000-8000-000000000024'::uuid, 'Tacu tacu marino', '/images/generated/anda-paya/ap-024-tacu-tacu-marino.webp'),
    ('30000000-0000-4000-8000-000000000025'::uuid, 'Tacu tacu con lomo saltado a lo pobre', '/images/generated/anda-paya/ap-025-tacu-tacu-con-lomo-saltado-a-lo-pobre.webp'),
    ('30000000-0000-4000-8000-000000000026'::uuid, 'Lomo saltado', '/images/generated/anda-paya/ap-026-lomo-saltado.webp'),
    ('30000000-0000-4000-8000-000000000027'::uuid, 'Lomo saltado a lo pobre', '/images/generated/anda-paya/ap-027-lomo-saltado-a-lo-pobre.webp'),
    ('30000000-0000-4000-8000-000000000028'::uuid, 'Ronda marina', '/images/generated/anda-paya/ap-028-ronda-marina.webp'),
    ('30000000-0000-4000-8000-000000000029'::uuid, 'Ronda criolla', '/images/generated/anda-paya/ap-029-ronda-criolla.webp'),
    ('30000000-0000-4000-8000-000000000030'::uuid, 'Arma tu dúo', '/images/generated/anda-paya/ap-030-arma-tu-duo.webp'),
    ('30000000-0000-4000-8000-000000000031'::uuid, 'Arma tu trío', '/images/generated/anda-paya/ap-031-arma-tu-trio.webp'),
    ('30000000-0000-4000-8000-000000000032'::uuid, 'Arma tu ronda', '/images/generated/anda-paya/ap-032-arma-tu-ronda.webp'),
    ('30000000-0000-4000-8000-000000000033'::uuid, 'Leche de tigre con chicharrón de pota', '/images/generated/anda-paya/ap-033-leche-de-tigre-con-chicharron-de-pota.webp'),
    ('30000000-0000-4000-8000-000000000034'::uuid, 'Alitas (6 unidades)', '/images/generated/anda-paya/ap-034-alitas-6-unidades.webp'),
    ('30000000-0000-4000-8000-000000000035'::uuid, 'Salchipapa', '/images/generated/anda-paya/ap-035-salchipapa.webp'),
    ('30000000-0000-4000-8000-000000000036'::uuid, 'Pollipapa', '/images/generated/anda-paya/ap-036-pollipapa.webp'),
    ('30000000-0000-4000-8000-000000000037'::uuid, 'Salchipollo', '/images/generated/anda-paya/ap-037-salchipollo.webp'),
    ('30000000-0000-4000-8000-000000000038'::uuid, 'Pollipapa a lo pobre', '/images/generated/anda-paya/ap-038-pollipapa-a-lo-pobre.webp'),
    ('30000000-0000-4000-8000-000000000039'::uuid, 'Chicharrón de pollo', '/images/generated/anda-paya/ap-039-chicharron-de-pollo.webp'),
    ('30000000-0000-4000-8000-000000000040'::uuid, 'Hamburguesa clásica', '/images/generated/anda-paya/ap-040-hamburguesa-clasica.webp'),
    ('30000000-0000-4000-8000-000000000041'::uuid, 'Hamburguesa de pollo', '/images/generated/anda-paya/ap-041-hamburguesa-de-pollo.webp'),
    ('30000000-0000-4000-8000-000000000042'::uuid, 'Hamburguesa royal', '/images/generated/anda-paya/ap-042-hamburguesa-royal.webp'),
    ('30000000-0000-4000-8000-000000000043'::uuid, 'Hamburguesa AndaPaya', '/images/generated/anda-paya/ap-043-hamburguesa-andapaya.webp'),
    ('30000000-0000-4000-8000-000000000044'::uuid, 'Mostrito de broaster', '/images/generated/anda-paya/ap-044-mostrito-de-broaster.webp'),
    ('30000000-0000-4000-8000-000000000045'::uuid, 'Mostrito con 4 alitas', '/images/generated/anda-paya/ap-045-mostrito-con-4-alitas.webp'),
    ('30000000-0000-4000-8000-000000000046'::uuid, 'Pollo a la parrilla', '/images/generated/anda-paya/ap-046-pollo-a-la-parrilla.webp'),
    ('30000000-0000-4000-8000-000000000047'::uuid, 'Mollejas', '/images/generated/anda-paya/ap-047-mollejas.webp'),
    ('30000000-0000-4000-8000-000000000048'::uuid, 'Pollo a la plancha', '/images/generated/anda-paya/ap-048-pollo-a-la-plancha.webp'),
    ('30000000-0000-4000-8000-000000000049'::uuid, 'Anticuchos', '/images/generated/anda-paya/ap-049-anticuchos.webp'),
    ('30000000-0000-4000-8000-000000000050'::uuid, 'Chuleta', '/images/generated/anda-paya/ap-050-chuleta.webp'),
    ('30000000-0000-4000-8000-000000000051'::uuid, 'Chaufa de huevo', '/images/generated/anda-paya/ap-051-chaufa-de-huevo.webp'),
    ('30000000-0000-4000-8000-000000000052'::uuid, 'Porción de arroz', '/images/generated/anda-paya/ap-052-porcion-de-arroz.webp'),
    ('30000000-0000-4000-8000-000000000053'::uuid, 'Papas fritas', '/images/generated/anda-paya/ap-053-papas-fritas.webp'),
    ('30000000-0000-4000-8000-000000000054'::uuid, 'Patacones', '/images/generated/anda-paya/ap-054-patacones.webp'),
    ('30000000-0000-4000-8000-000000000055'::uuid, 'Plátanos maduros', '/images/generated/anda-paya/ap-055-platanos-maduros.webp'),
    ('30000000-0000-4000-8000-000000000056'::uuid, 'Yucas fritas', '/images/generated/anda-paya/ap-056-yucas-fritas.webp'),
    ('30000000-0000-4000-8000-000000000057'::uuid, 'Camote', '/images/generated/anda-paya/ap-057-camote.webp'),
    ('30000000-0000-4000-8000-000000000058'::uuid, 'Arroz', '/images/generated/anda-paya/ap-058-arroz.webp')
)
update public.products p
set image_url=assets.image_url, image_is_stock=true
from assets
where p.id=assets.product_id
   or (p.restaurant_id='20000000-0000-4000-8000-000000000002'::uuid and p.name=assets.name);

with assets(source_key, image_url) as (
  values
    ('p01-001', '/images/generated/donde-joel/dj-p01-001-arroz-con-mariscos.webp'),
    ('p01-002', '/images/generated/donde-joel/dj-p01-002-tiradito-clasico.webp'),
    ('p01-003', '/images/generated/donde-joel/dj-p01-003-leche-de-tigre.webp'),
    ('p01-004', '/images/generated/donde-joel/dj-p01-004-chicharron-de-pescado.webp'),
    ('p01-005', '/images/generated/donde-joel/dj-p01-005-chicharron-de-caballa.webp'),
    ('p01-006', '/images/generated/donde-joel/dj-p01-006-seco-de-chavelo.webp'),
    ('p01-007', '/images/generated/donde-joel/dj-p01-007-majado-de-yuca.webp'),
    ('p01-008', '/images/generated/donde-joel/dj-p01-008-seco-de-chavelo-costillas.webp'),
    ('p01-009', '/images/generated/donde-joel/dj-p01-009-majado-de-yuca-costillas.webp'),
    ('p01-010', '/images/generated/donde-joel/dj-p01-010-criolla.webp'),
    ('p01-011', '/images/generated/donde-joel/dj-p01-011-marina.webp'),
    ('p01-012', '/images/generated/donde-joel/dj-p01-012-ronda-amazonica.webp'),
    ('p01-013', '/images/generated/donde-joel/dj-p01-013-mar-y-tierra.webp'),
    ('p02-001', '/images/generated/donde-joel/dj-p02-001-salchipapa-clasica.webp'),
    ('p02-002', '/images/generated/donde-joel/dj-p02-002-salchipollo.webp'),
    ('p02-003', '/images/generated/donde-joel/dj-p02-003-salchi-mixta.webp'),
    ('p02-004', '/images/generated/donde-joel/dj-p02-004-salchibrasa.webp'),
    ('p02-005', '/images/generated/donde-joel/dj-p02-005-salchibrason.webp'),
    ('p02-006', '/images/generated/donde-joel/dj-p02-006-salchipapa-a-lo-pobre.webp'),
    ('p02-007', '/images/generated/donde-joel/dj-p02-007-salchipapa-amazonica.webp'),
    ('p02-008', '/images/generated/donde-joel/dj-p02-008-brocheta-de-pollo.webp'),
    ('p02-009', '/images/generated/donde-joel/dj-p02-009-brocheta-de-lomo-fino.webp'),
    ('p02-010', '/images/generated/donde-joel/dj-p02-010-brocheta-de-chancho.webp'),
    ('p02-011', '/images/generated/donde-joel/dj-p02-011-chaufa-de-pollo.webp'),
    ('p02-012', '/images/generated/donde-joel/dj-p02-012-chaufa-a-lo-pobre.webp'),
    ('p02-013', '/images/generated/donde-joel/dj-p02-013-chaufa-de-chancho.webp'),
    ('p02-014', '/images/generated/donde-joel/dj-p02-014-chaufa-de-carne.webp'),
    ('p02-015', '/images/generated/donde-joel/dj-p02-015-chaufa-mixto.webp'),
    ('p02-020', '/images/generated/donde-joel/dj-p02-020-1-4-de-pollo-broaster.webp')
)
update public.products p
set image_url=assets.image_url, image_is_stock=true
from assets
where p.id=md5('suya:donde-joel:' || assets.source_key)::uuid;
