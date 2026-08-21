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
  null, null, '[]'::jsonb, true, now(),
  array['Comida norteña', 'Marinos', 'Criollo'], null, null, true, true, true,
  'Carta y precios suministrados por la empresa. Horario, dirección exacta, teléfono, tarifa de entrega y bebidas quedan por registrar.',
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

insert into public.products (
  id, restaurant_id, section, name, description, price, image_url, image_is_stock, popular, extras, active, sort_order
)
values
  ('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Marino','Chicharrón de pescado','',20,'/images/stores/anda-paya/chicharron-pescado.webp',true,false,'[{"id":"grande","label":"Porción grande","price":15}]',true,10),
  ('30000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','Marino','Sudado de cabrilla','',30,'/images/stores/anda-paya/sudado-pescado.webp',true,false,'[]',true,20),
  ('30000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000001','Marino','Parihuela','',40,'/images/stores/anda-paya/parihuela.webp',true,false,'[]',true,30),
  ('30000000-0000-4000-8000-000000000004','20000000-0000-4000-8000-000000000001','Marino','Chupe de cangrejo','',35,'/images/stores/anda-paya/chupe-cangrejo.webp',true,false,'[]',true,40),
  ('30000000-0000-4000-8000-000000000005','20000000-0000-4000-8000-000000000001','Marino','Chicharrón mixto','',35,'/images/stores/anda-paya/chicharron-mixto.webp',true,false,'[]',true,50),
  ('30000000-0000-4000-8000-000000000006','20000000-0000-4000-8000-000000000001','Marino','Jalea de cabrilla','',30,'/images/stores/anda-paya/jalea-mixta.webp',true,false,'[]',true,60),
  ('30000000-0000-4000-8000-000000000007','20000000-0000-4000-8000-000000000001','Marino','Cabrilla a lo macho','',40,'/images/stores/anda-paya/pescado-a-lo-macho.webp',true,false,'[]',true,70),
  ('30000000-0000-4000-8000-000000000008','20000000-0000-4000-8000-000000000001','Marino','Cabrilla al ajo','',30,null,false,false,'[]',true,80),
  ('30000000-0000-4000-8000-000000000009','20000000-0000-4000-8000-000000000001','Ceviche','Ceviche de filete del día','',20,'/images/stores/anda-paya/ceviche-peruano.webp',true,true,'[{"id":"grande","label":"Porción grande","price":15}]',true,90),
  ('30000000-0000-4000-8000-000000000010','20000000-0000-4000-8000-000000000001','Ceviche','Ceviche de caballa','',20,'/images/stores/anda-paya/ceviche-peruano.webp',true,false,'[{"id":"grande","label":"Porción grande","price":15}]',true,100),
  ('30000000-0000-4000-8000-000000000011','20000000-0000-4000-8000-000000000001','Ceviche','Ceviche de filete con caballa','',25,'/images/stores/anda-paya/ceviche-peruano.webp',true,false,'[{"id":"grande","label":"Porción grande","price":10}]',true,110),
  ('30000000-0000-4000-8000-000000000012','20000000-0000-4000-8000-000000000001','Ceviche','Ceviche de filete con mariscos','',25,'/images/stores/anda-paya/ceviche-mixto.webp',true,false,'[{"id":"grande","label":"Porción grande","price":10}]',true,120),
  ('30000000-0000-4000-8000-000000000013','20000000-0000-4000-8000-000000000001','Ceviche','Causa acevichada','',18,'/images/stores/anda-paya/causa-limena.webp',true,false,'[]',true,130),
  ('30000000-0000-4000-8000-000000000014','20000000-0000-4000-8000-000000000001','Ceviche','Canastas acevichadas','',20,null,false,false,'[]',true,140),
  ('30000000-0000-4000-8000-000000000015','20000000-0000-4000-8000-000000000001','Arroces','Arroz con mariscos','',20,'/images/stores/anda-paya/arroz-mariscos.webp',true,true,'[{"id":"grande","label":"Porción grande","price":15}]',true,150),
  ('30000000-0000-4000-8000-000000000016','20000000-0000-4000-8000-000000000001','Arroces','Chaufa de pollo','',10,'/images/stores/anda-paya/arroz-chaufa.webp',true,false,'[]',true,160),
  ('30000000-0000-4000-8000-000000000017','20000000-0000-4000-8000-000000000001','Arroces','Chaufa de chancho','',12,'/images/stores/anda-paya/arroz-chaufa.webp',true,false,'[]',true,170),
  ('30000000-0000-4000-8000-000000000018','20000000-0000-4000-8000-000000000001','Arroces','Chaufa de mariscos','',15,null,false,false,'[]',true,180),
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
