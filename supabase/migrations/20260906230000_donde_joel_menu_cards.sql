-- Catálogo informativo verificable de Donde Joel.
-- Fuente primaria: cuatro cartas JPG suministradas por el usuario el 6 de septiembre de 2026.
-- Pedidos desactivados: ubicación, horario, tarifa, mínimo y reglas de opciones siguen por confirmar.
do $$
declare
  restaurant_category_id uuid;
  restaurant_id constant uuid := '23000000-0000-4000-8000-000000000001';
begin
  insert into public.categories (id, slug, name, icon, accent, sort_order, active)
  values ('10000000-0000-4000-8000-000000000001', 'restaurantes', 'Restaurantes', 'utensils', 'green', 10, true)
  on conflict (id) do update set
    slug = excluded.slug,
    name = excluded.name,
    icon = excluded.icon,
    accent = excluded.accent,
    active = true;

  select id into restaurant_category_id
  from public.categories
  where slug = 'restaurantes'
  limit 1;

  if restaurant_category_id is null then
    raise exception 'Falta categoría restaurantes';
  end if;

  insert into public.restaurants (
    id, slug, category_id, name, description, phone, address, delivery_fee,
    minimum_order, eta_min_minutes, eta_max_minutes, schedule, theme,
    image_url, logo_url, gallery, active, verified_at, tags, featured,
    local_business, accepting_orders, data_note, promo_label
  ) values (
    restaurant_id,
    'donde-joel',
    restaurant_category_id,
    'Donde Joel',
    'Carta informativa de cevichería, fast food, pollo, parrillas, platos amazónicos y bebidas.',
    '939 876 935',
    'Por confirmar',
    0,
    0,
    20,
    45,
    '{"status":"pending_confirmation"}'::jsonb,
    '{"primary":"#0647A9","accent":"#FF7A00","surface":"#F4F8FF","onPrimary":"#FFFFFF"}'::jsonb,
    '/images/stores/donde-joel/menus/carta-01.jpg',
    null,
    '[
      {"src":"/images/stores/donde-joel/menus/carta-01.jpg","caption":"Carta 1: ceviches, marinos, criollos, dúos y rondas"},
      {"src":"/images/stores/donde-joel/menus/carta-02.jpg","caption":"Carta 2: fast food, pollo, chaufas y platos amazónicos"},
      {"src":"/images/stores/donde-joel/menus/carta-03.jpg","caption":"Carta 3: tequeños, alitas, parrillas y familiares"},
      {"src":"/images/stores/donde-joel/menus/carta-04.jpg","caption":"Carta 4: bebidas e infusiones"}
    ]'::jsonb,
    true,
    null,
    array['Cevichería','Fast food','Pollo','Parrillas','Amazónico'],
    false,
    true,
    false,
    'Carta transcrita de cuatro imágenes suministradas. Ubicación, horario, tarifa de entrega, pedido mínimo, tiempos y disponibilidad están por confirmar. Los valores operativos numéricos son marcadores técnicos exigidos por el esquema y no representan servicio gratis ni tiempos confirmados. Pedidos desactivados.',
    null
  ) on conflict (id) do update set
    slug = excluded.slug,
    category_id = excluded.category_id,
    name = excluded.name,
    description = excluded.description,
    phone = excluded.phone,
    address = excluded.address,
    delivery_fee = excluded.delivery_fee,
    minimum_order = excluded.minimum_order,
    eta_min_minutes = excluded.eta_min_minutes,
    eta_max_minutes = excluded.eta_max_minutes,
    schedule = excluded.schedule,
    theme = excluded.theme,
    image_url = excluded.image_url,
    logo_url = excluded.logo_url,
    gallery = excluded.gallery,
    active = excluded.active,
    verified_at = excluded.verified_at,
    tags = excluded.tags,
    featured = excluded.featured,
    local_business = excluded.local_business,
    accepting_orders = excluded.accepting_orders,
    data_note = excluded.data_note,
    promo_label = excluded.promo_label;

  with source(source_key, section, name, description, price, sort_order) as (
    values
      ('p01-001','Marinos','Arroz con mariscos','',25.00,10),
      ('p01-002','Marinos','Tiradito clásico','',30.00,20),
      ('p01-003','Marinos','Leche de tigre','',12.00,30),
      ('p01-004','Marinos','Chicharrón de pescado','',25.00,40),
      ('p01-005','Marinos','Chicharrón de caballa','',25.00,50),
      ('p01-006','Criollos','Seco de chavelo','',25.00,60),
      ('p01-007','Criollos','Majado de yuca','',25.00,70),
      ('p01-008','Criollos','Seco de chavelo + costillas','',35.00,80),
      ('p01-009','Criollos','Majado de yuca + costillas','',35.00,90),
      ('p01-010','Rondas','Criolla','Majado de yuca, chorizo, costillas y seco de chavelo.',60.00,100),
      ('p01-011','Rondas','Marina','Arroz con marisco, ceviche y chicharrones de pescado.',65.00,110),
      ('p01-012','Rondas','Ronda Amazónica','2 bolas de tacacho con cecina, chaufa amazónico, cecina, chorizo, patacones, plátano maduro y 5 alitas BBQ o acevichadas.',75.00,120),
      ('p01-013','Rondas','Mar y Tierra','Arroz con marisco, majado de yuca, ceviche de filete y seco de chavelo.',95.00,130),

      ('p02-001','Salchipapas','Salchipapa clásica','Salchicha ahumada, papas, queso cheddar y cremas.',14.00,140),
      ('p02-002','Salchipapas','Salchipollo','Salchicha ahumada, pollo, papas y cremas.',18.00,150),
      ('p02-003','Salchipapas','Salchi mixta','Salchicha ahumada, chorizo, papas y cremas.',15.00,160),
      ('p02-004','Salchipapas','Salchibrasa','Salchicha ahumada, 1/8 de pollo a la brasa, papas y cremas.',19.00,170),
      ('p02-005','Salchipapas','Salchibrasón','Salchicha ahumada, 1/4 de pollo a la brasa, papas y cremas.',24.00,180),
      ('p02-006','Salchipapas','Salchipapa a lo pobre','Salchicha ahumada, huevo, plátano frito, papas y cremas.',18.00,190),
      ('p02-007','Salchipapas','Salchipapa amazónica','Salchicha, cecina, papas, ensalada y cremas.',20.00,200),
      ('p02-008','Brochetas','Brocheta de pollo','',20.00,210),
      ('p02-009','Brochetas','Brocheta de lomo fino','',24.00,220),
      ('p02-010','Brochetas','Brocheta de chancho','',22.00,230),
      ('p02-011','Chaufas','Chaufa de pollo','',13.00,240),
      ('p02-012','Chaufas','Chaufa a lo pobre','',16.00,250),
      ('p02-013','Chaufas','Chaufa de chancho','',14.00,260),
      ('p02-014','Chaufas','Chaufa de carne','',14.00,270),
      ('p02-015','Chaufas','Chaufa mixto','',15.00,280),
      ('p02-016','Chaufas','Chaufa especial','',18.00,290),
      ('p02-017','Chaufas','Chaufa amazónico','',20.00,300),
      ('p02-018','Chaufas','Chaufa de langostino','',22.00,310),
      ('p02-019','Pollo broaster','1/8 de pollo broaster','',12.00,320),
      ('p02-020','Pollo broaster','1/4 de pollo broaster','',20.00,330),
      ('p02-021','Pollo broaster','1/2 pollo broaster','',32.00,340),
      ('p02-022','Pollo broaster','1 pollo broaster','',55.00,350),
      ('p02-023','Adicionales','1 alita','',3.00,360),
      ('p02-024','Adicionales','Huevo','',2.00,370),
      ('p02-025','Adicionales','Queso cheddar','',2.50,380),
      ('p02-026','Adicionales','Porción de papa','',10.00,390),
      ('p02-027','Adicionales','Plátano','',2.00,400),
      ('p02-028','Adicionales','Chorizo','',2.50,410),
      ('p02-029','Adicionales','Porción de chaufa','',5.00,420),
      ('p02-030','Costillas','Costillas BBQ con patacones','',27.00,430),
      ('p02-031','Costillas','Costillas con patacones','',25.00,440),
      ('p02-032','De la selva','Canastitas amazónicas (10 und.)','',22.00,450),
      ('p02-033','De la selva','Tacacho con cecina y chorizo','',25.00,460),
      ('p02-034','De la selva','Plátano asado con cecina + queso','',12.00,470),
      ('p02-035','De la selva','Plátano asado + cecina + chorizo + queso','',14.00,480),
      ('p02-036','De la selva','Chorizo + cecina + patacones + chifles','',25.00,490),
      ('p02-037','De la selva','Chaufa amazónico + cecina','',30.00,500),
      ('p02-038','De la selva','Chaufa amazónico + cecina y chorizo','',35.00,510),
      ('p02-039','De la selva','Mix Amazónico','Chaufa amazónico, tacacho con cecina y chorizo.',45.00,520),
      ('p02-040','Mostrito brasa','Mostrito brasa 1/8 de pollo','',15.00,530),
      ('p02-041','Mostrito brasa','Mostrito brasa 1/4 de pollo','',20.00,540),
      ('p02-042','Mostrito brasa','Mostrito brasa 1/2 pollo','',38.00,550),
      ('p02-043','Mostrito broaster','Mostrito broaster 1/8 de pollo','',16.00,560),
      ('p02-044','Mostrito broaster','Mostrito broaster 1/4 de pollo','',21.00,570),

      ('p03-001','Tequeños','Tequeños de jamón y queso','',16.00,580),
      ('p03-002','Tequeños','Tequeños de pollo','',17.00,590),
      ('p03-003','Tequeños','Tequeños de lomo','',18.00,600),
      ('p03-004','Tequeños','Tequeños de chancho','',18.00,610),
      ('p03-005','Tequeños','Tequeños de cecina','',20.00,620),
      ('p03-006','Alitas','Alitas fritas','',20.00,630),
      ('p03-007','Alitas','Alitas BBQ','',20.00,640),
      ('p03-008','Alitas','Alitas acevichadas','',20.00,650),
      ('p03-009','Alitas','Alitas broaster','',21.00,660),
      ('p03-010','Alitas','Alitas BBQ picante','',22.00,670),
      ('p03-011','Alitas','Alitas acevichadas picante','',22.00,680),
      ('p03-012','Alitas','Alitas picantes','',20.00,690),
      ('p03-013','Alitas','Alitas broaster en salsa BBQ','',24.00,700),
      ('p03-014','Alitas','Alitas golf','',21.00,710),
      ('p03-015','Alitas','Alitas cheddar','',22.00,720),
      ('p03-016','Alitas','Alitas al limón','',22.00,730),
      ('p03-017','Alitas','Alitas parmesanas','',22.00,740),
      ('p03-018','Alitas','Alitas BBQ con patacones','',22.00,750),
      ('p03-019','Alitas','Alitas guacamole','',22.00,760),
      ('p03-020','Enchiladas','Enchilada clásica de pollo','',10.00,770),
      ('p03-021','Enchiladas','Enchilada de carne','',12.00,780),
      ('p03-022','Enchiladas','Enchilada de chancho','',12.00,790),
      ('p03-023','Enchiladas','Enchilada mixta','',15.00,800),
      ('p03-024','Enchiladas','Enchilada de pollo y cheddar','',13.00,810),
      ('p03-025','Enchiladas','Enchilada de pollo y chorizo','',13.00,820),
      ('p03-026','Parrillas','Mollejitas','Acompañadas de papas, ensalada y cremas.',14.00,830),
      ('p03-027','Parrillas','Chorizo parrillero','Acompañado de papas, ensalada y cremas.',12.00,840),
      ('p03-028','Parrillas','Parrilla de pollo','Acompañada de papas, ensalada y cremas.',15.00,850),
      ('p03-029','Parrillas','Pollo + chorizo','Acompañados de papas, ensalada y cremas.',17.00,860),
      ('p03-030','Parrillas','Res','Acompañada de papas, ensalada y cremas.',18.00,870),
      ('p03-031','Parrillas','Res + chorizo','Acompañados de papas, ensalada y cremas.',20.00,880),
      ('p03-032','Parrillas','Chancho','Acompañado de papas, ensalada y cremas.',18.00,890),
      ('p03-033','Parrillas','Chancho + chorizo','Acompañados de papas, ensalada y cremas.',20.00,900),
      ('p03-034','Parrillas','Chanchoholi','Acompañado de papas, ensalada y cremas.',16.00,910),
      ('p03-035','Parrillas','Pechuga de pollo a la parrilla','Acompañada de papas, ensalada y cremas.',18.00,920),
      ('p03-036','Familiares','Familiar S/ 75','1 res, 2 chancho, 1 parrilla de pollo, 1/4 pollo a la brasa y 2 chorizos. Acompañado de papas, ensalada y cremas.',75.00,930),
      ('p03-037','Familiares','Familiar S/ 117','2 res, 2 chancho, 1 parrilla de pollo, 1/2 pollo a la brasa, mollejitas, 2 chorizos y 6 alitas. Acompañado de papas, ensalada y cremas.',117.00,940),
      ('p03-038','Familiares','Familiar S/ 150','2 res, 2 chancho, 1 pollo a la parrilla, 1 pollo a la brasa, mollejitas, 6 alitas, 2 chorizos y 2 porciones de papa.',150.00,950),
      ('p03-039','Familiares','Familiar S/ 185','2 res, 2 chancho, 2 parrillas de pollo, 1 pollo a la brasa, mollejitas, 10 alitas, 4 chorizos, 2 porciones de papa y gaseosa de 1 L de regalo.',185.00,960),
      ('p03-040','Combos','Combo para 3','Parrilla de pollo, res y chancho.',40.00,970),
      ('p03-041','Combos','Combo para 4','Parrilla de pollo, res, chancho, chorizo y mollejitas.',50.00,980),
      ('p03-042','Combos','Combo para 5','Parrilla de pollo, res, chancho, 1/4 pollo a la brasa, mollejitas y 2 chorizos.',62.00,990),
      ('p03-043','Combos','Combo Amigos','8 alitas, costillas, pollo a la parrilla, 2 porciones de chaufa, papa, ensalada y cremas.',65.00,1000),
      ('p03-044','Hamburguesas','Hamburguesa de carne','',5.00,1010),
      ('p03-045','Hamburguesas','Hamburguesa de pollo','',6.00,1020),
      ('p03-046','Hamburguesas','Hamburguesa de pollo a la brasa','',6.00,1030),
      ('p03-047','Hamburguesas','Sándwich de pollo','',6.00,1040),

      ('p04-001','Bebidas','Agua sabor manzana','',3.00,1050),
      ('p04-002','Bebidas','Inka Cola 1 L','',6.50,1060),
      ('p04-003','Bebidas','Coca-Cola 1 L','',6.50,1070),
      ('p04-004','Bebidas','Inka Cola 500 ml','',4.00,1080),
      ('p04-005','Bebidas','Coca-Cola 500 ml','',4.00,1090),
      ('p04-006','Bebidas','Pepsi 355 ml','',2.00,1100),
      ('p04-007','Bebidas','Inka Cola 2 L','',12.00,1110),
      ('p04-008','Bebidas','Sporade','',4.00,1120),
      ('p04-009','Bebidas','Pepsi 1 L','',5.00,1130),
      ('p04-010','Bebidas','Triple Kola 1.5 L','',6.00,1140),
      ('p04-011','Jarras','Jarra de piña 1 L','',15.00,1150),
      ('p04-012','Jarras','1/2 jarra de piña','',10.00,1160),
      ('p04-013','Jarras','Jarra de chicha morada 1 L','',12.00,1170),
      ('p04-014','Jarras','1/2 jarra de chicha morada','',8.00,1180),
      ('p04-015','Jarras','Jarra de maracuyá 1 L','',15.00,1190),
      ('p04-016','Jarras','1/2 jarra de maracuyá','',10.00,1200),
      ('p04-017','Jarras','Jarra de limonada clásica 1 L','',12.00,1210),
      ('p04-018','Jarras','1/2 jarra de limonada clásica','',8.00,1220),
      ('p04-019','Jarras','Jarra de limonada frozen 1 L','',18.00,1230),
      ('p04-020','Jarras','1/2 jarra de limonada frozen','',12.00,1240),
      ('p04-021','Jarras','Jarra de maracuyá frozen 1 L','',18.00,1250),
      ('p04-022','Jarras','1/2 L de maracuyá frozen','',12.00,1260),
      ('p04-023','Jarras','Jarra de fresa 1 L','',16.00,1270),
      ('p04-024','Jarras','1/2 jarra de fresa','',10.00,1280),
      ('p04-025','Jarras','Jarra de fresa con leche 1 L','',18.00,1290),
      ('p04-026','Jarras','1/2 jarra de fresa con leche','',12.00,1300),
      ('p04-027','Infusiones','Manzanilla','',3.00,1310),
      ('p04-028','Infusiones','Té','',3.00,1320),
      ('p04-029','Infusiones','Café','',3.00,1330)
  )
  insert into public.products (
    id, restaurant_id, section, name, description, price, image_url,
    image_is_stock, popular, extras, active, sort_order
  )
  select
    md5('suya:donde-joel:' || source_key)::uuid,
    restaurant_id,
    section,
    name,
    description,
    price,
    null,
    false,
    false,
    '[]'::jsonb,
    true,
    sort_order
  from source
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

  insert into public.restaurant_menu_settings (
    restaurant_id, public_slug, published, logo_url, hero_image_url,
    primary_color, accent_color, font_family
  ) values (
    restaurant_id,
    'donde-joel-menu',
    true,
    null,
    '/images/stores/donde-joel/menus/carta-01.jpg',
    '#0647A9',
    '#FF7A00',
    'DM Sans'
  ) on conflict (restaurant_id) do update set
    public_slug = excluded.public_slug,
    published = excluded.published,
    logo_url = excluded.logo_url,
    hero_image_url = excluded.hero_image_url,
    primary_color = excluded.primary_color,
    accent_color = excluded.accent_color,
    font_family = excluded.font_family;

  -- La quinta imagen se muestra como referencia en Andá Paya, sin tocar sus productos ni precios.
  update public.restaurants
  set gallery = gallery || jsonb_build_array(jsonb_build_object(
        'src', '/images/stores/anda-paya/menus/carta-2026-09-06.jpg',
        'caption', 'Carta recibida el 06/09/2026 · precios pendientes de conciliación'
      )),
      data_note = 'Catálogo activo basado en la carta previamente verificada. La carta recibida el 06/09/2026 se muestra como referencia; sus precios están pendientes de conciliación comercial.'
  where id = '20000000-0000-4000-8000-000000000001'
    and not exists (
      select 1
      from jsonb_array_elements(gallery) item
      where item->>'src' = '/images/stores/anda-paya/menus/carta-2026-09-06.jpg'
    );
end $$;
