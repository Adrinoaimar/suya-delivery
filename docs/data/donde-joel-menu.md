# Fuente comercial: cartas de Donde Joel

## Procedencia y alcance

- Fuente primaria: cuatro imágenes JPG suministradas por el usuario el 6 de septiembre de 2026.
- Copias sin alterar: `public/images/stores/donde-joel/menus/carta-01.jpg` a `carta-04.jpg`.
- Identidad asumida: las cuatro piezas se agrupan en un solo negocio por compartir nombre, isotipo,
  teléfono y línea gráfica. La relación entre “Donde Joel Cevichería” y “Donde Joel Fast Food” debe
  confirmarse antes de habilitar pedidos.
- Datos confirmados: nombre comercial, teléfono `939 876 935`, secciones, nombres, composiciones
  visibles, precios fijos y colores predominantes azul, naranja, amarillo, blanco y negro.
- Datos no visibles: dirección, coordenadas, horario, tarifa de entrega, pedido mínimo, tiempos,
  disponibilidad y reglas completas de opciones.

## Importación

- Migración idempotente: `supabase/migrations/20260906230000_donde_joel_menu_cards.sql`.
- Restaurante determinista: `23000000-0000-4000-8000-000000000001`, slug `donde-joel`.
- 133 conceptos con precio fijo: carta 1, 13; carta 2, 44; carta 3, 47; carta 4, 29.
- IDs de producto: UUID determinista calculado desde la clave de origen estable de cada línea.
- Catálogo visible: `active=true`, menú público publicado, cuatro imágenes en `gallery`.
- Pedidos bloqueados: `accepting_orders=false`.

## Exclusiones y bloqueos

- Carta 1: cuatro ceviches con varios precios sin nombre de tamaño; cuatro dúos que exigen elegir
  filete o caballa.
- Carta 2: tres mostritos de alitas que exigen elegir preparación o sabor; pollo a la brasa sin
  precio visible.
- Carta 3: Dúo, Fiesta y Festival de alitas por selección obligatoria de sabores; combo “Para 2”
  por elección abierta de cualquier parrilla.
- Carta 4: agua “sin/con gas” por variante sin precio separado; cuatro cervezas y seis tragos por
  tratarse de alcohol.
- No se crearon descripciones cuando la fuente solo mostraba nombre y precio. No se recreó el logo.
- El esquema exige números no nulos para envío, mínimo y ETA. Los valores almacenados son marcadores
  técnicos, identificados en `data_note`; no significan envío gratis ni tiempos confirmados.

## Integridad de archivos

- `carta-01.jpg`: `B3089AFE054B368DE76AD06C1914862801509AB5658B750446E5234AA9C3A512`
- `carta-02.jpg`: `CDC1797E9DFAFF69B6BAB3842151117E0009C1827B8254745B0F2EEA052A102E`
- `carta-03.jpg`: `534EC71BCB1A661C0D51AD2ADF79E55681D410EE85E93C18AA065F8C62C15BF8`
- `carta-04.jpg`: `867FCADD46243127E0AD4702ECFDD7A41732DAB8796C7B980BB183778B3BC2DF`
