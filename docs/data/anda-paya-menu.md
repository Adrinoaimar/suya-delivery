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

## Carta JPG recibida el 6 de septiembre de 2026

- Copia sin alterar: `public/images/stores/anda-paya/menus/carta-2026-09-06.jpg`.
- SHA-256: `01C6706F2EE4C6850784DB3206C319695D522CB369B67966E5A70EFC494284B9`.
- La pieza muestra teléfono `917 289 119` y ubicación “Augusto Beleguia con Amotape segunda
  cuadra”, además de una carta resumida.
- La imagen se añadió a la galería con una advertencia visible de conciliación pendiente. Los 58
  productos y sus precios no se modificaron: varios nombres, precios y presentaciones difieren de
  la fuente de agosto. Ejemplos: seco de chavelo, chicharrón de pescado, chaufa de pollo,
  salchipapa, alitas y hamburguesas.
- Pendiente: confirmar con el negocio cuál carta está vigente y si teléfono/ubicación reemplazan
  los datos operativos anteriores. Hasta esa confirmación, la nueva imagen queda solo como
  evidencia de procedencia, sin afectar el catálogo vivo.
