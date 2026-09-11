# Activos de marca de restaurantes

Estado de incorporación: 11 de septiembre de 2026 (`America/Lima`). La autorización comercial
permite publicar las cartas y activos entregados, pero no convierte un dibujo recreado en logotipo
oficial.

| Restaurante | Activo usado | Procedencia | Estado |
|---|---|---|---|
| El Tío Jhony | `public/brand/stores/tio-jhony-logo.webp` y galerías | Material y web oficial: <https://www.eltiojhony.com/> | Publicado |
| La Waka Fast Food | `public/brand/stores/la-waka-logo.svg` | Marca del negocio; referencia pública: <https://lawakachicken.com/newlogo.png> | Publicado |
| Donde Joel | `public/images/stores/donde-joel/logo.png` y cuatro cartas | Imágenes suministradas por el negocio | Publicado como carta informativa |
| Andá Paya | Carta original `public/images/stores/anda-paya/menus/carta-2026-09-06.jpg` | Imagen suministrada por el negocio | Visible como galería; logo oficial pendiente de archivo final |

Andá Paya no usa el SVG de demostración anterior. La tarjeta muestra la carta original cuando no
existe logo, y la ficha conserva la galería para lectura. El backoffice permite cargar JPG, PNG o
WebP y publicar el logo real desde `Catálogo y publicación`; no se generan sustitutos.

## Reglas de publicación

- Las rutas locales pasan por `assetUrl` para respetar bases de despliegue.
- Las imágenes de galería pueden servir como identidad visual temporal; nunca se etiquetan como
  logo oficial.
- Precios, horarios, delivery y pedidos siguen sus gates comerciales propios.
