# Validación SEO y técnica

Fecha: 2026-09-21

## Gates ejecutados

- `npm run typecheck`: pasa.
- `npm run lint`: pasa.
- `npm test`: 76 archivos, 387 pruebas, pasa.
- `npm run security:secrets`: pasa; no se detectaron secretos.
- `git diff --check`: pasa.
- `npm run build:customer` con backend Supabase local de E2E: pasa.
- `npm run build:apps` con configuración local de E2E: pasa; bundles aislados de cliente, rider y backoffice.
- HTML construido: canonical, robots, OG, Twitter, JSON-LD, sitemap y robots presentes.
- Rutas privadas, URLs con tokens y estados de negocio/menú inexistentes mantienen `noindex,nofollow`; tests de Table QR, comprobante invitado y menú lo verifican.
- Build genera doce entradas HTML públicas con canonical/OG/JSON-LD y contenido propios: `/`,
  `/stores`, `/help`, cuatro páginas institucionales y cinco menús del sitemap.
- Suite Supabase en CI: pasa con 632 pruebas, incluida la migración del contador anónimo y el reemplazo de assets públicos.
- Contrato de migración: Donde Joel no conserva URLs raw de GitHub.
- Gates CI del PR #45: frontend, E2E multiapp, base de datos, Android e iOS pasan.

## Medición local

Lighthouse móvil sobre el candidato confirmó rendimiento 76, accesibilidad 100, buenas prácticas 96 y
SEO 100. Métricas: FCP 2.7 s, LCP 3.0 s, TBT 560 ms y CLS 0. El backend Supabase local no estaba
levantado y el navegador registró rechazos de conexión; no se presenta como resultado productivo.

La repetición posterior a la auditoría de imágenes obtuvo 74 de rendimiento, 100 de accesibilidad,
96 de buenas prácticas y 100 de SEO; FCP 2.7 s, LCP 3.1 s, TBT 620 ms y CLS 0. La diferencia está
dentro de la variación de Lighthouse local. El auditor estático confirmó 16 imágenes, ninguna sin
alt, dimensiones, política de carga o decodificación.

La revalidación más reciente del dominio publicado, antes de aplicar el PR #45, registró rendimiento 45, accesibilidad 100, buenas prácticas 92 y SEO 83 en móvil (FCP 4.5 s, LCP 19.7 s, CLS 0.013, TBT 520 ms). El HTML público todavía no expone canonical; esto confirma que el dominio sirve la versión anterior y no se presenta como resultado de la tanda SEO.

En el HTML estático generado localmente, `/stores` y `/help` obtuvieron SEO 100. La ruta de menú probada cae en `noindex` cuando Supabase no está disponible, comportamiento intencional para evitar indexar un menú inexistente; debe repetirse con catálogo productivo después de publicar.

## Verificación productiva

PR #54 se fusionó y `Desplegar Cloudflare Pages` terminó correctamente. `verify:live` confirmó las
tres webs, `robots.txt`, sitemap, `llms.txt`, RPC first-party y Edge Function de rutas. La auditoría
HTTP posterior confirmó doce URLs públicas con `200`, canonical exacto, `index,follow`, un `h1` y
JSON-LD; las rutas privadas/dinámicas conservaron su URL con `200 text/html`, `noindex,nofollow`, y
una URL desconocida respondió `404` real.

Lighthouse móvil en producción: portada 53/100 rendimiento, 100 accesibilidad, 100 buenas prácticas
y 100 SEO; `/stores/`: 56 rendimiento y 100 SEO. Portada: FCP 4.7 s, LCP 5.2 s, TBT 650 ms, CLS 0.
Tiendas: FCP 3.1 s, LCP 10.2 s, TBT 500 ms, CLS 0.

`npm run verify:production` pasa sobre los artefactos candidatos con configuración pública sintética:
697 archivos, sin simulaciones ni secretos. Esto valida el contenido del build; no demuestra el estado
del backend ni sustituye una publicación real con el entorno protegido.

El medidor propio de visitas ya está publicado en producción: es first-party, opt-in, registra como máximo un visitante único por día y guarda únicamente un digest diario. El backoffice lo muestra a usuarios `platform_admin`.

## Pendientes antes del cierre

- Publicar la tanda SEO tras revisión del diff y del nuevo PR.
- Repetir Lighthouse en producción con catálogo disponible.
- Confirmar `robots.txt`, sitemap y tipos MIME desde el dominio público.
- Verificar Search Console, enviar sitemap y configurar una ficha de empresa únicamente con datos
  comerciales reales.
