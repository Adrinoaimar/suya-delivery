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

## Estado productivo revalidado

La medición productiva más reciente registró `/` con rendimiento 61, SEO 100, accesibilidad 100,
buenas prácticas 100, FCP 3.7 s, LCP 4.3 s, TBT 570 ms y CLS 0.011. `/stores/` registró rendimiento
56, SEO 100, FCP 3.5 s, LCP 8.4 s, TBT 480 ms y CLS 0. Son mediciones puntuales; el dato oficial
de Core Web Vitals requiere percentil 75 de usuarios reales.

El candidato de PR #57 medido en `/stores/` obtuvo rendimiento 79, SEO/accesibilidad/buenas prácticas
100, FCP 2.6 s, LCP 3.0 s, TBT 440 ms y CLS 0.

La repetición final en producción obtuvo `/` 68 de rendimiento y `/stores/` 53; SEO, accesibilidad
y buenas prácticas permanecieron en 100. FCP/LCP fueron 3.7/4.3 s en `/` y 5.0/13.1 s en `/stores/`.
Es una medición puntual: el catálogo mantiene variación de red y carga, y el LCP de tiendas queda
como prioridad de rendimiento, no como bloqueo de indexabilidad.

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
- Shell HTML inicial ampliado con contenido local factual, pasos de pedido, pagos, seguimiento,
  H2 y enlaces internos para que los rastreadores reciban contexto antes de ejecutar React.
- Tres páginas locales de intención: `/delivery-sullana/`, `/comida-a-domicilio-sullana/` y
  `/restaurantes-delivery-sullana/`, con contenido factual, Schema y enlaces internos.
- Páginas públicas de confianza para Sobre Suya, Contacto, Privacidad y Términos, enlazadas desde un
  footer visible en móvil y escritorio.
- HTML estático específico para quince documentos públicos (la portada y catorce rutas derivadas), incluidas las tres páginas locales,
  cinco cartas publicadas y las páginas de confianza; cada ruta declara título, descripción, canonical, `h1` y JSON-LD propios.
- Schema de `Organization`, `WebSite`, `WebPage`, `Service`, `CollectionPage`, `Restaurant` y
  `BreadcrumbList` donde corresponde. No se añadió marcado de reseñas ni datos comerciales no
  comprobados.
- `llms.txt` y controles de release que comprueban `robots.txt`, sitemap, HTML estático y tipos MIME.
- La animación inicial dejó de bloquear la web y se conserva únicamente en la aplicación nativa.
- Fuentes latinas locales precargadas, con caché inmutable, y contraste AA corregido en el footer.
- Portadas de negocios visibles priorizadas con `fetchpriority="high"`; Inicio precarga solo tres
  portadas destacadas conocidas y las rutas secundarias las eliminan. PR #57 no modifica la UI.

## Competencia observada para búsquedas locales

En consultas de referencia como «delivery Sullana», «delivery en Sullana», «pedir comida Sullana» y
«restaurantes delivery Sullana», Suya no apareció entre los resultados principales observados. Los
resultados visibles favorecieron agregadores, directorios, redes sociales y páginas locales con más
contenido y autoridad histórica. La implementación resuelve la brecha on-page y técnica; superar esa
autoridad requiere señales externas auténticas y tiempo de rastreo.

## Revalidación posterior

La auditoría HTTP posterior recorrió las 15 URLs del sitemap candidato: todas devuelven 200, canonical propio,
`index,follow`, un H1 y JSON-LD parseable. Rutas privadas conservan `noindex,nofollow`, sin canonical;
una ruta desconocida devuelve 404. No quedan errores críticos o altos técnicos en el alcance revisado.

## Riesgo residual

La aplicación cliente mantiene un bootstrap de React y Supabase que domina parte del trabajo de CPU
inicial. Separar servicios y autenticación exige una tanda propia para no introducir regresiones.
El puesto 1 no puede garantizarse desde código: faltan indexación efectiva, Search Console, ficha de
empresa legítima, reseñas reales, citaciones locales y enlaces editoriales. Después de publicar PR #57
se deben medir INP, LCP y CLS con datos de campo.
