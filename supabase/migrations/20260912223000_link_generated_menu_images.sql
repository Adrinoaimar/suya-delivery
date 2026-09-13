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

