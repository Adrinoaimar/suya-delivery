# Activos de marca de restaurantes

Estado de incorporación: 11 de septiembre de 2026 (`America/Lima`). La autorización comercial
permite publicar las cartas y activos entregados, pero no convierte un dibujo recreado en logotipo
oficial.

| Restaurante | Activo usado | Procedencia | Estado |
|---|---|---|---|
| El Tío Jhony | `public/brand/stores/tio-jhony-logo.webp` y galerías | Material y web oficial: <https://www.eltiojhony.com/> | Publicado |
| La Waka Fast Food | `public/brand/stores/la-waka-logo.svg` | Marca del negocio; referencia pública: <https://lawakachicken.com/newlogo.png> | Publicado |
| Donde Joel | `public/images/stores/donde-joel/logo.png` y cuatro cartas | Imágenes suministradas por el negocio | Publicado como carta informativa, con logo en ficha y menú |
| Andá Paya | `public/brand/stores/anda-paya-logo.webp` y carta original `public/images/stores/anda-paya/menus/carta-2026-09-06.jpg` | Encabezado de la carta suministrada por el negocio; autorización comercial recibida | Publicado |

El catálogo local también deja cubiertas las fichas de demostración que antes mostraban solo una
inicial. KFC, Papa John's, Tottus e Inkafarma usan activos públicos oficiales; sus fuentes y
fechas están en `public/brand/stores/CREDITS.md`. El Buen Sabor, Don Pizza, Dulce Tentación,
Verde Fresh, Market Ahorro, Flores del Chira y Mundo Feliz usan marcas tipográficas de catálogo,
identificadas como reemplazables hasta recibir el maestro de cada negocio. Esto mejora la tarjeta,
la ficha y la vista de Suya Menús sin convertir datos de demostración en un catálogo productivo.

Andá Paya no usa el SVG de demostración anterior. La tarjeta y la ficha usan el logo derivado del
encabezado de la carta autorizada; la carta original permanece en la galería para lectura. El
backoffice permite cargar JPG, PNG o WebP y reemplazar el activo desde `Catálogo y publicación`.

## Reglas de publicación

- Las rutas locales pasan por `assetUrl` para respetar bases de despliegue.
- Las imágenes de galería pueden servir como identidad visual temporal; nunca se etiquetan como
  logo oficial.
- Precios, horarios, delivery y pedidos siguen sus gates comerciales propios.
