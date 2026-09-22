# Validación SEO y técnica

Fecha: 2026-09-21

## Gates ejecutados

- `npm run typecheck`: pasa.
- `npm run lint`: pasa.
- `npm test`: 77 archivos, 394 pruebas, pasa.
- `npm run security:secrets`: pasa; no se detectaron secretos.
- `git diff --check`: pasa.
- `npm run build:customer` con backend Supabase local de E2E: pasa.
- `npm run build:apps` con configuración local de E2E: pasa; bundles aislados de cliente, rider y backoffice.
- HTML construido: canonical, robots, OG, Twitter, JSON-LD, sitemap y robots presentes.
- Rutas privadas, URLs con tokens y estados de negocio/menú inexistentes mantienen `noindex,nofollow`; tests de Table QR, comprobante invitado y menú lo verifican.
- Build genera quince entradas HTML públicas con canonical/OG/JSON-LD y contenido propios: `/`,
  tres páginas locales de intención, `/stores`, `/help`, cuatro páginas institucionales y cinco menús del sitemap.
- Suite Supabase en CI: pasa con 632 pruebas, incluida la migración del contador anónimo y el reemplazo de assets públicos.
- Contrato de migración: Donde Joel no conserva URLs raw de GitHub.
- Gates CI del PR #57: frontend, E2E multiapp, Android, iOS y simulador pasan.

## Medición Lighthouse

Lighthouse móvil sobre el candidato confirmó rendimiento 76, accesibilidad 100, buenas prácticas 96 y
SEO 100. Métricas: FCP 2.7 s, LCP 3.0 s, TBT 560 ms y CLS 0. El backend Supabase local no estaba
levantado y el navegador registró rechazos de conexión; no se presenta como resultado productivo.

La repetición posterior a la auditoría de imágenes obtuvo 74 de rendimiento, 100 de accesibilidad,
96 de buenas prácticas y 100 de SEO; FCP 2.7 s, LCP 3.1 s, TBT 620 ms y CLS 0. La diferencia está
dentro de la variación de Lighthouse local. El auditor estático confirmó 16 imágenes, ninguna sin
alt, dimensiones, política de carga o decodificación.

La revalidación productiva más reciente registró en móvil: `/` rendimiento 61, accesibilidad 100,
buenas prácticas 100, SEO 100, FCP 3.7 s, LCP 4.3 s, TBT 570 ms y CLS 0.011; `/stores/`
rendimiento 56, SEO 100, FCP 3.5 s, LCP 8.4 s, TBT 480 ms y CLS 0. Lighthouse varía según red,
caché y catálogo; LCP de `/stores/` sigue siendo la mejora técnica prioritaria.

La repetición final sobre producción obtuvo `/` rendimiento 68, accesibilidad 100, buenas prácticas
100 y SEO 100 (FCP 3.7 s, LCP 4.3 s, TBT 360 ms, CLS 0); `/stores/` obtuvo rendimiento 53,
accesibilidad 100, buenas prácticas 100 y SEO 100 (FCP 5.0 s, LCP 13.1 s, TBT 330 ms, CLS 0).
La variación confirma que el LCP del catálogo depende del catálogo/red y sigue siendo el único foco
de rendimiento pendiente; no introduce un error crítico o alto de SEO.

El build candidato de PR #57, medido en `/stores/`, obtuvo rendimiento 79, SEO/accesibilidad/buenas
prácticas 100, FCP 2.6 s, LCP 3.0 s, TBT 440 ms y CLS 0. Añade `fetchpriority="high"`, carga eager en las dos primeras tarjetas
visibles y precarga de portadas destacadas solo en Inicio. Las rutas secundarias eliminan esas
precargas. No cambia diseño ni comportamiento.

En el HTML estático generado localmente, `/stores` y `/help` obtuvieron SEO 100. La ruta de menú probada cae en `noindex` cuando Supabase no está disponible, comportamiento intencional para evitar indexar un menú inexistente; debe repetirse con catálogo productivo después de publicar.

## Verificación productiva

`npm run verify:production` pasa sobre los artefactos candidatos con configuración pública sintética:
702 archivos, sin simulaciones ni secretos. Esto valida el contenido del build; no demuestra el estado
del backend ni sustituye una publicación real con el entorno protegido.

El medidor propio de visitas ya está publicado en producción: las visitas únicas son first-party y
opt-in, con como máximo un visitante único por día y solo un digest diario. La nueva tanda añade
visualizaciones y clics agregados sin consentimiento; queda pendiente aplicar su migración en
Supabase. El backoffice muestra ambos agregados a usuarios `platform_admin`.

## Resultado de auditoría posterior

- 15 URLs del sitemap del candidato responden 200, todas con canonical propio, `index,follow`, exactamente un H1 y JSON-LD válido.
- Robots y sitemap responden 200 con tipos MIME correctos.
- Rutas privadas mantienen 200 HTML con `noindex,nofollow` sin canonical; rutas desconocidas responden 404.
- No quedan errores críticos o altos técnicos detectados. La autoridad externa no se puede validar desde el repositorio.
- El shell SEO inicial se amplió sin alterar la UI hidratada: Inicio 441 palabras; `/stores/` 207;
  `/help/` 191; cada menú público 189, con H2, pasos, pagos, seguimiento y enlaces internos.
- Se añadieron `/delivery-sullana/`, `/comida-a-domicilio-sullana/` y
  `/restaurantes-delivery-sullana/` con contenido local factual, Schema y enlaces internos.

## Pendientes externos

- Publicar la tanda SEO tras revisión del diff y del nuevo PR.
- Repetir Lighthouse en producción con catálogo disponible.
- Confirmar `robots.txt`, sitemap y tipos MIME desde el dominio público.
- Verificar Search Console, enviar sitemap y configurar una ficha de empresa únicamente con datos
  comerciales reales.
