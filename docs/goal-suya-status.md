# Estado reanudable del goal de Suya

Último checkpoint: 2026-09-15 (America/Lima). Estado: **EN PROGRESO**.

## Objetivo operativo

Corregir y verificar los hallazgos de `E.md` para entregar cliente, restaurante, repartidor y caja con cobro directo al restaurante, conciliación asistida, destinatario exacto, cierre auditable, sin pasarela comercial obligatoria, sin cookies propias ni rastreo. Las notificaciones del teléfono son evidencia y nunca autoridad bancaria.

Regla de continuidad: mientras exista una tarea segura, autorizada y útil, ejecutar la siguiente acción del flujo G0–G12. No detenerse por duración, una compilación verde o un primer bloqueo; cambiar de hipótesis cuando se repita el mismo intento. Sí detenerse ante falta de autoridad, secretos, cuenta, firma, dispositivo o servicio externo, dejando este checkpoint.

## Baseline y entorno

| Dato | Evidencia |
|---|---|
| Repositorio | Suya Delivery (`suya-delivery.git`) |
| Rama inicial del checkpoint | `feat/backoffice-restaurant-ops` |
| HEAD inicial | `5a6a36f fix(backoffice): keep restaurant context for multi-store staff` |
| Node / Vite | Node `22.23.2`; Vite `8.2.1` |
| Pruebas antes de esta ejecución | 63 archivos / 281 pruebas |
| Estado actual | Implementación de caja, protección contra cargas obsoletas, cierre manual cash-only, contraste nativo, minimización de pedido invitado y reset de intentos de pago guardados en este checkpoint; `output/` conservado sin versionar |
| Prohibiciones respetadas | Sin pagos reales, producción, migraciones remotas, contratación, publicación o borrado destructivo |

## Cambios implementados en este checkpoint

- Checkout wallet delivery/menú/mesa: RPC atómico, oferta, coordenadas opcionales donde corresponde, intento y cuenta receptora en una transacción.
- `receiver_account_id` en intento, dispositivo y observación; ingestión aislada por dispositivo; verificación con código completo cuando existe, colisión ambigua rechazada y asignación única.
- Parser TS/Android: importes de cuatro o más dígitos, código hasta 64 caracteres, paquete explícito, fingerprint con clave estable y no autorización automática.
- Cola Android cifrada: binding por cuenta, reintentos, bloqueo sin expulsar pendientes, límite de 500 pendientes y estado visible; sin fallback en texto plano.
- Lista de pedidos acotada a 50 filas sin RPC de códigos por tarjeta; códigos solo en detalle autorizado.
- Contexto de restaurante global en Catálogo, Ofertas, Mesas, Repartidores y Dispositivos de pagos; alta de dispositivo exige cuenta receptora activa.
- Drawer opaco/isolate contra filtración visual de Leaflet; backoffice móvil con cuatro accesos frecuentes y menú “Más”.
- Navegaciones inferiores customer/Rider con superficies opacas: el contenido que pasa por debajo ya no se filtra a través del vidrio.
- Modal, BottomSheet y ExpandableSheet ahora son superficies blancas sólidas para impedir filtrado de Leaflet; regresión focal `motion.test.tsx` pasa 4/4.
- Checkout no bloquea por GPS: conserva dirección escrita y usa coordenadas solo si están disponibles.
- Cambio de pedido resetea estados de `PaymentInstructions` y `GuestOrderPage` para evitar respuestas obsoletas.
- Recuperación de invitado: el token de alta entropía puede viajar una sola vez en el fragmento URL, se guarda en sesión y se retira del historial; además se preasigna antes del RPC y permite repetir el mismo payload sin duplicar ni perder acceso; nunca se usa el código corto como autorización.
- La pantalla de pedido invitado ya no persiste el objeto completo en `sessionStorage`: teléfono, dirección, códigos y referencia de pago no quedan en la caché local; la recarga recupera por token y RPC server-side.
- Migración `20260915100000_guest_idempotency_recovery.sql`: huella server-side del payload, token guest recuperable, coordenadas dentro de la creación atómica y contratos SQL actualizados; añade prueba pgTAP para conflicto, permisos y firmas.
- Migración `20260915110000_internal_order_mutation_context.sql`: las RPC `SECURITY DEFINER` habilitan capacidades transaccionales locales para coordenadas, verificación y cancelación; los clientes siguen sin `UPDATE` directo.
- Migración `20260915120000_payment_intent_refresh_qualification.sql`: renovación de wallet califica `status`/`expires_at` para evitar ambigüedad con parámetros de salida; los fixtures SQL exigen receptor exacto y diferencian limpieza administrativa de acciones cliente.
- Analytics/UTM convertido en no-op estricto; la sesión nativa no persiste refresh token en Web Storage.
- Routing vial privacy-first: no hay host público por defecto; `VITE_ROUTING_URL` solo admite endpoint same-origin/HTTPS autorizado y el mapa conserva trazo local sin enviar GPS cuando falta.
- Actualización móvil integrity-first: el cliente solo acepta manifiestos JSON de `https://suyadelivery.com/mobile-updates/`, valida bundle, ZIP, checksum y firma no vacía, y cancela la consulta tras 10 s; el script de publicación valida origen/base URL y bundle ID sin imprimir secretos. CSP y `_headers` fijan el origen y `Content-Type` de manifest/ZIP; ya no se declaran hosts de Google Analytics/Tag Manager.
- Android `versionCode 5`, `versionName 1.4`; se desbloqueó temporalmente la toolchain local y se generaron APKs debug separados de Rider, Backoffice y Wallet Observer.
- Caja por restaurante y turno: `cash_register_sessions`/`cash_register_entries`, apertura, cobro, ajustes y cierre idempotentes; el saldo esperado se calcula en servidor y el arqueo exige explicación cuando hay diferencia.
- Pedidos delivery en efectivo y mesas con pago en efectivo quedan vinculados al turno; el reintento de mesa reutiliza `payment_request_id` y no duplica el movimiento.
- La ruta de cierre manual de mesas quedó limitada a `cash` en el contrato TypeScript y en la RPC; métodos digitales no pueden marcar una mesa como pagada sin su autorización propia.
- `MainActivity` fija el color y el contraste claro de las barras de estado/navegación después del splash; reduce el riesgo de iconos claros sobre fondos pálidos en Android con `targetSdk 36`, sin superponer ni redimensionar el layout web.
- Guardia adicional de evidencia wallet: un trigger server-side serializa por cuenta, proveedor, importe y código visible, y rechaza que una observación ya consumida autorice otro intento; el segundo dispositivo queda para revisión manual. Se añadió regresión pgTAP de 23 aserciones.
- Guardia de receptor activo: `20260915150000_active_wallet_receiver_guard.sql` rechaza crear o ingresar nuevas filas ligadas a una cuenta receptora desactivada y conserva el histórico para auditoría.
- Cola Android: cuando se alcanza el límite de 500, la selección conserva primero el evento nuevo y todos los pendientes; solo puede descartar historial ya sincronizado. Se añadió regresión nativa para 400 pendientes + 100 históricos.

## Matriz de hallazgos

Estados usados: pendiente, en corrección, en verificación, verificado, bloqueado. Un bloqueo de entorno no es aprobación.

| ID | Estado | Evidencia actual | Pendiente / salida |
|---|---|---|---|
| P-01 | En verificación | Conteo global de coincidencias y test SQL preparados; índice de asignación única añadido | Ejecutar `npm run db:test` con Postgres local y concurrencia |
| P-02 | En verificación | `eventId` estable por binding/notificación, conflicto técnico único y trigger de no reutilización entre dispositivos/concurrencia | Ejecutar migraciones `20260915140000` y `20260915150000` en DB oficial y caso SQL multiequipo |
| P-03 | En verificación | `receiver_account_id` en intento/dispositivo/observación y QR por cuenta exacta | Instalar migración y probar cambio de cuenta |
| P-04 | En verificación | RPC atómico para los tres canales; oferta y pago dentro de la transacción | Test de rollback y actualización limpia en DB local |
| P-05 | En verificación | Parser TS y test de `S/ 1000.00`; parser Java actualizado; pruebas unitarias Android 4/4 pasan | Matriz Android real por versión de billetera |
| P-06 | En verificación | Binding guardado, cola separa eventos por binding y re-vinculación no reenvía | Prueba Android de rotación/revocación |
| P-07 | En verificación | Lock de cola, 500 pendientes, reintentos y estado `queueFull`; selección pending-first corregida y test nativo 5/5 | Prueba Android offline/reinicio/concurrencia en dispositivo |
| P-08 | En verificación | Adaptadores por paquete y palabras; caso Yape probado | Matriz Android real por versión de billetera |
| P-09 | En verificación | Código normalizado hasta 64; sufijo solo pista y código completo requerido para colisión | Ejecutar SQL y Android; confirmar límites de proveedor |
| P-10 | En verificación | Renovación conserva cuenta histórica y rechaza cuenta desactivada | Ejecutar migración y caso de vencimiento |
| P-11 | En verificación | Textos de pago no prometen unicidad por código/hash ni exponen detalles internos; evidencia separada y reset por pedido/intento | Revisión sobre APK final |
| U-01 | En verificación | Drawer opaco, `isolate`, portal `z-[1100]`; test/build web pasan | Captura sobre APK final con mapa normal/expandido |
| U-02 | Verificado local | Navegación móvil compacta + drawer “Más”; `backoffice-layout.test.tsx` pasa | Confirmar en Android final |
| U-03 | En verificación | Store global en cinco módulos; pruebas focalizadas de contexto pasan | Cambiar dos restaurantes con respuestas lentas y probar permisos |
| U-04 | En verificación | Selector de cuenta no recarga en loop; binding exige cuenta activa | Probar Yape→Lemon en dispositivo con DB real |
| U-05 | En verificación | `MainActivity` fija barras y contraste; `:app:test` pasa y los tres APK compilan; el CSS conserva safe-area | Confirmar en Android 15/16 real, teclado, cutout y navegación gestual |
| U-06 | En verificación | GPS opcional y dirección escrita permitida; servidor valida coordenadas cuando llegan | E2E delivery/recojo/mesa y cobertura |
| U-07 | En verificación | Carga por `id` siempre reinicia estado; pago se actualiza por intento | E2E offline/retorno a app/última actualización |
| U-08 | En verificación | Reset por `order.id` e `attemptId`, respuestas obsoletas y estados separados; regresión focal pasa | E2E navegando entre dos pedidos |
| U-09 | En verificación | Capturas web customer/Rider a 390×844; `scrollWidth === viewport` y barras inferiores opacas para no filtrar texto | Capturas sobre APK final a 360×800, mapa normal/expandido, leyendas/atribución y estados largos |
| U-10 | En verificación | Navegación por teclado sobre bundle customer: 16 destinos con nombre y visibles; controles sin nombre: 0 | axe/contraste/TalkBack, fuente ampliada y validación nativa |
| A-01 | En verificación | Rutas wallet atómicas; helper v2 calcula huella con canal/método/oferta/mesa/datos y rechaza conflicto; cliente reutiliza request y token guest | Ejecutar SQL/pgTAP y E2E real tras pérdida de respuesta/concurrencia |
| A-02 | En verificación | Contratos distintos para delivery, menú y mesa; GPS ya no se exige universalmente y coordenadas entran en la creación | DB limpia + E2E por modalidad |
| A-03 | En verificación | Test y bundle customer real: token sintético de 64 caracteres se conserva en sesión, `location.hash` queda vacío después de cargar; tests focales 19/19 cubren reintento guest y refresco de pago con token estable | E2E con recarga, enlace en otro contexto y pérdida de respuesta sin duplicar pedido |
| A-04 | Verificado local | `analytics.ts` no carga script, no persiste UTM ni emite eventos; tests y build pasan | Confirmar red/`Set-Cookie` en E2E |
| A-05 | En verificación | Native Supabase no persiste refresh token en Web Storage; `tests/supabase-client-auth.test.ts` cubre Android/web 2/2; token observador usa Keystore | Compilar Android y probar cierre/reinicio; evaluar secure storage de sesión |
| A-06 | Verificado local | `.range(0,49)` y sin N+1 de códigos; test de servicio pasa | Confirmar paginación/índice en DB |
| A-07 | En verificación | Migración nueva forward-only y test pgTAP añadido | Instalación limpia, actualización y rollback restaurable |
| A-08 | En verificación | APKs debug Rider/Backoffice/Wallet Observer generadas con versionCode 5/versionName 1.4; hashes registrados abajo | Capturas, instalación/actualización y firma release |
| A-09 | En verificación | RPC account-aware, token hash, auditoría y guardia que rechaza bindings/observaciones de cuentas receptoras inactivas | SQL/RLS/concurrencia en DB local |
| A-10 | En verificación | Navegador sin cookies ni tracking; pedido invitado no se guarda completo en Web Storage; su huella de recuperación es SHA-256 de 64 hex y no contiene PII; correo solo se conserva si el checkout opcional de gateway lo requiere; controles sin nombre: 0; Edge Functions ya no registran cuerpos crudos externos (`tests/privacy-logs.test.ts`, 1/1) | Confirmar red/Set-Cookie y minimización en E2E con backend, más revisión final de logs, GPS, teléfonos, direcciones y permisos |
| A-11 | En verificación | El mapa no usa `router.project-osrm.org`; sin endpoint privado/autorizado no hace requests y conserva un trazo local; el build productivo rechaza el host público; `tests/route-planner.test.ts` cubre 2 casos | Validar un endpoint same-origin/privado real y su política de retención sin exponer GPS a terceros |

## Verificaciones ejecutadas

- `npm run typecheck`: pasa.
- `npm run lint`: pasa sin warnings.
- `npm test -- --run`: **68 archivos / 301 pruebas pasan** tras añadir las regresiones de privacidad de logs, configuración de sesión nativa/web, huella guest sin PII, correo mínimo, routing sin exposición pública de GPS y OTA/CSP junto con privacidad del pedido invitado, reset de intento, caja auditable, cobro de mesas y cambio rápido de restaurante.
- Pruebas focalizadas de acceso invitado/order/payment/layout: 19/19 pasan.
- `tests/backoffice-layout.test.tsx`, `tests/cash-register-page.test.tsx`, `tests/supabase-cash-register.test.ts` y privacidad invitado: **12/12** pasan; la carga obsoleta no reemplaza la cuenta y el pedido completo no queda en Web Storage.
- `npm run build`: pasa.
- `npm run security:secrets`: pasa; 911 archivos sin patrones de secreto.
- Prueba focal de rutas/configuración/mapa: **11/11**; endpoint OSRM público rechazado, request omitido sin endpoint autorizado y endpoint HTTPS sintético aceptado.
- Build/aislamiento de bundles customer, rider y backoffice con configuración local sintética: pasa.
- Smoke visual/a11y web: customer, Rider y Backoffice pasan **12/12** en 360×800, 390×844, tablet y desktop sin overflow; barras inferiores no filtran texto; keyboard traversal customer con 16 controles nombrados/visibles y 0 sin nombre. `scripts/browser-smoke.mjs` comprueba además `document.cookie` vacío y cero scripts con origen externo; ambos checks pasan.
- Evidencia gráfica web final a 390×844, capturada después del loader: `output/evidence/goal-20260915/customer-390x844.png`, `rider-390x844.png` y `backoffice-390x844.png`; las tres respuestas fueron HTTP 200, sin errores de página, cookies, tracking ni overflow. La evidencia nativa sobre APK sigue pendiente.
- Bundle customer compilado: recuperación guest E2E sintética pasa (`#access` se consume y el token queda en sesión); los errores observados son solicitudes a Postgres local no disponible.
- `npm run test:e2e` con previews de los tres bundles levantados: pasa **12/12 combinaciones** (customer/Rider/Back Office en 360×800, 390×844, tablet y desktop), con HTTP 200, ruta/encabezado esperado, sin overflow, controles nombrados y sin `pageerror`.
- La primera revalidación posterior al reset devolvió 12 timeouts porque el preview se lanzó sin `--outDir` y respondió 404; se descartó como fallo del harness. Repetido con un preview separado por bundle (`npx vite preview --outDir dist/customer`, `dist/rider` y `dist/backoffice`, todos con `--strictPort`), el smoke pasa **12/12** y los tres previews responden 200.
- Revalidación posterior a la integración de caja (2026-09-15): `npm run build:apps` con configuración pública sintética volvió a compilar los tres bundles y `npm run test:e2e` volvió a pasar **12/12**; los previews se levantaron desde `dist/customer`, `dist/rider` y `dist/backoffice` y respondieron 200 en sus rutas SPA.
- Revalidación posterior a la minimización de privacidad, reset de intentos, contrato de sesión, saneamiento de logs y bloqueo de routing público (2026-09-15): suite completa **68 archivos / 301 pruebas**, typecheck, lint, escaneo de secretos (**909 archivos**), bundles aislados, smoke web **12/12** y `npm run build:mobile:roles` pasan; la huella guest usa SHA-256 sin persistir nombre, teléfono, dirección ni coordenadas; el correo solo se conserva para gateway opcional; el cliente no envía GPS a OSRM público y el fallback queda local. El APK no incorpora la caché completa del pedido invitado porque esa ruta pertenece al bundle customer web, pero las tres variantes Android se reconstruyeron y validaron.
- OTA/CSP (2026-09-15): 7/7 pruebas focales pasan; el cliente exige origen/ruta exactos, content-type JSON, ZIP seguro, checksum SHA-256, firma presente y timeout con `AbortController`. El endpoint productivo consultado respondió HTML con HTTP 200, por lo que se rechaza y no se activó ni desplegó OTA; falta publicar/validar el manifest firmado con autorización.
- `npm run verify:payments`: rechazado por configuración productiva ausente; correcto para este entorno sin despliegue.
- `npm run build:apps` con configuración pública sintética y `VITE_CULQI_GATEWAY_ENABLED=false`: pasa; customer, Rider y Backoffice quedan aislados.
- `npm run verify:apps`: pasa y confirma bundles customer, rider y backoffice aislados. `npm run verify:cloudflare` y `npm run verify:production` rechazan correctamente el entorno sin variables/orígenes de publicación; no se intentó desplegar.
- Rebuild final de bundles y smoke sobre `dist/customer`, `dist/rider` y `dist/backoffice` (2026-09-15): `npm run verify:apps` pasa y `npm run test:e2e` pasa **12/12** con cookies vacías y cero scripts externos.
- Android: `bash android/gradlew test --no-daemon` pasa 4/4 pruebas unitarias y `assembleDebug` pasa para Rider, Backoffice y Wallet Observer; el ajuste nativo de barras compila; advertencia existente de API deprecada en `YapeNotificationListenerService.java`, sin fallo de compilación.
- Android posterior a la corrección de cola (2026-09-15): `bash android/gradlew test --no-daemon` pasa **5/5** pruebas unitarias, incluyendo que 400 eventos pendientes sobreviven a 100 históricos sincronizados bajo el límite de 500; el build compila sin errores.
- Revalidación posterior a la guardia de evidencia (2026-09-15): typecheck, lint, suite web **68/301**, escaneo de secretos (**911 archivos**) y reconstrucción de APKs debug pasan; `git diff --check` pasa. La prueba oficial SQL sigue pendiente por el runtime local (`127.0.0.1:54322` rechazado también tras la migración de receptor activo).
- Reconstrucción final posterior al ajuste nativo y a la revisión de privacidad: `npm run build:mobile:roles` volvió a compilar y empaquetar Rider, Backoffice y Wallet Observer con `versionName 1.4`/`versionCode 5`; `unzip -tqq` y `apksigner verify` v2 pasan en las tres APK.
- PostgreSQL temporal 17.6.1 con esquema mínimo oficial de Auth/Storage equivalente: instalación limpia de **53 migraciones**, `seed.sql` y **24/24 archivos pgTAP** pasan; la migración de caja (`20260915130000`) es la número 54 y queda pendiente de repetir en el flujo oficial. Es evidencia independiente del port-forward, no reemplaza `supabase db lint/test`.
- APK Rider debug: `output/android/Suya-Rider-debug.apk`, 25,371,041 bytes, SHA-256 `4a430701ce30c497e8b63c3d415770bd078e5bebf527577c208e979687a7db4a`, paquete `com.suya.rider`, `versionName 1.4`, `versionCode 5`.
- APK Backoffice debug: `output/android/Suya-Backoffice-debug.apk`, 25,238,844 bytes, SHA-256 `390b0fb0baf2f0127853e2d49684bcac7a86f32c7ac2d717e96aceade516a388`, paquete `com.suya.backoffice`, `versionName 1.4`, `versionCode 5`.
- APK Wallet Observer debug: `output/android/Suya-Wallet-Observer-debug.apk`, 25,191,944 bytes, SHA-256 `020fe42f548e89b5d04e6792a8fd1c16f097b740453d46124c753c75f9239244`, paquete `com.suya.walletobserver`, `versionName 1.4`, `versionCode 5`.
- Las tres APK pasan `unzip -tqq` y `apksigner verify` con APK Signature Scheme v2; están firmadas con la clave debug del entorno y no son entregables de producción.

## Bloqueos reproducibles

1. `npm run db:lint` no conecta a `127.0.0.1:54322`; `npm run db:start` tampoco puede conectar al socket Docker normal. Se probó un daemon rootless temporal con `vfs`, cgroups desactivados y seccomp/AppArmor aislados: la red `none` no permite aliases, `host` rechaza aliases y la red rootless con `slirp4netns` sí crea `bridge`, pero el contenedor Postgres queda saludable sin publicar el puerto hacia el host; la CLI termina con `LegacyDbConnectError` (timeout/conexión terminada) y limpia el contenedor. No se modificó el sistema ni el código para ocultarlo. La suite SQL sí fue validada de forma independiente en PostgreSQL temporal; queda pendiente repetirla mediante el flujo oficial de Supabase cuando exista daemon/puerto normal.
2. La toolchain Android se preparó temporalmente en el entorno y permite test/build debug; `adb devices` no muestra dispositivos y el SDK temporal no tiene emulator/system image disponible (el catálogo remoto tampoco descargó). Sigue pendiente instalación, teclado, insets, TalkBack, offline/reinicio y visuales nativos.
3. No se dispone de firma release ni autorización para pagos reales; la firma debug no habilita distribución ni prueba financiera.

## Siguiente acción exacta

1. Con Docker Desktop/daemon normal disponible, ejecutar `npm run db:start`, `npm run db:lint` y `npm run db:test`; incluir `20260915140000_wallet_evidence_reuse_guard.sql` y `20260915150000_active_wallet_receiver_guard.sql`, corregir sintaxis/RLS/concurrencia y actualizar esta matriz. El experimento rootless temporal ya no debe repetirse salvo que cambie el runtime o la publicación de puertos.
2. Completar A-03, U-09, U-10 y A-10 con E2E business de recuperación, visuales, accesibilidad y privacidad; completar E2E de las cuatro modalidades cuando el backend local esté disponible.
3. Completar capturas/instalación/actualización y pruebas físicas cuando haya dispositivo; conservar los hashes debug como evidencia de prueba, no como release.
4. Validar A-11 con endpoint privado/same-origin autorizado y política de retención; no activar un router público.
5. Repetir suite global, build, aislamiento, seguridad y matriz completa. Solo entonces evaluar G10–G12; no marcar el goal completo mientras queden bloqueos o casillas obligatorias.
6. Antes de habilitar OTA, publicar mediante el flujo autorizado un `latest.json` real con firma privada fuera del repositorio, verificar content-type/CORS/cache-control, checksum, firma y retención; el endpoint actual HTML no cuenta como manifest.
