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
- Contenido local visible y útil sobre delivery en Sullana, proceso de compra, pagos y seguimiento,
  sin inventar cobertura, tiempos, reseñas, teléfonos ni direcciones.
- Páginas públicas de confianza para Sobre Suya, Contacto, Privacidad y Términos, enlazadas desde un
  footer visible en móvil y escritorio.
- HTML estático específico para doce documentos públicos (la portada y once rutas derivadas), incluidas las cinco cartas publicadas y las
  páginas de confianza; cada ruta declara título, descripción, canonical, `h1` y JSON-LD propios.
- Schema de `Organization`, `WebSite`, `WebPage`, `Service`, `CollectionPage`, `Restaurant` y
  `BreadcrumbList` donde corresponde. No se añadió marcado de reseñas ni datos comerciales no
  comprobados.
- `llms.txt` y controles de release que comprueban `robots.txt`, sitemap, HTML estático y tipos MIME.
- La animación inicial dejó de bloquear la web y se conserva únicamente en la aplicación nativa.
- Las rutas funcionales y dinámicas conservan su URL original en Cloudflare mediante un shell interno
  HTML sin extensión; entregan `200`, `text/html`, `noindex,nofollow` y sin canonical falso. Esto
  evita duplicados de portada y conserva login, checkout, carrito, pedidos, fichas, QR y comprobantes.
- Las URLs inexistentes entregan `404` real con `noindex,nofollow`; los cinco menús públicos se
  mantienen `200`, `index,follow`, canonical final y Schema específico.
- El auditor de release recorre los chunks JavaScript importados, evitando falsos rollbacks cuando el
  registro first-party de visitas queda en un chunk lazy.
- Fuentes latinas locales precargadas, con caché inmutable, y contraste AA corregido en el footer.

## Competencia observada para búsquedas locales

En consultas de referencia como «delivery Sullana», «delivery en Sullana», «pedir comida Sullana» y
«restaurantes delivery Sullana», Suya no apareció entre los resultados principales observados. Los
resultados visibles favorecieron agregadores, directorios, redes sociales y páginas locales con más
contenido y autoridad histórica. La implementación resuelve la brecha on-page y técnica; superar esa
autoridad requiere señales externas auténticas y tiempo de rastreo.

## Medición final publicada

Tras el merge del PR #54, el workflow `Desplegar Cloudflare Pages` terminó correctamente y la
auditoría live fue apta. La verificación HTTP sobre las doce URLs del sitemap confirmó `200`,
canonical exacto, `index,follow`, un único `h1` y JSON-LD válido. Las rutas funcionales conservaron
su URL y entregaron `200 text/html`, `noindex,nofollow`, sin canonical ni Schema público. Una URL
inexistente respondió `404` real.

Lighthouse móvil directo a producción obtuvo en la portada: rendimiento 53, accesibilidad 100,
buenas prácticas 100 y SEO 100; FCP 4.7 s, LCP 5.2 s, TBT 650 ms y CLS 0. En `/stores/` obtuvo
rendimiento 56 y SEO 100; FCP 3.1 s, LCP 10.2 s, TBT 500 ms y CLS 0. La variación de rendimiento
está dominada por la red móvil simulada, el bundle de React y las imágenes reales del catálogo; no
se observaron fallos SEO, accesibilidad ni buenas prácticas.

## Medición del candidato local

Lighthouse móvil sobre el build candidato obtuvo 76 de rendimiento, 100 de accesibilidad, 96 de buenas
prácticas y 100 de SEO. Registró FCP 2.7 s, LCP 3.0 s, TBT 560 ms y CLS 0. La medición usa un backend
Supabase local no iniciado; sirve como comparación técnica, no como dato de campo ni resultado
productivo. Frente a la versión publicada medida antes de esta tanda, el SEO sube de 83 a 100 y el LCP
local baja de 19.7 s a 3.0 s.

## Riesgo residual

La aplicación cliente mantiene un bootstrap de React y Supabase que domina el trabajo de CPU inicial.
Una optimización adicional exige separar servicios y autenticación del paquete crítico, y se mantiene
fuera de esta tanda para no introducir regresiones operativas. El puesto 1 no puede garantizarse desde
el código: faltan indexación efectiva, Search Console, una ficha de empresa legítima, reseñas reales,
citaciones locales y enlaces editoriales. Después de publicar se deben medir INP, LCP y CLS con datos
de campo y catálogo productivo.
