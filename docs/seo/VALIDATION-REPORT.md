# Validación SEO y técnica

Fecha: 2026-09-21

## Gates ejecutados

- `npm run typecheck`: pasa.
- `npm run lint`: pasa.
- `npm test`: 75 archivos, 382 pruebas, pasa.
- `npm run security:secrets`: pasa; no se detectaron secretos.
- `git diff --check`: pasa.
- `npm run build:customer` con backend Supabase local de E2E: pasa.
- `npm run build:apps` con configuración local de E2E: pasa; bundles aislados de cliente, rider y backoffice.
- HTML construido: canonical, robots, OG, Twitter, JSON-LD, sitemap y robots presentes.
- Rutas privadas, URLs con tokens y estados de negocio/menú inexistentes mantienen `noindex,nofollow`; tests de Table QR, comprobante invitado y menú lo verifican.
- Build genera siete entradas HTML públicas con canonical/OG/JSON-LD propios: `/`, `/stores`, `/help` y cinco menús del sitemap.
- Suite Supabase en CI: pasa con 632 pruebas, incluida la migración del contador anónimo y el reemplazo de assets públicos.
- Contrato de migración: Donde Joel no conserva URLs raw de GitHub.
- Gates CI del PR #45: frontend, E2E multiapp, base de datos, Android e iOS pasan.

## Medición local

Lighthouse local confirmó SEO 100, accesibilidad 100 y buenas prácticas 96 sobre el HTML construido. La puntuación de rendimiento local no es representativa porque el backend Supabase local no estaba levantado y el navegador registró rechazos de conexión; no se usa como resultado productivo.

La revalidación del dominio publicado, antes de aplicar el PR #45, registró rendimiento 47, accesibilidad 100, buenas prácticas 92 y SEO 83 en móvil (FCP 4.7 s, LCP 7.4 s, CLS 0.012, TBT 440 ms). Esto confirma que el dominio todavía sirve la versión anterior; no se presenta como resultado de la tanda SEO.

En el HTML estático generado localmente, `/stores` y `/help` obtuvieron SEO 100. La ruta de menú probada cae en `noindex` cuando Supabase no está disponible, comportamiento intencional para evitar indexar un menú inexistente; debe repetirse con catálogo productivo después de publicar.

## Verificación productiva

`npm run verify:production` no puede ejecutarse con garantías desde este entorno porque no están cargadas las variables productivas de Supabase. No se sustituyeron por credenciales ni se publicaron secretos.

El medidor propio de visitas ya está publicado en producción: es first-party, opt-in, registra como máximo un visitante único por día y guarda únicamente un digest diario. El backoffice lo muestra a usuarios `platform_admin`.

## Pendientes antes del cierre

- Publicar la tanda SEO tras revisión del diff y del PR #45.
- Repetir Lighthouse en producción con catálogo disponible.
- Confirmar `robots.txt`, sitemap y tipos MIME desde el dominio público.
