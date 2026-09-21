# Auditoría SEO de Suya Delivery

Fecha: 2026-09-21 (America/Lima)
Alcance: `https://suyadelivery.com/`, web cliente, rutas públicas de menú y aplicaciones operativas.

## Hallazgos de la versión publicada

- La página raíz se entregaba como SPA vacía para los rastreadores: sin `canonical`, `robots`, URL Open Graph absoluta ni JSON-LD.
- `/robots.txt` y `/sitemap.xml` devolvían el HTML de la SPA por el fallback; no eran archivos válidos.
- La página de tiendas no tenía un `h1` propio; el título visual era un `h2` reutilizado.
- El enlace de categoría «Más» era ambiguo para accesibilidad y contexto semántico.
- Varias imágenes no declaraban dimensiones y los activos de portada/logotipo más grandes se entregaban como PNG.
- Cloudflare Web Analytics inyectaba un script bloqueado por la CSP publicada.

## Línea base Lighthouse (producción, 2026-09-21)

| Ruta | Móvil: rendimiento / SEO | Observación |
| --- | --- | --- |
| `/` | 45 / 83 | `robots-txt`, enlace «Más», bootstrap SPA e imágenes grandes |
| `/stores` | 47 / 92 | `robots-txt`, bootstrap SPA e imágenes grandes |
| `/help` | 58 / 91 | `robots-txt` y bootstrap SPA |
| `/` escritorio | 76 / 83 | CSP de Cloudflare e imagen sin dimensiones |

Los valores de rendimiento corresponden a la medición móvil simulada de Lighthouse. No se reporta FID; la métrica vigente es INP y, en esta auditoría, TBT se usa como diagnóstico de carga.

La revalidación más reciente de `/` en el dominio publicado antes del PR #45 registró 45 de rendimiento, 100 de accesibilidad, 92 de buenas prácticas y 83 de SEO (FCP 4.5 s, LCP 19.7 s, CLS 0.013, TBT 520 ms). El HTML público no expuso canonical; por tanto, estos valores describen la versión aún publicada y no la versión corregida del PR.

## Correcciones realizadas en el repositorio

- Metadatos estáticos y dinámicos para título, descripción, canonical, robots, Open Graph y Twitter.
- JSON-LD de `Organization`, `WebSite`, `Service` y `Restaurant` sin inventar teléfono, dirección ni reseñas.
- `public/robots.txt` y `public/sitemap.xml` con rutas públicas y exclusión de áreas privadas.
- `noindex,nofollow` para login, checkout, carrito, búsquedas, pedidos, perfil, QR de mesa y aplicaciones operativas.
- `noindex,nofollow` explícito para comprobantes invitados, redirección Jobs, 404, acceso no autorizado y fallos de negocio/menú; evita indexar soft-404 o URLs con tokens.
- `h1` semántico para la portada de tiendas y texto descriptivo para el enlace de categorías.
- Dimensiones explícitas en imágenes, conversión WebP de los activos pesados y mapeo transparente de rutas antiguas.
- Migración `20260921100000_optimize_public_asset_urls.sql` para retirar URLs `raw.githubusercontent.com` del catálogo productivo.
- HTML estático por ruta para `/stores`, `/help` y los cinco menús públicos del sitemap, con metadatos y Schema específicos antes de iniciar React.
- CSP compatible con el beacon de Cloudflare Web Analytics.

## Riesgo residual

La aplicación cliente mantiene un bootstrap de React, fuentes y catálogo que domina parte de la primera carga móvil. Las rutas públicas principales ya entregan HTML estático con metadatos; para llevar el rendimiento móvil a nivel alto todavía conviene separar el bootstrap de autenticación/catálogo del home y medir INP, LCP y CLS con catálogo productivo.
