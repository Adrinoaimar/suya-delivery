# Estado de ejecución

Actualizado: 13 de septiembre de 2026 (`America/Lima`)

## Objetivo

Convertir Suya Delivery en producto funcional multiapp. Ninguna simulación puede quedar activa en
producción.

## Estado actual

- Rama de trabajo: `codex/2026-09-11-suya-perfect-app`, checkpoint móvil integrado y listo para revisión.
- F13 acceso y catálogo: clientes tienen registro renovado y Google OAuth PKCE publicado para web,
  Android e iOS. Donde Joel suma 133 productos verificables y cuatro cartas como catálogo
  informativo sin pedidos; la carta nueva de Andá Paya se muestra con aviso de revisión por
  conflictos de precio.
  Motion respeta preferencia manual/sistema y el APK debug fue recompilado con Browser/deep link.
- F12 rediseño: cliente, repartidor y backoffice usan el sistema visual `Suya Lens`, con superficies
  Liquid Glass selectivas, tipografía Bricolage Grotesque/DM Sans, jerarquía más limpia, contraste AA,
  blancos sólidos de respaldo y blur reducido en móvil. El APK debug fue recompilado y validado en
  Android 15; navegación, catálogo real y rutas protegidas pasan smoke.
- F11 móvil: un único APK Capacitor contiene cliente, Delivery/repartidor y backoffice bajo rutas y
  guards por rol; branding nativo, GPS con permiso explícito y build Android instalable de pruebas.
  El APK unificado incluye ofertas exclusivas visibles solo en app, gestión autorizada en
  `/backoffice/offers` y validación/redención transaccional en Supabase. El target iOS para simulador
  compiló correctamente en macOS CI.
- Checkpoint F7 verificado: puntos de entrega consentidos, mapas OSM, GPS real limitado, tracking
  participante, incidentes y SOS persistentes. CI aprobó 138 pgTAP; frontend aprobó 81 pruebas.
- F8A local: simulaciones productivas retiradas. Gate validó 352 artefactos sin mocks ni secretos.
- F0 verificado localmente: gobernanza, secretos, CI, arquitectura y continuidad.
- Contratos de catálogo y pedidos son asíncronos; las pantallas manejan carga, error y reintento.
- La progresión automática de pedidos y el pago digital simulado fueron retirados. El checkout solo
  acepta efectivo hasta integrar una pasarela real.
- Supabase CLI `2.115.0` y `supabase-js` `2.112.3` están fijados. El esquema inicial incluye RLS,
  aislamiento por restaurante, secretos fuera de `public`, auditoría, ubicaciones e incidencias.
- Backend elegido: Supabase exclusivo de Suya.
- Frontend web objetivo: tres builds Cloudflare Pages: customer, rider y backoffice; el canal móvil
  es un cuarto build unificado (`dist/mobile`) dentro del APK.
- Release Pages reproducible preparado: workflow manual desde `main`, Wrangler fijado, validación de
  cuenta/proyectos/URLs, identidad canónica, previews y rollback antes de publicar.
- Smoke browser multiapp quedó extraído como skill reusable en `.agents/skills/suya-browser-smoke`;
  cubre Chrome real, móvil/escritorio, rutas protegidas, accesibilidad básica y reduced motion.
- F9 cerró el último escape conocido: `build:apps` rechaza configuración incompleta y los bundles
  productivos rechazan chunks `Mock*`; GitHub Pages ya no publica artefactos heredados.
- F10 añadió runner Playwright y workflow CI para Supabase local; smoke Chrome cubre nueve
  combinaciones de viewport/ruta y el job `test` de pgTAP/E2E queda verde en PR #28.
- Cliente, repartidor y backoffice tienen entradas/bundles web independientes y también viven dentro
  del APK unificado; las ofertas no se inventan ni se siembran sin datos comerciales autorizados.
- Auth Supabase y guards por capacidad están implementados; la conexión rechaza un project ref
  distinto al exclusivo esperado para Suya.
- El catálogo Supabase no inventa horario, distancia ni reseñas. Andá Paya tiene 58 productos y
  `accepting_orders` habilitado por autorización comercial; bebidas sin precio no se importaron.
- Producción no incluye servicios mock, mapa falso, GPS simulado, promociones ficticias ni ganancias
  inventadas. Enlace público de tracking sigue deshabilitado por seguridad.
- La precarga de catálogo inicia negocios y categorías durante la pantalla inicial del cliente y del
  APK móvil; la suite de regresión cubre ese arranque.
- Activos de marca: Tío Jhony, La Waka, Donde Joel y Andá Paya tienen activos publicados; Andá Paya
  usa el logo derivado de su carta autorizada y conserva la carta original en galería. Donde Joel
  también publica su logo en la ficha, menú, portada y tarjetas. Las rutas relativas respetan la
  base pública del despliegue. No se usa el SVG recreado anterior. Ver `docs/data/brand-assets.md`.
- La Waka ahora usa el activo oficial de `lawakachicken.com` convertido a WebP transparente; Andá
  Paya usa una extracción nítida del encabezado de su carta autorizada, con el fondo exterior limpio.
  KFC, Inkafarma, Papa John's y Tottus tienen fichas Supabase visibles como «Próximamente», sin
  productos ni pedidos habilitados.
- F18 añade analítica GA4 opt-in con consentimiento, UTM acotadas y eventos de embudo (`page_view`,
  `menu_view`, `store_view`, `add_to_cart`, `checkout_start`, `order_created`). Publicidad, CRM de
  leads y dashboards siguen desactivados hasta recibir IDs, cuentas y política de privacidad.
- F20 añade APKs Android debug separados para los roles operativos: `com.suya.rider` reutiliza el
  flujo protegido de Rider y `com.suya.backoffice` reutiliza el flujo protegido de operaciones. Ambos
  se generan con `npm run build:mobile:roles`, conservan Supabase/GPS y pueden instalarse juntos.
  PR #35 publicó los artefactos de prueba; la firma release sigue pendiente.
- F21 fija el alcance del backoffice a la cuenta de restaurante en Mesas y QR, Catálogo y
  Dispositivos de pagos; el selector queda reservado para `platform_admin`. El nuevo módulo de
  Repartidores invita o vincula riders y limita la disponibilidad/asignación con `restaurant_riders`
  validado en Postgres. La migración y pgTAP quedan pendientes de CI porque esta máquina no tiene
  Docker/Podman.
- El catálogo local conserva 13 fichas demo con un asset resoluble por tarjeta y ficha. El mock de
  desarrollo publica una carta por ficha con slug estable (`*-menu`), logo, tema y productos; la
  publicación productiva de Supabase sigue limitada a los negocios con datos comerciales verificados.
  El editor mock conserva ajustes e imágenes locales en el navegador para probar el flujo completo
  sin tocar datos productivos.

## Checkpoint F25: estabilización de mapas y APKs por rol

- La rama `feat/backoffice-restaurant-ops` terminó en `17ac6aa`; PR #36 está abierto y mergeable.
- Leaflet ya no se reconstruye por cada lectura GPS ni redibuja la ruta del Cliente innecesariamente.
  Marcadores, rastro, ruta vial OSRM/OpenStreetMap, alternativas y guía de maniobras conservan estado.
- El OTA nativo ahora aplica solo cuando `VITE_MOBILE_ROLE` es explícitamente `customer`; builds
  Rider, Back Office y APK unificada (`unified`) rechazan el bundle de Cliente por defecto.
- Cliente y Rider tienen mapa móvil amplio y control `Ver mapa completo`, con salida por Escape,
  scroll bloqueado y safe area. MapProvider reacciona a cambios de conexión.
- Evidencia local: 46 suites/204 tests, lint, typecheck, build aislado, escaneo de secretos, diff
  limpio y smoke responsive en móvil/tablet/escritorio. CI final `34740936708`: browser,
  browser-e2e, build, debug, simulator y test verdes. Android publicó APK Rider y Back Office.
- Producción responde HTTP 200 en los tres dominios y Back Office muestra `Suya Operaciones`; esto
  no prueba que el commit final esté desplegado mientras PR #36 permanezca abierto.
- Pendiente externo: revisión/fusión autorizada de PR #36, publicación Cloudflare, migración de riders
  en Supabase real y prueba en dispositivos físicos. APKs son debug; firma release sigue pendiente.

## Reglas de continuidad

- Git, pruebas y este archivo son estado canónico.
- Opus se reserva para arquitectura, RLS, pagos y seguridad. Sonnet máximo cubre revisión compleja;
  Kimi K3 usa razonamiento extra-high para implementación extensa.
- Si Claude agota una ventana, se crea checkpoint y continúa otro modelo. Claude retoma desde Git
  cuando vuelva a estar disponible.
- Un gate de cuenta, MFA, KYC, DNS o permiso de dispositivo no bloquea tareas independientes.

## Siguiente acción

Validar inicio de sesión real en un dispositivo físico y resolver la firma Android release. Después
de confirmar sede y logística, habilitar pedidos.

## Gate productivo pendiente

El sitio GitHub Pages actual es legado. Producción canónica usa `suya-customer.pages.dev`,
`suya-rider.pages.dev` y `suya-backoffice.pages.dev`; smoke remoto y verificador de bundles están verdes.

La máquina actual no tiene Docker ni Podman. Las pruebas pgTAP y `db lint` se ejecutan en GitHub CI;
el PR #28 tiene verdes `test`, `browser`, `browser-e2e`, `build`, `simulator` y `debug`.

Google OAuth está activo en Supabase y Google Auth Platform; falta validar una cuenta real en Android.
Donde Joel tiene perfil, cuatro cartas y activos públicos reproducibles; pedidos siguen desactivados.

La auditoría F18 queda documentada en `docs/execution/F18.md`. La activación de GA4 requiere
`VITE_ANALYTICS_PROVIDER=ga4` y `VITE_GA4_MEASUREMENT_ID` solo en el proveedor de despliegue.

La máquina Windows no puede producir un `.ipa`. El proyecto Xcode y el build de simulador son
verificables en CI; un artefacto instalable exige firma Apple externa.




