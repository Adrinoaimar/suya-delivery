-- Publicación verificable de El Tío Jhony.
-- Fuente Tío: src/data/stores.json y src/data/products.json.
-- Fuente La Waka: https://www.lawaka.com.pe/ (datos mínimos entregados/verificados).
do $$
declare category_id uuid;
begin
  insert into public.categories (id, slug, name, icon, accent, sort_order, active)
  values ('10000000-0000-4000-8000-000000000001', 'restaurantes', 'Restaurantes', 'utensils', 'green', 10, true)
  on conflict (id) do update set slug = excluded.slug, name = excluded.name, icon = excluded.icon, accent = excluded.accent, active = true;

  select id into category_id from public.categories where slug = 'restaurantes' limit 1;
  if category_id is null then raise exception 'Falta categoría restaurantes'; end if;

  insert into public.restaurants (
    id, slug, category_id, name, description, phone, address, delivery_fee,
    minimum_order, eta_min_minutes, eta_max_minutes, schedule, theme,
    image_url, logo_url, gallery, active, verified_at, tags, featured,
    local_business, accepting_orders, data_note, promo_label
  ) values (
    '21000000-0000-4000-8000-000000000001', 'tio-jhony', category_id,
    'El Tío Jhony',
    'Restaurante Peruano Turístico de la cadena sullanera El Tío Jhony: comida peruana tradicional, porciones bien servidas y ambiente familiar para compartir.',
    '+51 974 135 263', 'Av. Marcelino Champagnat 1108, Sullana', 5, 20, 30, 45,
    '{"opens":"12:00","closes":"23:30"}'::jsonb,
    '{"primary":"#8C1220","accent":"#D91E36","surface":"#FCEEEF","onPrimary":"#FFFFFF"}'::jsonb,
    '/images/stores/tio-jhony/fachada-champagnat.webp', '/brand/stores/tio-jhony-logo.webp',
    '[{"src":"/images/stores/tio-jhony/galeria/pescado-en-salsa.webp","caption":"Pescado en salsa con arroz"},{"src":"/images/stores/tio-jhony/galeria/sudado.webp","caption":"Sudado de la casa"}]'::jsonb,
    true, now(), array['Cevichería','Pollería','Parrillas'], true, true, true,
    'Carta y precios tomados del menú físico y de eltiojhony.com; el restaurante indica que precios pueden cambiar. Métricas, tiempo y envío requieren confirmación operativa.',
    '1 pollo entero + gaseosa 1.5 L: S/ 76'
  ) on conflict (id) do update set
    category_id=excluded.category_id,name=excluded.name,description=excluded.description,
    phone=excluded.phone,address=excluded.address,delivery_fee=excluded.delivery_fee,
    minimum_order=excluded.minimum_order,eta_min_minutes=excluded.eta_min_minutes,
    eta_max_minutes=excluded.eta_max_minutes,schedule=excluded.schedule,theme=excluded.theme,
    image_url=excluded.image_url,logo_url=excluded.logo_url,gallery=excluded.gallery,
    active=excluded.active,verified_at=excluded.verified_at,tags=excluded.tags,
    featured=excluded.featured,local_business=excluded.local_business,
    accepting_orders=excluded.accepting_orders,data_note=excluded.data_note,promo_label=excluded.promo_label;

  insert into public.products (id, restaurant_id, section, name, description, price, image_url, image_is_stock, popular, extras, active, sort_order)
  values
  ('22000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000001','Para compartir','Trío marino','Ceviche + arroz con mariscos + chicharrón de pescado. Para compartir.',60,'/images/stores/tio-jhony/ceviche-mixto.webp',false,true,'[]',true,10),
  ('22000000-0000-4000-8000-000000000002','21000000-0000-4000-8000-000000000001','Para compartir','Ronda marina sullanera','Ceviche de pescado + ceviche de caballa + chicharrón de pescado + arroz con mariscos.',65,'/images/stores/tio-jhony/ceviche-mixto.webp',false,true,'[]',true,20),
  ('22000000-0000-4000-8000-000000000003','21000000-0000-4000-8000-000000000001','Para compartir','Ronda norteña (personal)','Seco de chavelo + majado de yuca + carne aliñada + costillas + rellena + chifles + cancha + sarza.',75,'/images/stores/tio-jhony/ronda-nortena.webp',false,false,'[]',true,30),
  ('22000000-0000-4000-8000-000000000004','21000000-0000-4000-8000-000000000001','Entradas','Leche de tigre','Jugo de la casa con pescado, limón y ají limo.',18,null,false,true,'[]',true,40),
  ('22000000-0000-4000-8000-000000000005','21000000-0000-4000-8000-000000000001','Entradas','Tequeños de queso (8 u.)','Ocho tequeños crocantes recién fritos.',28,null,false,false,'[]',true,50),
  ('22000000-0000-4000-8000-000000000006','21000000-0000-4000-8000-000000000001','Entradas','Alitas crocantes','Con papas fritas y salsa de limón. También disponibles picantes, a la maracuyá, BBQ o acevichadas.',30,null,false,true,'[]',true,60),
  ('22000000-0000-4000-8000-000000000007','21000000-0000-4000-8000-000000000001','Entradas','Festival de alitas','Selección surtida de alitas de la casa para compartir.',60,null,false,false,'[]',true,70),
  ('22000000-0000-4000-8000-000000000008','21000000-0000-4000-8000-000000000001','Ceviches','Ceviche filete (personal)','Pescado fresco cortado al momento, con choclo y camote.',25,'/images/stores/tio-jhony/ceviche-pescado.webp',false,true,'[]',true,80),
  ('22000000-0000-4000-8000-000000000009','21000000-0000-4000-8000-000000000001','Ceviches','Ceviche de caballa (personal)','Caballa fresca marinada en limón, cebolla morada y ají.',30,'/images/stores/tio-jhony/ceviche-pescado.webp',false,false,'[]',true,90),
  ('22000000-0000-4000-8000-000000000010','21000000-0000-4000-8000-000000000001','Ceviches','Conchas negras (personal)','Conchas negras del manglar, especialidad del norte.',40,null,false,false,'[]',true,100),
  ('22000000-0000-4000-8000-000000000011','21000000-0000-4000-8000-000000000001','Ceviches','Ceviche El Tío Jhony (personal)','Filete, mixtura y cangrejo. La especialidad de la casa.',50,'/images/stores/tio-jhony/ceviche-mixto.webp',false,true,'[]',true,110),
  ('22000000-0000-4000-8000-000000000012','21000000-0000-4000-8000-000000000001','Ceviches','Ceviche triple (personal)','Pescado, conchas negras y langostinos.',50,'/images/stores/tio-jhony/ceviche-mixto.webp',false,false,'[]',true,120),
  ('22000000-0000-4000-8000-000000000013','21000000-0000-4000-8000-000000000001','Marinos','Tiradito de pescado','Con camote, yuca, cancha y chifles.',30,null,false,false,'[]',true,130),
  ('22000000-0000-4000-8000-000000000014','21000000-0000-4000-8000-000000000001','Marinos','Jalea de cachema (personal)','Pescado frito acompañado de yuca, cancha y salsa criolla.',25,null,false,false,'[]',true,140),
  ('22000000-0000-4000-8000-000000000015','21000000-0000-4000-8000-000000000001','Marinos','Chicharrón de pescado (personal)','Trozos de pescado apanado y frito, servido con guarniciones.',28,null,false,true,'[]',true,150),
  ('22000000-0000-4000-8000-000000000016','21000000-0000-4000-8000-000000000001','Marinos','Parihuela (personal)','Caldo marino cargado de pescado y mariscos.',55,null,false,false,'[]',true,160),
  ('22000000-0000-4000-8000-000000000017','21000000-0000-4000-8000-000000000001','Pollo a la brasa','Pollo a la brasa entero','Con papas fritas, ensalada y cremas de la casa.',72,'/images/stores/tio-jhony/pollo-a-la-brasa.webp',false,true,'[]',true,170),
  ('22000000-0000-4000-8000-000000000018','21000000-0000-4000-8000-000000000001','Pollo a la brasa','Medio pollo a la brasa','Con papas fritas, ensalada y cremas de la casa.',42,'/images/stores/tio-jhony/pollo-a-la-brasa.webp',false,true,'[]',true,180),
  ('22000000-0000-4000-8000-000000000019','21000000-0000-4000-8000-000000000001','Pollo a la brasa','Cuarto de pollo a la brasa','Con papas fritas, ensalada y cremas de la casa.',25,'/images/stores/tio-jhony/pollo-a-la-brasa.webp',false,false,'[]',true,190),
  ('22000000-0000-4000-8000-000000000020','21000000-0000-4000-8000-000000000001','Pollo broaster','Pollo broaster entero','Con papas fritas, ensalada y cremas de la casa.',75,null,false,false,'[]',true,200),
  ('22000000-0000-4000-8000-000000000021','21000000-0000-4000-8000-000000000001','Pollo broaster','Medio pollo broaster','Con papas fritas, ensalada y cremas de la casa.',44,null,false,false,'[]',true,210),
  ('22000000-0000-4000-8000-000000000022','21000000-0000-4000-8000-000000000001','De la parrilla','Parrilla personal','1 brocheta + 1 anticucho + 1 chuleta + 1 chorizo.',70,null,false,true,'[]',true,220),
  ('22000000-0000-4000-8000-000000000023','21000000-0000-4000-8000-000000000001','De la parrilla','Parrilla familiar','2 brochetas + 2 anticuchos + 10 mollejitas + 2 churrascos + 2 chorizos + 2 chuletas + medio pollo a la brasa.',200,null,false,true,'[]',true,230),
  ('22000000-0000-4000-8000-000000000024','21000000-0000-4000-8000-000000000001','De la parrilla','Churrasco','Corte de res a la parrilla.',38,null,false,false,'[]',true,240),
  ('22000000-0000-4000-8000-000000000025','21000000-0000-4000-8000-000000000001','Criollos','Seco de chavelo (personal)','Plátano majado con carne, plato tradicional piurano.',35,'/images/stores/tio-jhony/ronda-nortena.webp',false,true,'[]',true,250),
  ('22000000-0000-4000-8000-000000000026','21000000-0000-4000-8000-000000000001','Criollos','Majado de yuca (personal)','Yuca majada con chicharrón y salsa criolla.',35,'/images/stores/tio-jhony/ronda-nortena.webp',false,false,'[]',true,260),
  ('22000000-0000-4000-8000-000000000027','21000000-0000-4000-8000-000000000001','Criollos','Lomo saltado de carne','Salteado con cebolla, tomate y papas fritas.',30,null,false,true,'[]',true,270),
  ('22000000-0000-4000-8000-000000000028','21000000-0000-4000-8000-000000000001','Guarniciones','Porción de papas fritas','Guarnición para compartir.',15,null,false,false,'[]',true,280),
  ('22000000-0000-4000-8000-000000000029','21000000-0000-4000-8000-000000000001','Guarniciones','Ensalada','Ensalada fresca de la casa.',10,null,false,false,'[]',true,290),
  ('22000000-0000-4000-8000-000000000030','21000000-0000-4000-8000-000000000001','Jugos y bebidas','Chicha morada (vaso)','Preparada en casa, servida bien fría.',7,'/images/stores/tio-jhony/chicha-morada.webp',false,true,'[]',true,300),
  ('22000000-0000-4000-8000-000000000031','21000000-0000-4000-8000-000000000001','Jugos y bebidas','Limonada frozen (vaso)','Limón exprimido, bien helada.',8,null,false,false,'[]',true,310),
  ('22000000-0000-4000-8000-000000000032','21000000-0000-4000-8000-000000000001','Jugos y bebidas','Jugo de piña (vaso)','Piña natural licuada.',8,null,false,false,'[]',true,320),
  ('22000000-0000-4000-8000-000000000033','21000000-0000-4000-8000-000000000001','Jugos y bebidas','Gaseosa 1.5 L','Inca Kola o Coca-Cola.',11,null,false,false,'[]',true,330)
  on conflict (id) do update set restaurant_id=excluded.restaurant_id,section=excluded.section,name=excluded.name,description=excluded.description,price=excluded.price,image_url=excluded.image_url,image_is_stock=excluded.image_is_stock,popular=excluded.popular,extras=excluded.extras,active=excluded.active,sort_order=excluded.sort_order;

  insert into public.restaurant_menu_settings (restaurant_id, public_slug, published, logo_url, hero_image_url, primary_color, accent_color, font_family)
  values ('21000000-0000-4000-8000-000000000001','tio-jhony-menu',true,'/brand/stores/tio-jhony-logo.webp','/images/stores/tio-jhony/fachada-champagnat.webp','#8C1220','#D91E36','DM Sans')
  on conflict (restaurant_id) do update set public_slug=excluded.public_slug,published=excluded.published,logo_url=excluded.logo_url,hero_image_url=excluded.hero_image_url,primary_color=excluded.primary_color,accent_color=excluded.accent_color,font_family=excluded.font_family;

  insert into public.restaurants (
    id, slug, category_id, name, description, phone, address, delivery_fee,
    minimum_order, eta_min_minutes, eta_max_minutes, schedule, theme,
    image_url, logo_url, gallery, active, verified_at, tags, featured,
    local_business, accepting_orders, data_note, promo_label
  ) values (
    '21000000-0000-4000-8000-000000000002', 'la-waka', category_id,
    'La Waka Fast Food',
    'Fast food y pollo a la brasa en Sullana. Carta en actualización; confirma disponibilidad al realizar tu pedido.',
    '073-364222 / 955598804', 'Av. Champagnat 968, Sullana', 0, 0, 25, 45,
    '{}'::jsonb, '{"primary":"#111111","accent":"#F2C94C","surface":"#FFF9E8","onPrimary":"#FFFFFF"}'::jsonb,
    null, 'https://www.lawaka.com.pe/lawaka.png', '[]'::jsonb, true, now(),
    array['Fast Food','Pollo a la brasa'], true, true, true,
    'Datos mínimos y productos tomados del sitio oficial https://www.lawaka.com.pe/. Carta en actualización; horarios, tarifa y fotografías de platos quedan por confirmar.',
    null
  ) on conflict (id) do update set
    category_id=excluded.category_id,name=excluded.name,description=excluded.description,
    phone=excluded.phone,address=excluded.address,delivery_fee=excluded.delivery_fee,
    minimum_order=excluded.minimum_order,eta_min_minutes=excluded.eta_min_minutes,
    eta_max_minutes=excluded.eta_max_minutes,schedule=excluded.schedule,theme=excluded.theme,
    image_url=excluded.image_url,logo_url=excluded.logo_url,gallery=excluded.gallery,
    active=excluded.active,verified_at=excluded.verified_at,tags=excluded.tags,
    featured=excluded.featured,local_business=excluded.local_business,
    accepting_orders=excluded.accepting_orders,data_note=excluded.data_note,promo_label=excluded.promo_label;

  insert into public.products (id, restaurant_id, section, name, description, price, image_url, image_is_stock, popular, extras, active, sort_order)
  values
  ('22000000-0000-4000-8000-000000000034','21000000-0000-4000-8000-000000000002','Promociones','Pollo a la Brasa + Gaseosa','Promoción publicada por La Waka.',35,null,false,true,'[]',true,10),
  ('22000000-0000-4000-8000-000000000035','21000000-0000-4000-8000-000000000002','Platos','Arroz Chaufa o Tallarín Saltado','Elige una de las dos opciones indicadas en la carta oficial.',9,null,false,false,'[]',true,20),
  ('22000000-0000-4000-8000-000000000036','21000000-0000-4000-8000-000000000002','Promociones','1 Pollo a la Brasa + Arroz Chaufa','Promoción publicada por La Waka.',55,null,false,true,'[]',true,30)
  on conflict (id) do update set restaurant_id=excluded.restaurant_id,section=excluded.section,name=excluded.name,description=excluded.description,price=excluded.price,image_url=excluded.image_url,image_is_stock=excluded.image_is_stock,popular=excluded.popular,extras=excluded.extras,active=excluded.active,sort_order=excluded.sort_order;

  insert into public.restaurant_menu_settings (restaurant_id, public_slug, published, logo_url, hero_image_url, primary_color, accent_color, font_family)
  values ('21000000-0000-4000-8000-000000000002','la-waka-menu',true,'https://www.lawaka.com.pe/lawaka.png',null,'#111111','#F2C94C','DM Sans')
  on conflict (restaurant_id) do update set public_slug=excluded.public_slug,published=excluded.published,logo_url=excluded.logo_url,hero_image_url=excluded.hero_image_url,primary_color=excluded.primary_color,accent_color=excluded.accent_color,font_family=excluded.font_family;
end $$;
