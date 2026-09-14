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

- La rama `feat/backoffice-restaurant-ops` termina en `0da8972`; el último cambio funcional es `9b3f3df` y PR #36 está abierto y mergeable.
- Leaflet ya no se reconstruye por cada lectura GPS ni redibuja la ruta del Cliente innecesariamente.
  Marcadores, rastro, ruta vial OSRM/OpenStreetMap, alternativas y guía de maniobras conservan estado.
- El OTA nativo ahora aplica solo cuando `VITE_MOBILE_ROLE` es explícitamente `customer`; builds
  Rider, Back Office y APK unificada (`unified`) rechazan el bundle de Cliente por defecto.
- Cliente y Rider tienen mapa móvil amplio y control `Ver mapa completo`, con salida por Escape,
  scroll bloqueado y safe area. MapProvider reacciona a cambios de conexión.
- El Inicio de Rider también muestra el mapa de zona, ubicación activa y estado de guía, incluso sin
  viaje asignado; el viaje activo conserva ruta, rastro y maniobras.
- El mapa se remonta por identificador de pedido al cambiar de viaje, evitando conservar el centro o
  la ruta del pedido anterior; las lecturas GPS del mismo viaje no lo reinician.
- El rastro del mapa usa un arreglo vacío estable, actualiza la polilínea sin recrearla en cada lectura
  y limita el historial visual a 240 puntos; Seguridad del Rider conserva su ayuda dentro de `/rider`.
- La guía de navegación avanza de forma monotónica al cruzar una maniobra; ya no puede volver a mostrar
  un giro anterior cuando la distancia en línea recta vuelve a aumentar.
- La auditoría visual en navegador detectó y corrigió que el historial GPS desaparecía al faltar la
  última lectura en vivo, y que `Ver mapa completo` cambiaba estado pero seguía limitado al contenedor.
  El historial ahora se conserva y el modo completo ocupa el viewport real.
- La nueva pasada corrigió veintiuna regresiones: enlace de ayuda del Rider que salía de su ámbito, rastro
  que podía reiniciarse o crecer sin límite, marcador GPS obsoleto tras desactivar/error y QR/copiado
  frágiles cuando el portapapeles no está disponible; además, enlaces del catálogo con doble `/`,
  coordenadas GPS fuera de rango aceptadas por última lectura/Realtime, navegación móvil del Back
  Office con pestañas recortadas, acceso de “Restaurantes” expuesto a cuentas de restaurante,
  compatibilidad del mapa cuando el WebView no tiene `ResizeObserver`, Service Worker/cache del
  Cliente heredado en builds operativos, guía de navegación que podía retroceder a un giro cruzado,
  historial GPS borrado sin lectura viva, expansión de mapa que no llegaba a pantalla completa,
  disponibilidad del Rider que no se persistía en servidor, historial vivo que una respuesta remota
  tardía podía reemplazar, cargas de pedidos que una respuesta vieja podía sobrescribir, controles
  nativos de zoom que se superponían a la guía móvil, disponibilidad que podía revertirse por una
  carga inicial tardía, callbacks GPS que reaparecían después de apagar el rastreo y una solicitud OSRM
  pendiente que podía cancelarse por un movimiento GPS menor a 50 m, dejando la guía atascada en
  “Calculando ruta vial…”, además de cargas de ofertas del Cliente que podían actualizar Inicio o
  Checkout después de abandonar la pantalla.
- La reauditoría también blindó contra respuestas atrasadas las cargas repetibles de Catálogo, Mesas y QR,
  Ofertas, Dispositivos de pagos y Cuentas de restaurantes; el staff con cuenta fija ya no dispara una
  recarga duplicada del catálogo. Leaflet usa botones de zoom redondos y accesibles, dejando libre la
  tarjeta de guía.
- El store global del catálogo descarta respuestas de recargas forzadas atrasadas; el hook común de
  geolocalización ignora lecturas y errores posteriores al apagado.
- Las solicitudes OSRM pendientes se conservan durante movimientos GPS pequeños y solo se invalidan al
  cambiar de destino, iniciar otra ruta o desmontar el mapa.
- Inicio y Checkout del Cliente ignoran respuestas y errores de ofertas que llegan después de desmontarse.
- Evidencia local: 54 suites/225 tests, lint, typecheck, escaneo de secretos y diff limpio; smoke
  responsive y comprobación Playwright del viewport completo. CI final Android `34755235402` y workflows
  asociados: browser `34755235408`, browser-e2e/build `34755235403`, test `34755235405` y simulator
  `34755235399`, todos verdes. Android publicó APK Rider y Back Office.
- Producción responde HTTP 200 en los tres dominios y Back Office muestra `Suya Operaciones`; esto
  no prueba que el commit final esté desplegado mientras PR #36 permanezca abierto.
- Pendiente externo: revisión/fusión autorizada de PR #36, publicación Cloudflare, migración de riders
  en Supabase real y prueba en dispositivos físicos. APKs son debug; firma release sigue pendiente.
- Las correcciones finales `bde9274`, `c7937a9`, `7d19b3f`, `9b924b5`, `7893880`, `9aaf6ff`, `c7db260` y `14ae039` ocultan “Restaurantes” a staff de
  restaurante, protegen la ruta para `platform_admin`, agregan fallback para WebView sin
  `ResizeObserver` y limpian el Service Worker/cache del Cliente en builds operativos; los seis
  checks de PR #36 siguen verdes.
- Evidencia funcional de roles: el portal operativo publicado muestra `Suya Operaciones`; las APKs
  contienen títulos `Suya Repartidor` y `Suya Operaciones`.
- APK Rider final: `output/apks/Suya-Rider-debug-e462834.apk`, SHA-256 `51e32850de9b959f5112fa9afd8880915ac1a85b97330014b64a4777ec701ea8`.
- APK Back Office final: `output/apks/Suya-Backoffice-debug-e462834.apk`, SHA-256 `36b10d7d7389a158210056ad5f4147aca18ad1b3563badaf1c92817beac251c1`.

## Checkpoint F27: pagos identificables y APK 9d973fc (2026-09-14)

- `9d973fc` bloquea reintentos del QR Yape de Culqi mientras espera el webhook y libera el control al autorizar, fallar o vencer; el flujo manual conserva código completo/fingerprint para distinguir dos pagos de S/30.
- El observador Android es opt-in, cifra la cola local, conserva eventos no sincronizados y nunca autoriza por sí solo. Back Office muestra restaurante, cliente, remitente, monto, hora y código enmascarado; permite completar el código faltante.
- Evidencia: 59 suites/244 tests locales, lint, typecheck y escaneo de secretos verdes; CI PR #36 completo verde (browser, E2E, DB, Android, iOS). APKs debug Rider/Back Office están en `output/apks/9d973fc/`.
- Gate local: `verify:production` y `verify:cloudflare` requieren variables públicas/configuración de proveedor; `db:test` y `db:lint` requieren Postgres local. CI remoto sí pasó base, build y E2E. No se declara producción lista.
- Pendiente externo: configurar llaves Culqi/Supabase y webhook, aplicar migraciones en el proyecto real, publicar build, validar login y ejecutar casos físicos Yape/Lemon/tarjeta.

## Checkpoint F27.1: QR de billeteras y APK 362cfd6 (2026-09-14)

- `362cfd6` corrige el mapeo del Custom Checkout: el QR de una orden Culqi usa `billetera`; `yape` queda reservado para token/código de aprobación. Back Office también bloquea verificaciones ambiguas por monto/código parcial.
- Evidencia: 59 suites/245 tests locales, typecheck/lint/diff verdes; CI PR #36 completo verde (browser, E2E, DB, Android, iOS). APKs debug nuevas están en `output/apks/362cfd6/`.
- Pendiente externo: configurar llaves Culqi/Supabase y webhook, aplicar migraciones en el proyecto real, publicar build y ejecutar casos físicos Yape/Lemon/tarjeta.

## Checkpoint F27.2: refresco del observador Android y APK 8b60212 (2026-09-14)

- `8b60212` refresca automáticamente el estado del observador Android al recuperar foco o volver a estar visible después de Ajustes; así Back Office no conserva el mensaje obsoleto de permiso pendiente. Se añadió regresión UI específica.
- Evidencia local: 59 suites/246 tests, lint, typecheck, escaneo de secretos y diff limpio; CI PR #36 verde: Android `34852757234`, iOS `34852756986`, browser `34852757022`, frontend `34852757034` y base `34852757047`.
- APK Rider: `output/apks/8b60212/Suya-Rider-debug-e54e0664f226fd267a18be4a8e558208d42b21b2/Suya-Rider-debug.apk`, SHA-256 `d6aaacabaeb1c6fd864394f7ef88bff67a540a438bee067b48ccd85fa662fc16`.
- APK Back Office: `output/apks/8b60212/Suya-Backoffice-debug-e54e0664f226fd267a18be4a8e558208d42b21b2/Suya-Backoffice-debug.apk`, SHA-256 `f5f1a0b601d771e00f781974d99ec6e813e80ebbd9718aecb545851c78dbb8ea`.
- Pendiente externo: configurar llaves Culqi/Supabase y webhook, aplicar migraciones en el proyecto real, publicar build y ejecutar casos físicos Yape/Lemon/tarjeta.

## Checkpoint F27.3: pista de remitente y APK 5348ab6 (2026-09-14)

- `5348ab6` muestra en Back Office si el remitente de la notificación coincide con el nombre del cliente; si no coincide, exige confirmar el código completo. Esta pista nunca autoriza por sí sola.
- Evidencia local: 59 suites/246 tests, lint, typecheck, escaneo de secretos y diff limpios; CI PR #36 completo verde: Android `34855111412`, iOS `34855111400`, browser `34855111427`, frontend/E2E `34855111372`, base `34855111398`.
- APK Rider: `output/apks/5348ab6/Suya-Rider-debug-68be2a50eca0342432ec45b3ade497c4f7f8ca89/Suya-Rider-debug.apk`, SHA-256 `b757294c15ed3a93496b492a7e71257b02d5b8be2da0a9644d025f779a11861f`.
- APK Back Office: `output/apks/5348ab6/Suya-Backoffice-debug-68be2a50eca0342432ec45b3ade497c4f7f8ca89/Suya-Backoffice-debug.apk`, SHA-256 `937d3827dfd87c814e46efa757038dc1e7358716730cc64955e918af2f1eec5f`.
- Pendiente externo sin cambios: secretos/configuración Culqi-Supabase, migraciones/Edge Functions, publicación y pagos físicos.

## Checkpoint F27.4: rechazo Culqi y APK 73a1253 (2026-09-14)

- `73a1253` actualiza `PaymentInstructions` después de un rechazo Culqi: el estado fallido se refresca desde el servidor y el reintento no reutiliza la referencia anterior. Se añadió regresión para tarjeta.
- Evidencia local: 60 suites/248 tests, lint, typecheck, diff y `build:apps` con configuración pública sintética verdes. El escaneo de secretos no encontró secretos versionados.
- CI PR #36 completo verde: DB `34871217318`, Android `34871217256`, iOS `34871217214`, browser `34871217191`, frontend/E2E `34871217316`.
- APKs debug oficiales: Rider, Back Office y Caja en `output/apks/73a1253/`; las tres pasaron `unzip -t`. No se guardan binarios en documentación.
- `verify:production` local sigue fallando correctamente sin configuración real; faltan llaves, migraciones/Edge Functions, publicación, smoke físico y dos pagos S/30.

## Checkpoint F27.5: rechazo sin refresh y APK funcional 673a920 (2026-09-14)

- `673a920` cubre el último borde del retry Culqi: si falla también la consulta de estado, invalida localmente la referencia y obliga a crear una nueva; además aclara que Suya guarda hash no reversible del código y solo muestra los últimos cuatro caracteres.
- Evidencia local: 60 suites/249 tests, lint, typecheck, diff y escaneo de secretos verdes. CI PR #36 completo verde: DB `34873443644`, Android `34873443609`, iOS `34873443610`, browser `34873443608`, frontend/E2E `34873443611`.
- APKs debug de `673a920` en `output/apks/673a920/`; Rider `e9fddcc5…`, Back Office `61103553…`, Caja `2576795e…`; las tres pasaron `unzip -t`.
- `verify:production` y `verify:cloudflare` siguen rechazando la ausencia de configuración real. Faltan llaves Culqi/Supabase/Cloudflare, migraciones/funciones, webhook, publicación y pagos físicos.

## Checkpoint F27.6: preflight de pagos (2026-09-14)

- `npm run verify:payments` valida project ref, Supabase público, Culqi público, mapas y orígenes canónicos sin hacer red ni mutaciones; `--deployment` añade secretos de Edge Functions y `--network` solo hace `OPTIONS`.
- El gate rechaza mapas ausentes o `mock` y claves secretas `sk_` en frontend. Configuración sintética válida y regresiones negativas pasaron.
- Culqi conserva el botón bloqueado durante un cargo aunque el token llegue antes de cerrar `open()`; Back Office ignora respuestas viejas de candidatos cuando se consultan filas superpuestas.
- Suite serial: 61 archivos/254 pruebas; lint, typecheck, escaneo de secretos y `git diff --check` verdes. La ejecución paralela tuvo una carrera aislada en `mobile-routes`, que pasó sola.
- Producción sigue pendiente de credenciales/configuración real, migraciones, webhook, publicación y dos pagos físicos S/30.

## Checkpoint F27.7: persistencia reintentable del webhook (2026-09-14)

- `a35faa6` hace que `culqi-webhook` devuelva `502` si falla la actualización de `payment_attempts`, para que Culqi reintente; también actualiza `updated_at` y limpia `failure_code` al autorizar.
- Regresión nueva: `tests/payment-webhook.test.ts`; focalizadas 15/15, lint, typecheck y escaneo de secretos verdes.
- CI PR #36 quedó 6/6 verde. No cambia la APK funcional; la última build debug disponible sigue siendo `df86977`.
- Preflight de red contra el proyecto canónico sigue devolviendo HTTP 404 en las tres Edge Functions; no se declara producción lista.

## Checkpoint F27.8: cierre seguro al cancelar pedido (2026-09-14)

- Se añadió un trigger que marca como fallido cualquier intento de billetera pendiente cuando el pedido pasa a cancelado; candidatos y verificación final también excluyen pedidos cancelados o entregados.
- Regresión pgTAP preparada para comprobar cancelación después de crear el intento, ausencia de candidato y rechazo de la autorización.
- Evidencia local: 62 suites/257 pruebas, lint, typecheck y `git diff --check` verdes. La validación SQL depende de CI porque esta máquina no tiene Postgres local.
- Pendiente externo sin cambios: CI, migración en Supabase real, credenciales/webhook, publicación y dos pagos físicos S/30.

## Checkpoint F27.9: identificador Android y APKs CI `53cb470` (2026-09-14)

- El Wallet Observer lee `title`, `text`, `bigText`, `subText`, `infoText` y `summaryText`, porque el código de la constancia puede aparecer en cualquiera de esos campos. Usa la clave opaca de Android y un hash del contenido solo para deduplicación local; nunca envía la notificación completa.
- La prueba del parser cubre un código en `subText`; la cola continúa cifrada y la observación sigue siendo evidencia no autorizante. El workflow Android dejó de pedir el paquete obsoleto `tools` y solicita solo `platform-tools`.
- Evidencia local: 62 suites/258 pruebas, lint, typecheck, escaneo de secretos, build frontend sintético y `git diff --check` verdes. CI PR #36 quedó 6/6 verde; Android run `34893689556` generó los tres roles.
- APK Rider: `output/apks/53cb470/Suya-Rider-debug.apk`; SHA-256 `ab7badc460eff36af31cfa51b2f2871999902141d8587c9e4bc9204845d90f07`.
- APK Back Office: `output/apks/53cb470/Suya-Backoffice-debug.apk`; SHA-256 `2184155a0a4a3e1daaa0b44dfc590748208536e0016a381e3d8a2f1e1f5042f2`.
- APK Caja: `output/apks/53cb470/Suya-Wallet-Observer-debug.apk`; SHA-256 `ce03e2045e41aed9972e873001bb2aac9a179c17a750d5440cc8eba872751753`.
- Las tres pasaron `unzip -tqq` y siguen siendo debug. `verify:production` y `verify:payments` locales siguen rechazando la ausencia de configuración real; faltan migraciones/Edge Functions, webhook, publicación y dos pagos físicos iguales de S/30.

## Checkpoint F27.10: conciliación sin respuestas atrasadas y APKs CI `a5cd734` (2026-09-14)

- Back Office asigna un identificador monotónico a cada recarga de observaciones y descarta respuestas viejas; la lista visible no puede retroceder mientras se buscan o verifican pagos.
- Regresión UI: dos recargas automáticas fuera de orden conservan la observación más nueva. Evidencia local: 62 suites/259 pruebas, lint, typecheck, escaneo de secretos, build sintético y diff limpios.
- CI PR #36 quedó 6/6 verde; Android run `34900548019` generó los tres roles. Rider `980ace1870e886943cb86e2c54bd377a51ca93fe6dd306c35599cc8d587276e9`, Back Office `6e5ad497344930c75ce362a334b98bdf1808bc4b0b0acad2ebcccb972453f305`, Caja `c961a776dc093af7d5d7183dd80ea134690f8e645f8d894a91841352908f47a8`.
- Las tres APK pasaron `unzip -tqq` y siguen siendo debug. Producción continúa pendiente de configuración, migraciones/funciones, webhook, publicación, firma release y dos pagos físicos iguales de S/30.

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




