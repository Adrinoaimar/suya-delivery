# Estado reanudable del goal de Suya

Último checkpoint: 2026-09-16 (America/Lima). Estado: **EN PROGRESO**.

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
- Guardia adicional de evidencia wallet: un trigger server-side serializa por cuenta, proveedor, importe y código visible, y rechaza que una observación ya consumida autorice otro intento; el segundo dispositivo queda para revisión manual. La regresión pgTAP conjunta declara 38 aserciones.
- Guardia de receptor activo: `20260915150000_active_wallet_receiver_guard.sql` rechaza crear o ingresar nuevas filas ligadas a una cuenta receptora desactivada y conserva el histórico para auditoría.
- Controles A-09: `20260915160000_wallet_observer_device_controls.sql` añade revocación/reactivación, rotación de token de un solo retorno, auditoría sin `token_hash`, localización por UUID en tokens nuevos y límite de 120 observaciones/minuto por dispositivo; los tokens legacy conservan fallback hasta rotación. El cliente ahora mapea `device_active` y la rotación conserva el estado revocado.
- Cola Android: cuando se alcanza el límite de 500, la selección conserva primero el evento nuevo y todos los pendientes; solo puede descartar historial ya sincronizado. Se añadió regresión nativa para 400 pendientes + 100 históricos.
- Declaración de pago manual: `PaymentInstructions` separa «Ya pagué» de «Aún no pagué» y bloquea la renovación mientras el estado server-side sea desconocido o exista una declaración. Permite registrar el nombre de otra persona sin tratarlo como autorización; un intento `refunded` no muestra QR ni acciones para repetir el cobro.
- Migración `20260915170000_payment_claims_and_late_review.sql`: claims auditables, HMAC privado de códigos, declaración protegida por usuario/token invitado, revisión tardía limitada a propuesta, receptor exacto, verificación final autorizada y auditoría sin hashes/códigos. Sus ramas autenticadas rechazan explícitamente `auth.uid() IS NULL`. El contrato legado `submit_payment_evidence` delega al flujo nuevo. Su prueba declara 15 aserciones; el conjunto acumulado de este bloque declara 53 (38 previas + 15 nuevas).
- Observaciones wallet: `observed_at` sigue siendo hora de la notificación; `created_at` se muestra como hora de recepción del servidor. No se presenta una hora bancaria inexistente.
- P-01: el fixture principal ahora cubre colisión exacta de dos intentos pendientes con el mismo HMAC completo; exige dos candidatos, rechazo de `verify_wallet_payment` y conservación de ambos pendientes (105 aserciones declaradas en ese fixture). La ejecución oficial sigue pendiente.
- P-09: `20260916110000_context_bound_payment_evidence_hmac.sql` añade HMAC v2 privado ligado a receptor y tipo de evidencia, columnas separadas para compatibilidad legacy y exclusión del nuevo HMAC en auditoría; su contrato declara 12 aserciones. La ejecución oficial sigue pendiente.
- P-02: `20260916120000_wallet_evidence_reuse_identity_guard.sql` deja de bloquear por últimos cuatro cuando existe fingerprint/HMAC completo; la regresión de mismo sufijo y código distinto amplía el fixture conjunto a 40 aserciones. La ejecución oficial sigue pendiente.
- U-09: `LeafletMap` reserva una columna derecha para la atribución OSM y apila leyendas/errores en una columna izquierda con límites de ancho; la atribución nativa duplicada queda desactivada para evitar superposición en mapas móviles estrechos.
- P-04/P-10/A-01: `20260916130000_payment_intent_terminal_retry.sql` conserva la clave determinista para el primer intento, reutiliza el intento activo bajo `FOR UPDATE` y genera una clave `:retry:<uuid>` después de un intento terminal; evita que la unicidad global bloquee reintentos legítimos. El contrato SQL declara 6 aserciones y queda pendiente del runtime oficial.
- A-05: Android ya persiste la sesión Supabase mediante `SuyaSecureStoragePlugin`: AES-GCM con clave no exportable de Android Keystore, ciphertext en preferencias privadas y sin fallback plaintext. El navegador conserva su almacenamiento web; iOS no simula persistencia segura.
- P-11: `get_payment_receiver_label` devuelve solo la etiqueta de la cuenta receptora activa al propietario o token guest válido; `PaymentInstructions` muestra el destinatario junto al QR y oculta el QR si no puede validarlo. Focal pagos/UI 28/28.
- A-02: un pedido con `tableId` ya no sobrescribe `profiles.default_address/default_reference`; la regresión focal de servicio pasa 9/9.

## Matriz de hallazgos

Estados usados: pendiente, en corrección, en verificación, verificado, bloqueado. Un bloqueo de entorno no es aprobación.

| ID | Estado | Evidencia actual | Pendiente / salida |
|---|---|---|---|
| P-01 | En verificación | Conteo global de coincidencias, índice de asignación única y fixture de colisión exacta (105 aserciones) | Ejecutar `npm run db:test` con Postgres local y concurrencia |
| P-02 | En verificación | `eventId` estable por binding/notificación, conflicto técnico único y trigger de no reutilización por la identidad más fuerte; mismo sufijo con fingerprint distinto no bloquea (fixture 40 aserciones) | Ejecutar migraciones `20260915140000`/`20260916120000` y caso SQL multiequipo en DB oficial |
| P-03 | En verificación | `receiver_account_id` en intento/dispositivo/observación y QR por cuenta exacta | Instalar migración y probar cambio de cuenta |
| P-04 | En verificación | RPC atómico para los tres canales; oferta y pago dentro de la transacción; reintento terminal usa clave nueva bajo lock de pedido | Test de rollback, reintento y actualización limpia en DB local |
| P-05 | En verificación | Parser TS y test de `S/ 1000.00`; parser Java actualizado; pruebas unitarias Android 4/4 pasan | Matriz Android real por versión de billetera |
| P-06 | En verificación | Binding guardado, cola separa eventos por binding y re-vinculación no reenvía | Prueba Android de rotación/revocación |
| P-07 | En verificación | Lock de cola, 500 pendientes, reintentos y estado `queueFull`; selección pending-first corregida y test nativo 5/5 | Prueba Android offline/reinicio/concurrencia en dispositivo |
| P-08 | En verificación | Adaptadores por paquete y palabras; caso Yape probado | Matriz Android real por versión de billetera |
| P-09 | En verificación | Código normalizado hasta 64; HMAC v2 privado ligado a receptor/tipo, HMAC legacy aislado para transición, auditoría saneada y contrato de 12 aserciones | Ejecutar migración nueva en DB oficial y confirmar límites de proveedor |
| P-10 | En verificación | Renovación conserva cuenta histórica; una declaración vencida no se renueva, una cuenta desactivada se rechaza y un intento terminal no envenena el siguiente retry | Ejecutar migración nueva y caso de vencimiento/reintento/concurrencia |
| P-11 | En verificación | Copy no promete confirmación; declaración separada, pagador opcional, reset por intento, reembolso sin QR/reintento y destinatario activo visible/validado antes del QR; focal pagos/UI 28/28 | Revisión sobre APK final y estados reales |
| U-01 | En verificación | Drawer opaco, `isolate`, portal `z-[1100]`; test/build web pasan | Captura sobre APK final con mapa normal/expandido |
| U-02 | Verificado local | Navegación móvil compacta + drawer “Más”; `backoffice-layout.test.tsx` pasa | Confirmar en Android final |
| U-03 | En verificación | Store global en cinco módulos; pruebas focalizadas de contexto pasan | Cambiar dos restaurantes con respuestas lentas y probar permisos |
| U-04 | En verificación | Selector de cuenta no recarga en loop; binding exige cuenta activa | Probar Yape→Lemon en dispositivo con DB real |
| U-05 | En verificación | `MainActivity` fija barras y contraste; `:app:test` pasa y los tres APK compilan; el CSS conserva safe-area | Confirmar en Android 15/16 real, teclado, cutout y navegación gestual |
| U-06 | En verificación | GPS opcional y dirección escrita permitida; servidor valida coordenadas cuando llegan | E2E delivery/recojo/mesa y cobertura |
| U-07 | En verificación | `GuestOrderPage` reinicia carga por `id`/token, «Actualizar estado», recuperación `online` y retorno mediante `visibilitychange` disparan nuevas consultas, y muestra última actualización; regresión y suite relacionada 29/29 pasan | E2E offline/retorno a app/última actualización |
| U-08 | En verificación | Reset por `order.id` e `attemptId`, respuestas obsoletas, sesiones de checkout invalidables y estados separados; regresión focal pagos 15/15 pasa | E2E navegando entre dos pedidos |
| U-09 | En verificación | Capturas web a 390×844, `scrollWidth === viewport`, barras opacas y pie de mapa dividido en columnas de estado/atribución; focal mapa/tracking/operaciones 13/13 | Capturas sobre APK final a 360×800, mapa normal/expandido, leyendas/atribución y estados largos |
| U-10 | En verificación | Navegación por teclado sobre bundle customer: 16 destinos con nombre y visibles; controles sin nombre: 0; medición web 390×844 sin controles visibles menores de 44×44 y enlace de salto enfocado 178×44 | axe/contraste/TalkBack, fuente ampliada y validación nativa |
| A-01 | En verificación | Rutas wallet atómicas; helper v2 calcula huella con canal/método/oferta/mesa/datos y rechaza conflicto; cliente reutiliza request y token guest; retries terminales no colisionan con la clave global | Ejecutar SQL/pgTAP y E2E real tras pérdida de respuesta/concurrencia |
| A-02 | En verificación | Contratos distintos para delivery, menú y mesa; GPS ya no se exige universalmente, coordenadas entran en la creación y la mesa no modifica la dirección habitual del perfil; focal servicio 9/9 | DB limpia + E2E por modalidad |
| A-03 | En verificación | Test y bundle customer real: token sintético de 64 caracteres se conserva en sesión, `location.hash` queda vacío después de cargar; tests focales 19/19 cubren reintento guest y refresco de pago con token estable | E2E con recarga, enlace en otro contexto y pérdida de respuesta sin duplicar pedido |
| A-04 | Verificado local | `analytics.ts` no carga script, no persiste UTM ni emite eventos; tests y build pasan | Confirmar red/`Set-Cookie` en E2E |
| A-05 | En verificación | `SuyaSecureStoragePlugin` cifra Auth con AES-GCM y clave no exportable de Android Keystore; `secureStorage.ts` se inyecta solo en Android; `tests/supabase-client-auth.test.ts` verifica persistencia segura y PKCE; token observador usa Keystore; `create/get_payment_intent` rechazan explícitamente `auth.uid() IS NULL` | Probar en dispositivo cierre/reinicio/bloqueo/restauración/OAuth; revisar borrado y fallback de sesión |
| A-06 | En verificación | `OrderListOptions` offset/limit con máximo 50 en Supabase y mock, orden estable `created_at`+`id`, proyección de listado sin `gateway_qr_payload`, detalle separado y botón `Cargar más`; `supabase-order.test.ts` 10/10 y `orders.test.ts` 12/12 | Confirmar índice/plan, RLS y paginación contra DB oficial |
| A-07 | En verificación | Migración nueva forward-only y test pgTAP añadido | Instalación limpia, actualización y rollback restaurable |
| A-08 | En verificación | APKs debug Rider/Backoffice/Wallet Observer generadas con versionCode 5/versionName 1.4; hashes registrados abajo | Capturas, instalación/actualización y firma release |
| A-09 | En verificación | RPC account-aware, revocación/reactivación, rotación, auditoría sin secreto, token identificable y límite por dispositivo; guardia de receptor inactivo | SQL/RLS/concurrencia en DB local |
| A-10 | En verificación | Navegador sin cookies ni tracking; pedido invitado no se guarda completo en Web Storage; su huella de recuperación es SHA-256 de 64 hex y no contiene PII; correo solo se conserva si el checkout opcional de gateway lo requiere; controles sin nombre: 0; Edge Functions ya no registran cuerpos crudos externos (`tests/privacy-logs.test.ts`, 1/1) | Confirmar red/Set-Cookie y minimización en E2E con backend, más revisión final de logs, GPS, teléfonos, direcciones y permisos |
| A-11 | En verificación | El mapa no usa `router.project-osrm.org`; sin endpoint privado/autorizado no hace requests y conserva un trazo local; el build productivo rechaza el host público; `tests/route-planner.test.ts` cubre 2 casos | Validar un endpoint same-origin/privado real y su política de retención sin exponer GPS a terceros |

## Verificaciones ejecutadas

- `npm run typecheck`: pasa.
- `npm run lint`: pasa sin warnings.
- `npm test -- --run`: **68 archivos / 312 pruebas pasan** tras añadir la declaración manual, pagador opcional, reembolso sin repetición, HMAC privado, revisión tardía y separación de hora observada/hora recibida, además de las regresiones previas de privacidad, checkout, caja, mesa, cola y accesibilidad.
- Pruebas focalizadas de acceso invitado/order/payment/layout: 19/19 pasan.
- `tests/backoffice-layout.test.tsx`, `tests/cash-register-page.test.tsx`, `tests/supabase-cash-register.test.ts` y privacidad invitado: **12/12** pasan; la carga obsoleta no reemplaza la cuenta y el pedido completo no queda en Web Storage.
- `npm run build`: pasa.
- `npm run security:secrets`: pasa; 913 archivos sin patrones de secreto.
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
- Revalidación de controles A-09 (2026-09-15): typecheck, lint y pruebas focales de servicio/UI de dispositivos **17/17** pasan, incluida la regresión de `device_active`; la migración forward-only y sus 38 aserciones SQL quedan pendientes del runtime oficial.
- Reconstrucción final posterior a los controles A-09: `npm run build:mobile:roles` volvió a compilar y empaquetar Rider, Backoffice y Wallet Observer con `versionName 1.4`/`versionCode 5`; `unzip -tqq` y `apksigner verify` v2 pasan en las tres APK. Los hashes actuales quedan registrados abajo.
- Gate local final posterior a los controles A-09 y U-10: suite global **68 archivos / 306 pruebas**, typecheck, lint, `npm audit --omit=dev --audit-level=high` (0 vulnerabilidades) y `npm run security:secrets` (**913 archivos**) pasan; `db:lint`/`db:test` siguen bloqueados únicamente por la ausencia del Postgres oficial local.
- Revalidación U-10 web posterior a la corrección del enlace de salto (2026-09-15): los bundles actuales pasan smoke **12/12**; a 390×844 no hay controles visibles menores de 44×44 y el enlace enfocado mide 178×44 en customer, Rider y Backoffice. TalkBack, fuente ampliada y validación nativa siguen pendientes sin dispositivo.
- PostgreSQL temporal 17.6.1 con esquema mínimo oficial de Auth/Storage equivalente: instalación limpia de **53 migraciones**, `seed.sql` y **24/24 archivos pgTAP** pasan; la migración de caja (`20260915130000`) es la número 54 y queda pendiente de repetir en el flujo oficial. Es evidencia independiente del port-forward, no reemplaza `supabase db lint/test`.
- APK Rider debug: `output/android/Suya-Rider-debug.apk`, 25,371,081 bytes, SHA-256 `e5dd3c76abd9deb1bd906a631e14a563aeb1e35324c7f080480a267971729bbe`, paquete `com.suya.rider`, `versionName 1.4`, `versionCode 5`.
- APK Backoffice debug: `output/android/Suya-Backoffice-debug.apk`, 25,239,372 bytes, SHA-256 `838da484c2b88b586e431870c5e229d8b0da5e8b434174e18e8d7a5b4131171c`, paquete `com.suya.backoffice`, `versionName 1.4`, `versionCode 5`.
- APK Wallet Observer debug: `output/android/Suya-Wallet-Observer-debug.apk`, 25,191,988 bytes, SHA-256 `9ef9ee7fe546870e1c562181c870148849becfc9073ad9f29e122bfebb475a42`, paquete `com.suya.walletobserver`, `versionName 1.4`, `versionCode 5`.
- Las tres APK pasan `unzip -tqq` y `apksigner verify` con APK Signature Scheme v2; están firmadas con la clave debug del entorno y no son entregables de producción.
- Checkpoint local `a960237` (sobre `137c1e6`): la suite global **68/312**, focal payment/service/UI **33/33**, typecheck, lint, build, aislamiento, smoke web **12/12**, secretos (**915 archivos**), audit (**0 vulnerabilidades**) y `npm run build:mobile:roles` pasan. Android `test`/`assembleDebug` pasan con Java 21/SDK 36. APK Rider debug: `output/android/Suya-Rider-debug.apk`, **25,371,365 bytes**, SHA-256 `779adb9578e375479e73732e4d38c2877bb07b51a154c1313f1ce96131cbc83c`. Backoffice: `output/android/Suya-Backoffice-debug.apk`, **25,239,780 bytes**, SHA-256 `b7bd499c2d3a1ecd591d8980a9767e000c7717b246dbba387727dbd49dc676f`. Wallet Observer: `output/android/Suya-Wallet-Observer-debug.apk`, **25,192,036 bytes**, SHA-256 `3e7c7b1ffa6abd626264c4a8dd60882e0519bbe0a39821c12c2cd12a1b73bcdb`. Las tres son `versionName 1.4`/`versionCode 5`, ZIP íntegro y firma debug v2; no son release. La corrección de `auth.uid() IS NULL` está solo en SQL/pruebas, por eso no cambia los bytes de las APK.
- La validación SQL de este checkpoint declara **53 aserciones acumuladas** (38 previas + 15 nuevas), pero `npm run db:lint`/`npm run db:test` siguen pendientes porque el runtime oficial no está accesible. La prueba PostgreSQL independiente no sustituye el gate oficial.

## Seguimiento posterior — carrera de carga de billeteras (2026-09-15)

- Se reprodujo una carrera en `WalletsOperationsPage`: el refresco periódico de observaciones podía invalidar una carga inicial lenta y dejar invisibles los dispositivos sin error visible.
- `64b0b90` separa los contadores de carga completa y refresco periódico. La regresión mantiene ambas promesas pendientes, resuelve primero el refresco y confirma que la carga completa conserva dispositivo y observación inicial.
- Focal billeteras: **9/9**; wallet/payment/guest: **25/25**; suite global posterior: **69 archivos / 315 pruebas**; lint, typecheck, build:apps y smoke E2E **12/12** pasan. El cambio solo afecta Backoffice web; las APK debug `1.4/5` mantienen sus hashes.
- A-09/U-04 siguen en verificación hasta backend real, RLS, cambio de restaurante y restauración de red. No se declara cierre ni aprobación financiera por esta prueba mock.

## Seguimiento posterior — sede visible frente a permiso obsoleto (2026-09-15)

- Se reprodujo el caso en que `restaurantIds` conserva una sede ya no visible. Backoffice podía usar ese ID para cargar cuentas antes de que el operador escogiera la sede correcta.
- La corrección usa únicamente `stores` visibles y respalda con la primera sede visible; no consulta cuentas ni crea dispositivos contra un ID obsoleto. Regresión focal de billeteras: **10/10**; lint y typecheck pasan.
- Suite global posterior: **69 archivos / 316 pruebas**; lint, typecheck y `npm run build:apps` pasan. A-09/U-03 siguen en verificación hasta RLS y cambio de restaurante con backend real.

## Artefactos posteriores — APK debug tras `514784e` (2026-09-15)

- `npm run build:mobile:roles` pasa con configuración pública Supabase sintética; `unzip -tqq` y `apksigner verify` pasan en las tres variantes. Todas son `versionName 1.4`/`versionCode 5`, un firmante y APK Signature Scheme v2.
- Rider: `output/android/Suya-Rider-debug.apk`, **25,371,409 bytes**, SHA-256 `d61e757dd6f151305aefdc5ffbf3d542d086a84296751a68a8a6bf905cbf8757`, `com.suya.rider`.
- Backoffice: `output/android/Suya-Backoffice-debug.apk`, **25,239,788 bytes**, SHA-256 `26be4ead906f98d99ca5fb22d210977664411680ad17f7a016586a596342ee33`, `com.suya.backoffice`.
- Wallet Observer: `output/android/Suya-Wallet-Observer-debug.apk`, **25,192,072 bytes**, SHA-256 `589418bdbe5b39929da96fafdf67971bf9de9772e1d2be8944cd678ab92e93a1`, `com.suya.walletobserver`.
- No hay dispositivo/emulador conectado; son APK debug de prueba, no release. Instalación, actualización, accesibilidad nativa, offline, permisos y validación física continúan pendientes.

## Seguimiento posterior — actualización del comprobante invitado (2026-09-15)

- Se reprodujo un defecto real de U-07 en `GuestOrderPage`: el botón «Actualizar estado» vaciaba el comprobante sin cambiar las dependencias del efecto y no volvía a consultar el servidor.
- `dc9da5e` añade un contador de recarga, marca `loading`, revalida al recuperar `online`/visibilidad y muestra la última actualización; la regresión verifica nuevas consultas y restauración del comprobante. La carga obsoleta sigue protegida por el cleanup del efecto.
- Suite relacionada de pedidos/invitados: **28/28**. Regresión global posterior: **69 archivos / 314 pruebas**; lint, typecheck, `npm run build:apps` y smoke E2E **12/12** pasan.
- El cambio solo afecta el bundle customer web; no modifica Rider/Backoffice/Wallet Observer, por lo que las APK debug `1.4/5` existentes conservan su trazabilidad y no se reconstruyeron.
- U-07 sigue en verificación hasta E2E con backend real, retorno a la app, offline y frescura del estado de pago. No se convierte el test mock en aprobación física.

## Seguimiento posterior — regresión de retorno a primer plano (2026-09-15)

- `tests/guest-order-page.test.tsx` incorpora una regresión explícita para `visibilitychange`: si el comprobante invitado sigue montado al volver al primer plano, `GuestOrderPage` vuelve a consultar el pedido.
- Focal guest order: **3/3**; suite global posterior: **69 archivos / 317 pruebas**; `npm run lint`, `npm run typecheck` y `git diff --check` pasan.
- Es una cobertura de comportamiento del bundle customer web; no modifica las APK debug `1.4/5` ni sus hashes. U-07 continúa en verificación hasta E2E con backend real, offline y frescura del estado de pago.

## Seguimiento posterior — invalidación de checkout obsoleto (2026-09-15)

- Se reprodujo una carrera de Culqi: cambiar de pedido o intento mientras el modal seguía abierto podía dejar un callback tardío con capacidad de cobrar o autorizar sobre el contexto nuevo.
- `db44f8d` ata cada checkout a `pedido:intento` e invalida callbacks `onToken`, `onOrder` y `onError` obsoletos, además de comprobar la clave después de operaciones asíncronas.
- `tests/payment-instructions.test.tsx` confirma que el callback del pedido anterior no llama `chargeCard` ni autoriza el pedido nuevo. Focal pagos: **15/15**; suite global posterior: **69 archivos / 318 pruebas**; lint, typecheck, `git diff --check`, `npm run build:apps` y smoke E2E **12/12** pasan.
- El cambio es web y no modifica los APK debug `1.4/5`. P-02/P-11/U-08 siguen en verificación hasta E2E con backend y proveedor de prueba autorizado; no se ejecutaron pagos reales.

## Seguimiento posterior — guardia explícita de identidad en intents (2026-09-15)

- Se detectó una condición SQL de autorización: `customer_id <> auth.uid()` no rechaza por sí sola un `auth.uid()` nulo. La migración forward-only `20260915180000_payment_identity_auth_guard.sql` reemplaza `create_payment_intent` y `get_payment_intent` con la condición explícita `auth.uid() IS NULL OR ...`.
- El acceso guest sigue dependiendo exclusivamente del token recuperable; las órdenes autenticadas requieren la sesión del propietario. Se conservaron `SECURITY DEFINER`, firmas y grants para `anon`/`authenticated`.
- El contrato `supabase/tests/20260915180000_payment_identity_auth_guard.test.sql` declara **6 aserciones** sobre guardia, seguridad y privilegios. `npm run lint`, `npm run typecheck` y `git diff --check` pasan; la ejecución pgTAP queda pendiente del runtime oficial Supabase/Postgres.
- Este cambio es SQL y no modifica las APK debug `1.4/5`; no se ejecutaron pagos reales ni se amplió autorización de producción.

## Seguimiento posterior — wrappers seguros para Culqi opcional (2026-09-15)

- Se revisaron también las RPC legacy usadas por el adaptador Culqi opcional. `20260915190000_culqi_identity_wrappers.sql` añade un helper de identidad único y wrappers para crear intent, reservar orden/cargo, autorizar y fallar claims; todos validan el propietario o el token guest antes de delegar.
- Los Edge Functions ahora llaman solo los wrappers `_secure`; las RPC legacy de lectura/estado quedaron revocadas para `anon`/`authenticated` y no hay una ruta pública que dependa de la comparación nula.
- `supabase/tests/20260915190000_culqi_identity_wrappers.test.sql` declara **12 aserciones** de identidad, delegación, privilegios y revocación. El conjunto documentado queda en **71 aserciones**; lint, typecheck, suite web 69/318, build y smoke 12/12 pasan. La validación SQL oficial sigue pendiente del runtime local.
- Culqi continúa siendo opcional y deshabilitado en esta prueba; no se procesaron tarjetas, transferencias ni pagos reales.

## Seguimiento posterior — contrato de wrappers Culqi (2026-09-15)

- `tests/culqi-rpc-contract.test.ts` exige que `create-culqi-order` y `charge-culqi-card` llamen solo RPC `_secure` y rechaza rutas legacy; focal **1/1**.
- Suite global actual: **70 archivos / 319 pruebas**; `npm run lint`, `npm run typecheck` y `git diff --check` pasan. Las dos Edge Functions compilan con Bun.
- Las **71 aserciones pgTAP** siguen pendientes del runtime oficial porque Docker/Supabase local no está accesible. Culqi permanece opcional/deshabilitado; no hubo cobros reales.
- Próximo gate: `npm run db:start`, `npm run db:lint` y `npm run db:test`; luego RLS/concurrencia, E2E financiero de prueba, dispositivo/offline/accesibilidad y firma release. El goal continúa abierto.

## Seguimiento posterior — controles táctiles del mapa (2026-09-15)

- La auditoría UI detectó que zoom in/out usaban 36×36 px. `LeafletMap` ahora usa `h-11 w-11` (44×44 px) y `tests/map-controls.test.ts` fija el contrato de los controles principales; focal **1/1**.
- Suite global actual: **71 archivos / 320 pruebas**; lint, typecheck, build aislado y smoke E2E **12/12** pasan. No cambia pagos ni las APK debug.
- Captura nativa/TalkBack siguen pendientes sin dispositivo; DB/RLS oficial continúa bloqueado por Docker/Supabase local inaccesible. El goal sigue en progreso.

## Artefactos posteriores — APKs con controles de mapa actualizados (2026-09-15)

- `npm run build:mobile:roles` terminó con JDK 21/SDK 36; Android `test` **5/5**, `assembleDebug`, `unzip -tqq` y `apksigner verify` v2 pasan en las tres variantes. Todas son debug `1.4/5`, no release.
- Rider: `output/android/Suya-Rider-debug.apk`, **25,371,385 bytes**, SHA-256 `37021829ba121d013616e4580532c765910e3de07b17b3e68934c9dccf568930`, `com.suya.rider`.
- Backoffice: `output/android/Suya-Backoffice-debug.apk`, **25,239,780 bytes**, SHA-256 `6af59f2fb008842bc2c2ae51c0050a895fa402189f0e9fd27c15f3b1c6332c4a`, `com.suya.backoffice`.
- Wallet Observer: `output/android/Suya-Wallet-Observer-debug.apk`, **25,192,060 bytes**, SHA-256 `7c5d98f49debef7d0dbebb3385d5608be9c58bbb48eaa770d99061a325a73e5e`, `com.suya.walletobserver`.
- La captura/instalación física, actualización, TalkBack, fuente ampliada y offline nativo siguen pendientes por falta de dispositivo/emulador.

## Corrección posterior — contexto visible y APK asociada (2026-09-16)

- `10ecf41` corrige el fallback final de `WalletsOperationsPage`: el contexto persistido se valida contra `visibleStores`, nunca contra un `restaurantId` obsoleto.
- Regresión focal de billeteras **10/10**, operaciones Backoffice **21/21**, suite global **71 archivos / 320 pruebas**; lint, typecheck, `npm run build:apps`, `npm run test:e2e` (**12/12**) y diff pasan.
- `build:mobile:roles`, ZIP, `apksigner verify` v2 y `aapt dump badging` pasan. Rider conserva SHA-256 `37021829ba121d013616e4580532c765910e3de07b17b3e68934c9dccf568930`; Backoffice actualizado: **25,239,776 bytes**, SHA-256 `4ce52695198084b3a71e1444fc1e61d9fae7db73a496ecc49d138eb4bb8bec60`; Wallet Observer conserva SHA-256 `7c5d98f49debef7d0dbebb3385d5608be9c58bbb48eaa770d99061a325a73e5e`. Todas `1.4/5`, debug, un firmante y v2.
- Continúan pendientes DB/RLS oficial, E2E financiero con backend, dispositivo/offline/TalkBack/fuente ampliada/permisos, endpoint privado OTA, firma release y autorización de pagos reales.

## Verificación posterior — lint nativo Android (2026-09-15)

- `bash android/gradlew -p android lint --no-daemon` terminó `BUILD SUCCESSFUL` con JDK 21/SDK 36 temporales y reportó **sin nuevos problemas del proyecto**.
- Gradle solo indicó seis entradas históricas filtradas por el baseline de Capacitor y avisos generales de deprecación; no se atribuyó una regresión a Suya.
- Se complementa Android `test` **5/5**, `assembleDebug`, ZIP íntegro, v2 y hashes de §41. No sustituye instalación/actualización física, TalkBack, fuente ampliada, offline, permisos ni DB/RLS oficial.
- El siguiente gate sigue siendo `npm run db:start && npm run db:lint && npm run db:test` con runtime accesible; después E2E financiero sintético, dispositivo, endpoint privado OTA y firma release autorizada.

## Bloqueos reproducibles

1. `npm run db:lint` no conecta a `127.0.0.1:54322`; `npm run db:start` tampoco puede conectar al socket Docker normal. Se probó un daemon rootless temporal con `vfs`, cgroups desactivados y seccomp/AppArmor aislados: la red `none` no permite aliases, `host` rechaza aliases y la red rootless con `slirp4netns` sí crea `bridge`, pero el contenedor Postgres queda saludable sin publicar el puerto hacia el host; la CLI termina con `LegacyDbConnectError` (timeout/conexión terminada) y limpia el contenedor. No se modificó el sistema ni el código para ocultarlo. La suite SQL sí fue validada de forma independiente en PostgreSQL temporal; queda pendiente repetirla mediante el flujo oficial de Supabase cuando exista daemon/puerto normal.
2. La toolchain Android se preparó temporalmente en el entorno y permite test/build debug; `adb devices` no muestra dispositivos y el SDK temporal no tiene emulator/system image disponible (el catálogo remoto tampoco descargó). Sigue pendiente instalación, teclado, insets, TalkBack, offline/reinicio y visuales nativos.
3. No se dispone de firma release ni autorización para pagos reales; la firma debug no habilita distribución ni prueba financiera.

## Siguiente acción exacta

1. Con Docker Desktop/daemon normal disponible, ejecutar `npm run db:start`, `npm run db:lint` y `npm run db:test`; incluir `20260915140000_wallet_evidence_reuse_guard.sql`, `20260915150000_active_wallet_receiver_guard.sql` y `20260915160000_wallet_observer_device_controls.sql`, corregir sintaxis/RLS/concurrencia y actualizar esta matriz. El experimento rootless temporal ya no debe repetirse salvo que cambie el runtime o la publicación de puertos.
2. Completar A-03, U-09, U-10 y A-10 con E2E business de recuperación, visuales, accesibilidad y privacidad; completar E2E de las cuatro modalidades cuando el backend local esté disponible.
3. Completar capturas/instalación/actualización y pruebas físicas cuando haya dispositivo; conservar los hashes debug como evidencia de prueba, no como release.
4. Validar A-11 con endpoint privado/same-origin autorizado y política de retención; no activar un router público.
5. Repetir suite global, build, aislamiento, seguridad y matriz completa. Solo entonces evaluar G10–G12; no marcar el goal completo mientras queden bloqueos o casillas obligatorias.
6. Antes de habilitar OTA, publicar mediante el flujo autorizado un `latest.json` real con firma privada fuera del repositorio, verificar content-type/CORS/cache-control, checksum, firma y retención; el endpoint actual HTML no cuenta como manifest.
- Continúan pendientes DB/RLS oficial, E2E financiero con backend, dispositivo/offline/TalkBack/fuente ampliada/permisos, endpoint privado OTA, firma release y autorización de pagos reales.

## Regresión visual posterior — drawer sobre mapa (2026-09-16)

- `b31b1b1` refuerza `tests/motion.test.tsx`: exige `bg-white` e `isolate` en el `Drawer`, además del portal `z-[1100]`, para contener capas Leaflet.
- Focal UI de movimiento **5/5**. Es una prueba, no cambia los APK funcionales asociados a `10ecf41`; captura nativa, foco, TalkBack y hardware siguen pendientes.

## Flujo maestro y búsqueda upstream — 2026-09-16

- `E.md` añade el flujo maestro §45 para pegar directamente en un goal: continuidad ante fallos normales, preservación de cambios ajenos, matriz P/U/A, prioridades de dinero/RLS/idempotencia/UI/Android, gates verificables y condiciones explícitas para no declarar cierre.
- `E.md` añade §46 con investigación de repositorios primarios: Leaflet (BSD-2-Clause) para panes/stacking, Supabase (Apache-2.0) para grants/RLS/pgTAP, Android Architecture Samples y AndroidX (Apache-2.0) para capas/tests/ciclo de vida, e Hyperswitch (Apache-2.0) únicamente como referencia de estados/conectores.
- Decisión: no añadir dependencias ni instalar una pasarela propia. El camino sin cookies sigue siendo cobro directo al restaurante, declaración manual, observación no confiable y conciliación server-side auditable; una alternativa bancaria requiere proveedor, autorización, cumplimiento y pruebas externas.
- El goal continúa abierto por SQL/RLS oficial, backend E2E, dispositivo Android, accesibilidad nativa, offline, endpoint privado y firma release. No se ejecutaron pagos reales, despliegue ni publicación.

## Corrección de lectura de receptor desactivado — 2026-09-16

- `20260916100000_payment_intent_active_receiver_read_guard.sql` evita que `get_payment_intent` devuelva al cliente el QR de una cuenta receptora inactiva; el intento sigue disponible para soporte/revisión sin orientar un nuevo pago a ese destino.
- `supabase/tests/20260916100000_payment_intent_active_receiver_read_guard.test.sql` declara **4 aserciones**. Lint, typecheck y contratos de pagos/webhook/preflight **8/8** pasan; pgTAP oficial permanece pendiente por el runtime local inaccesible.
- El cambio es SQL y no altera las APK debug `1.4/5`; no se ejecutaron cobros reales ni despliegue.

## Corrección U-02 — cuenta activa en cabecera global y APK asociadas — 2026-09-16

- `BackofficeLayout` carga las sedes visibles, filtra por permisos de identidad o `platform_admin`, preselecciona la primera sede autorizada cuando el contexto no es válido y muestra `Cuenta activa: …` en la cabecera global. Si la carga falla, el estado queda explícitamente pendiente de vinculación.
- Esto corrige la ausencia de restaurante preseleccionado en pantallas de Backoffice y mantiene el alcance de operaciones limitado a la sede visible; no sustituye la validación RLS del servidor.
- Regresión focal Backoffice: **13/13**; suite global: **71 archivos / 321 pruebas**; lint, typecheck, `npm run build:apps`, `npm run test:e2e` (**12/12**) y `git diff --check` pasan. Seguridad de secretos: **924 archivos / sin patrones**.
- `npm run build:mobile:roles` terminó con Android test **5/5**, lint nativo exitoso, `assembleDebug`, ZIP íntegro, `apksigner verify` v2 y `aapt dump badging` correctos. Las tres APK son debug `1.4/5`, no release:
  - Rider: `output/android/Suya-Rider-debug.apk`, **25,371,385 bytes**, SHA-256 `37021829ba121d013616e4580532c765910e3de07b17b3e68934c9dccf568930`, paquete `com.suya.rider`.
  - Backoffice: `output/android/Suya-Backoffice-debug.apk`, **25,239,952 bytes**, SHA-256 `4980052ee740712c26b76039aa1571c722a405ea3284318a4c71cdd539a12f4d`, paquete `com.suya.backoffice`.
  - Wallet Observer: `output/android/Suya-Wallet-Observer-debug.apk`, **25,192,060 bytes**, SHA-256 `7c5d98f49debef7d0dbebb3385d5608be9c58bbb48eaa770d99061a325a73e5e`, paquete `com.suya.walletobserver`.
- No hay dispositivo/emulador conectado: instalación, actualización, insets, TalkBack, fuente ampliada, permisos y offline físico siguen pendientes. No se ejecutaron pagos reales, despliegue ni publicación.

## Corrección P-05 — rechazar importes con signo y APK vigentes — 2026-09-16

- La expresión de importe del parser web y del observador Android ahora exige que el símbolo monetario no esté precedido directamente por `+` o `-`; una notificación como `Reversión -S/ 30.00` ya no entra como ingreso observado. Los formatos positivos agrupados y decimales existentes se conservan.
- Regresión web de adaptadores/parser: **20/20**; Android `test`: **5/5**; suite global: **71 archivos / 322 pruebas**; lint, typecheck, build aislado, smoke **12/12** y secretos **924 archivos / sin patrones** pasan.
- APKs vigentes tras este cambio, todas debug `1.4/5`, no release, ZIP íntegro, firma v2 y un firmante:
  - Rider: `output/android/Suya-Rider-debug.apk`, **25,371,385 bytes**, SHA-256 `b5595298fbaafe0d8131fa63e1dee201bedf0da3d8862f404f22372f8b922c8f`, `com.suya.rider`.
  - Backoffice: `output/android/Suya-Backoffice-debug.apk`, **25,239,952 bytes**, SHA-256 `2440b6963d74e7b677edb1c9d186e9a8b1b8df941720a02104abd4c421e70409`, `com.suya.backoffice`.
  - Wallet Observer: `output/android/Suya-Wallet-Observer-debug.apk`, **25,192,060 bytes**, SHA-256 `c4da86fb43d10302a44bbd3fa6c291330f3d7892c9c6f946dacb3e5787e96b7f`, `com.suya.walletobserver`.
- Esto evita una clasificación positiva evidente, pero no convierte notificaciones en autoridad de pago: P-01/P-02/P-03/P-08 siguen requiriendo backend, movimientos del receptor y conciliación autorizada. No se ejecutaron pagos reales ni se relaja la ruta manual.

## Corrección P-08 — clasificar lenguaje entrante y APK vigentes — 2026-09-16

- Se añadió una guardia explícita de lenguaje entrante al parser web y a `YapeNotificationListenerService`: solo textos con señales de recepción (`recibiste`, `received`, `te envió`, etc.) continúan al parser de importes; `saldo`, `enviaste`, `solicitud`, `reversión`, `falló` y equivalentes no entran como cobros. La guardia es clasificación defensiva, no confirmación bancaria.
- La primera regresión detectó que `\b` de JavaScript no manejaba correctamente la `ó` de `te envió`; se corrigió con límites Unicode basados en caracteres no alfabéticos. Focal parser/adaptadores: **24/24**; Android `test`: **5/5**; suite global: **71 archivos / 326 pruebas**; lint, typecheck, `npm run build:apps`, smoke E2E **12/12** y secretos (**924 archivos / sin patrones**) pasan.
- `npm run build:mobile:roles` terminó con JDK 21/SDK 36; `assembleDebug`, `unzip -tqq`, `apksigner verify` v2 y `aapt dump badging` pasan en las tres variantes. Son debug `versionName 1.4`/`versionCode 5`, un firmante y no release:
  - Rider: `output/android/Suya-Rider-debug.apk`, **25,371,385 bytes**, SHA-256 `18c97c8f07bac06ae3de6f12f606ab50505e9360abc5c2312d5d4055e2cd0a3f`, paquete `com.suya.rider`.
  - Backoffice: `output/android/Suya-Backoffice-debug.apk`, **25,239,952 bytes**, SHA-256 `aff91b042d9e918bb74db9a3371c194d8c0b959a8f5adfc190c108f4c6572ceb`, paquete `com.suya.backoffice`.
  - Wallet Observer: `output/android/Suya-Wallet-Observer-debug.apk`, **25,192,060 bytes**, SHA-256 `b0200cc2a13a168c22a5dc6cc151c69f88d126f03d7b3143c090dc8993a66911`, paquete `com.suya.walletobserver`.
- El build valida empaquetado y metadatos, pero no sustituye la prueba en dispositivo: siguen pendientes instalación/actualización física, permisos de notificaciones, offline, insets, TalkBack y fuente ampliada. El goal también sigue abierto por DB/RLS oficial, E2E financiero con backend, endpoint OTA privado, firma release y autorización de pagos reales.

## Corrección P-01/U-09 — colisión exacta y pie de mapa sin superposición — 2026-09-16

- El fixture `supabase/tests/20260914100000_payment_intents_and_wallet_reconciliation.test.sql` sube su plan de 102 a **105 aserciones**. Dos intentos pendientes con el mismo HMAC completo y últimos cuatro dígitos deben conservar dos candidatos, hacer que `verify_wallet_payment` rechace la ambigüedad con `payment identity is ambiguous; full operation code required` y mantener ambos intentos pendientes. El contrato está escrito; pgTAP oficial sigue pendiente por ausencia del runtime Supabase/Postgres.
- `LeafletMap` deja de usar la atribución nativa superpuesta y renderiza una atribución OSM propia en la columna derecha. Las leyendas de recorrido/ruta y el error de tiles se apilan en la columna izquierda con límites `max-w-[52%]` y `max-w-[43%]`, evitando colisiones en anchos móviles. `tests/map-controls.test.ts` lo fija.
- Focal mapa/tracking/operaciones: **13/13**; suite global: **71 archivos / 327 pruebas**; `npm run lint`, `npm run typecheck`, `npm run test:e2e` **12/12** y `git diff --check` pasan. `npm run build:apps` rechazó la configuración incompleta y, con configuración pública sintética, el smoke de previews aislados pasó 12/12.
- `npm run build:mobile:roles` pasa con JDK 21/SDK 36; Android `test` **5/5**, `assembleDebug`, ZIP íntegro, firma v2 y metadatos `1.4/5` pasan. APKs debug actuales:
  - Rider: `output/android/Suya-Rider-debug.apk`, **25,371,649 bytes**, SHA-256 `d81cd2e3d343301416ed3cf22214a2f54eaa250e2322d78eb0a5ad1c4fd796f4`.
  - Backoffice: `output/android/Suya-Backoffice-debug.apk`, **25,239,988 bytes**, SHA-256 `cf955ebbeffa6bbe498967089e734615118a375604cc533cb530b7a857434266`.
  - Wallet Observer: `output/android/Suya-Wallet-Observer-debug.apk`, **25,192,112 bytes**, SHA-256 `b17cf052ed295392739eea2a6cd0e233479b463b39a7ca91090c5a201a125ac9`.
- Los cambios ajenos `src/lib/routePlanner.ts`, `tests/route-planner.test.ts` y `output/` permanecen sin incluir. Continúan pendientes DB/RLS oficial, E2E financiero con backend, instalación/actualización física, TalkBack, fuente ampliada, offline, permisos, OTA privado, firma release y pagos reales.

## Corrección P-09 — HMAC contextual de evidencia — 2026-09-16

- `20260916110000_context_bound_payment_evidence_hmac.sql` añade columnas separadas para HMAC contextual en intentos, observaciones y claims. El HMAC v2 usa un dominio versionado y liga el código a `receiver_account_id` y método/proveedor; el HMAC legacy se conserva solo para compatibilidad de filas antiguas.
- Las funciones de declaración, ingesta, corrección, lista y verificación usan el contexto nuevo. Cuando ambos lados tienen HMAC contextual, una discordancia no cae a digest ni a últimos cuatro dígitos. `private.write_audit_log()` excluye también el campo contextual del JSON financiero.
- `supabase/tests/20260916110000_context_bound_payment_evidence_hmac.test.sql` declara **12 aserciones**. `npm run db:lint` fue intentado y falla con `ECONNREFUSED 127.0.0.1:54322`; por ello esta migración queda en verificación, no aprobada.
- No se modifican APKs ni se procesan pagos reales. El goal sigue abierto por DB/RLS oficial, E2E backend, dispositivo, offline/accesibilidad, OTA privado y firma release.

## Corrección P-02 — guardia de reutilización por identidad fuerte — 2026-09-16

- `20260916120000_wallet_evidence_reuse_identity_guard.sql` corrige el falso bloqueo por últimos cuatro dígitos. El trigger compara HMAC contextual, HMAC legacy o fingerprint completo; solo usa el sufijo cuando no existe una identidad completa. El advisory lock sigue siendo server-side y usa la mejor clave no reversible disponible.
- `supabase/tests/20260914230000_atomic_wallet_checkout_and_receiver_binding.test.sql` pasa de 38 a **40 aserciones**: añade dos pagos con el mismo sufijo y fingerprints distintos, que deben verificarse independientemente; la colisión completa previa continúa siendo rechazada para revisión.
- La suite web actual permanece en **71 archivos / 327 pruebas**; lint, typecheck y diff pasan. `npm run db:lint` sigue bloqueado por `ECONNREFUSED 127.0.0.1:54322`, por lo que P-02 continúa en verificación.
- No se modifican APKs ni se ejecutan pagos reales. El goal sigue abierto por DB/RLS oficial, E2E backend, dispositivo/offline/accesibilidad, OTA privado y firma release.

## Corrección P-04/P-10/A-01 — reintento de intento terminal — 2026-09-16

- La auditoría detectó que `payment_attempts.idempotency_key` es globalmente única y que una clave determinista permanente (`order:<id>:<method>`) podía impedir reintentar después de `failed` o `refunded`.
- `20260916130000_payment_intent_terminal_retry.sql` conserva el lock del pedido y la reutilización de `pending/authorized`; si existe historial previo sin intento activo, genera `order:<id>:<method>:retry:<uuid>`. No se elimina la unicidad ni se permite duplicar llamadas concurrentes.
- `20260916130000_payment_intent_terminal_retry.test.sql` declara **6 aserciones**. Lint, typecheck, `git diff --check` y Vitest global **71/327** pasan. El gate oficial de DB continúa en `ECONNREFUSED 127.0.0.1:54322`; la migración queda en verificación.
- Es cambio SQL-only: APKs debug `1.4/5` sin cambios. No hubo pagos reales, despliegue ni publicación; siguen pendientes DB/RLS, E2E financiero, dispositivo, accesibilidad nativa, offline, OTA privado y firma release.

## Corrección A-05 — almacenamiento seguro de sesión Android — 2026-09-16

- La revisión encontró que desactivar toda persistencia nativa protegía Web Storage, pero degradaba la continuidad de sesión tras reinicio. `secureStorage.ts` implementa `SupportedStorage` y se inyecta solo para Android.
- `SuyaSecureStoragePlugin` cifra con AES-GCM/IV aleatorio, conserva la clave no exportable en Android Keystore y guarda solo ciphertext en preferencias privadas. Valida claves y no permite fallback en claro. `MainActivity` registra el plugin; no se añade dependencia ni permiso nuevo.
- `tests/supabase-client-auth.test.ts` pasa **2/2**; typecheck, lint, `bash android/gradlew -p android test --no-daemon` y las tres reconstrucciones APK pasan. Falta hardware para verificar reinicio, bloqueo, restauración, OAuth y sign-out físico; A-05 permanece en verificación.
- Las APK debug `1.4/5` actuales pasan ZIP, `apksigner verify` v2 y `aapt dump badging`. No son release, no implican sesión física validada y no habilitan pagos reales.
- Huellas finales actuales: Rider **25,371,965 bytes**, `7ed24f67c245f6d2f33241454ece08681690609bc0cec814736e8eb9ccd95860`; Backoffice **25,240,336 bytes**, `e00c6e8ed2f1d3db8902aeebc8066b47a4dd197083fb2452651bd66504772478`; Wallet Observer **25,192,272 bytes**, `b67ef174693d1aa378555dd82ae1276b162f83a9549593f8fafbb3e1065775b7`.
- El entorno actual no dispone de `adb` ni `emulator`; reinicio, bloqueo, OAuth, TalkBack, fuente ampliada, offline, actualización e instalación física siguen pendientes y no se declaran verificadas.

## Corrección A-02/P-11 — contexto de mesa y destinatario visible — 2026-09-16

- `0f2d3c8` impide que un pedido con mesa sobrescriba la dirección habitual del perfil; `tests/supabase-order.test.ts` pasa **9/9**.
- `0a1b51a` añade `get_payment_receiver_label`, ligado al propietario/token guest, restaurante, intento y cuenta receptora activa. `PaymentInstructions` muestra el `account_label` junto al QR y oculta el QR si la etiqueta no se puede validar. `db1a8a0` limita el guardia al flujo directo `wallet_observer` para conservar compatibilidad con Culqi opcional. Focal pagos/UI **28/28**; suite global posterior **71/330**, lint, typecheck, secretos y diff pasan.
- La migración `20260916140000_payment_recipient_label_read_guard.sql` y su contrato de **8 aserciones** quedan pendientes del runtime oficial Supabase/Postgres. No hubo pagos reales; DB/RLS, E2E, dispositivo y estados físicos siguen pendientes.

## Corrección A-06 — paginación y proyección segura de listados — 2026-09-16

- `c90f701` añade `OrderListOptions` con offset/limit acotados a 50, orden estable por `created_at` e `id`, `loadMore()` en el store y botón accesible de carga incremental para cliente, Backoffice e historial del rider.
- La lista usa una proyección sin `gateway_qr_payload` ni códigos; el detalle autorizado conserva su consulta independiente. Las regresiones focales pasan: Supabase orders **10/10**, store orders **11/11**. Fuente upstream consultada: `supabase/postgrest-js` (`range()` 0-based, inclusivo y dependiente del orden declarado).
- Suite global final de esta fase: **71 archivos / 332 pruebas**; typecheck, lint, `git diff --check`, secretos (**934 archivos**), build aislado con configuración pública sintética y smoke web **12/12** pasan.
- APKs debug `1.4/5`, SDK 36, ZIP íntegro, un firmante y firma v2: Rider **25,372,761 bytes**, SHA-256 `b016f747bd360eb36b2fdba359355de59dd36cfc98aa969ab109d5aee4e9ed49`; Backoffice **25,240,788 bytes**, `2d8a29a157e0ebb05bf09771ddb06dcd8e9f70e49c054f80eb835a0f38fadcbb`; Wallet Observer **25,192,272 bytes**, `b67ef174693d1aa378555dd82ae1276b162f83a9549593f8fafbb3e1065775b7`.
- A-06 permanece en verificación hasta confirmar índice/plan, RLS y concurrencia con DB oficial. No hay dispositivo/emulador, no hay firma release ni pagos reales.

## Mejora A-06 — contrato de paginación consistente en demo — 2026-09-16

- `fc6336c` corrige una deriva del servicio demo: `MockOrderService.list()` también acota cada página a 50, igual que Supabase, aunque el consumidor solicite un límite mayor. Esto evita que el mock oculte regresiones de volumen y mantiene una sola expectativa para customer, Backoffice y rider.
- La regresión añade 55 pedidos sintéticos, solicita `limit: 100` y exige exactamente 50; `tests/orders.test.ts` pasa **12/12**. Suite global: **71 archivos / 333 pruebas**; typecheck, lint, `git diff --check` y secretos (**934 archivos**) pasan.
- No cambia contratos de pago, migraciones, APKs ni producción. A-06 continúa en verificación por índice/plan, RLS, concurrencia y prueba oficial de DB.
