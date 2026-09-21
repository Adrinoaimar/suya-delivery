# Plan SEO de Suya Delivery

## P0 — aplicado

1. Publicar archivos reales `robots.txt` y `sitemap.xml`.
2. Añadir canonical, robots, Open Graph, Twitter Card y JSON-LD a la web cliente.
3. Excluir rutas privadas y operativas de indexación.
4. Corregir la jerarquía `h1` de tiendas y el texto del enlace de categorías.
5. Reducir activos PNG grandes y reservar dimensiones de imágenes.
6. Permitir el beacon que Cloudflare inyecta en la CSP.

## P1 — siguiente iteración

1. Prerenderizar `/`, `/stores`, `/help` y menús públicos para que los rastreadores reciban contenido sin ejecutar React.
2. Separar el bootstrap de autenticación/catálogo del primer render del home.
3. Medir INP, LCP y CLS en una visita nueva y con catálogo productivo antes de cerrar el presupuesto de rendimiento.
4. Validar en Search Console que `robots.txt` y el sitemap se sirven como `text/plain` y `application/xml` respectivamente.

## Criterio de publicación

No desplegar esta tanda SEO hasta revisar el diff y confirmar que las rutas del sitemap responden `200` en producción. El medidor propio de visitas sí está publicado en el commit `5b14b74` y no usa proveedores de terceros.
