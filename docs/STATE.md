# Estado de ejecución

Actualizado: 9 de septiembre de 2026 (`America/Lima`)

## Objetivo

Convertir Suya Delivery en producto funcional multiapp. Ninguna simulación puede quedar activa en
producción.

## Estado actual

- Rama de trabajo: `main` (`c961456`), con integración móvil, workflow Android reproducible y firma release opt-in.
- F13 acceso y catálogo: clientes tienen registro renovado y Google OAuth PKCE preparado para web,
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
- F10 añadió runner Playwright y workflow CI para Supabase local; smoke Chrome local cubre nueve
  combinaciones de viewport/ruta. Backend E2E queda pendiente hasta evidencia CI verde.
- Cliente, repartidor y backoffice tienen entradas/bundles web independientes y también viven dentro
  del APK unificado; las ofertas no se inventan ni se siembran sin datos comerciales autorizados.
- Auth Supabase y guards por capacidad están implementados; la conexión rechaza un project ref
  distinto al exclusivo esperado para Suya.
- El catálogo Supabase no inventa horario, distancia ni reseñas. Andá Paya tiene 58 productos y
  `accepting_orders` habilitado por autorización comercial; bebidas sin precio no se importaron.
- Producción no incluye servicios mock, mapa falso, GPS simulado, promociones ficticias ni ganancias
  inventadas. Enlace público de tracking sigue deshabilitado por seguridad.
- El workflow Android de `main` compila y publica un APK debug unificado como artefacto CI; el último
  run verde es `34392017329`. Frontend, E2E, iOS de simulador y Suya Menús también quedaron verdes
  después del merge.
- La auditoría de la app independiente Wallet Observer confirma sincronización opcional en segundo
  plano mediante `ingest_wallet_observation` con URL, publishable key y token de dispositivo. Las
  observaciones siguen `unverified`; no autorizan pedidos ni sustituyen una pasarela oficial.
- Backoffice incluye `/restaurants` para `platform_admin`: carga `restaurant_account_registry`, guarda
  representante/correo/notas, prepara `ready_to_invite`, envía invitación segura y activa propietario
  tras confirmar correo. Edge Function usa `service_role` solo en runtime; workflow de despliegue manual.
- Android release tiene pipeline unsigned verificable y firma opt-in por variables privadas; ningún
  keystore ni contraseña entra al repositorio.

## Reglas de continuidad

- Git, pruebas y este archivo son estado canónico.
- Opus se reserva para arquitectura, RLS, pagos y seguridad. Sonnet máximo cubre revisión compleja;
  Kimi K3 usa razonamiento extra-high para implementación extensa.
- Si Claude agota una ventana, se crea checkpoint y continúa otro modelo. Claude retoma desde Git
  cuando vuelva a estar disponible.
- Un gate de cuenta, MFA, KYC, DNS o permiso de dispositivo no bloquea tareas independientes.

## Siguiente acción

Habilitar Google en Google Cloud/Supabase, validar OAuth en un dispositivo físico y ejecutar pgTAP en
CI para la migración de Donde Joel. Después de confirmar sede y logística, desplegar la migración y
habilitar pedidos. Para distribución, crear firma Android de release y configurar Apple Developer
Team, certificado y provisioning profile.

## Gate productivo pendiente

El sitio GitHub Pages actual es legado. Producción canónica usa `suya-customer.pages.dev`,
`suya-rider.pages.dev` y `suya-backoffice.pages.dev`; smoke remoto y verificador de bundles están verdes.

La máquina actual no tiene Docker ni Podman. Las pruebas pgTAP y `db lint` se ejecutan en GitHub CI;
localmente se habilitarán cuando exista uno de esos runtimes.

El código Google OAuth está completo, pero el proveedor sigue desactivado en Supabase (`external.google=false`)
hasta cargar Client ID/Secret y Redirect URLs externos. Los secretos OAuth no están en GitHub. Donde
Joel queda verificado en el backend actual, con pedidos desactivados por decisión comercial.

La máquina Windows no puede producir un `.ipa`. El proyecto Xcode y el build de simulador son
verificables en CI; un artefacto instalable exige firma Apple externa.




