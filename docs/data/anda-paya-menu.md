# Fuente comercial: carta de Andá Paya

- Fuente primaria: PDF de 2 páginas suministrado por el usuario el 20 de agosto de 2026.
- Alcance confirmado: nombre comercial, categorías, nombres, composiciones visibles, precios y
  paleta rojo/negro/blanco.
- No visible: dirección exacta, teléfono, horario, coordenadas, tarifa de entrega, pedido mínimo y
  precios de bebidas.
- Regla de importación: no publicar valores ausentes. El restaurante se lista, pero
  `accepting_orders=false` hasta completar logística verificable.
- Bebidas documentadas sin precio y por ello no importadas: Cristal, Pilsen, Cusqueña negra,
  Cusqueña dorada, clarito, Inca Kola, Coca Cola y chicha morada.
- Los productos configurables "Mi King" conservan la descripción de 2/3/5 platos. Antes de aceptar
  pedidos deben migrarse a grupos de opciones con cardinalidad obligatoria.
- Alitas: sabores visibles: BBQ, acevichadas, broaster, anticucheras, maracuyá, picantes y al ajo.

La transcripción estructurada y sus 58 productos están en `supabase/seed.sql`. Los importes dobles
se representan como precio base y extra "Porción grande" por la diferencia exacta.
