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
| Estado actual | Implementación de caja, protección contra cargas obsoletas y cierre manual cash-only guardados en `d0c672d`; `output/` conservado sin versionar |
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
- Migración `20260915100000_guest_idempotency_recovery.sql`: huella server-side del payload, token guest recuperable, coordenadas dentro de la creación atómica y contratos SQL actualizados; añade prueba pgTAP para conflicto, permisos y firmas.
- Migración `20260915110000_internal_order_mutation_context.sql`: las RPC `SECURITY DEFINER` habilitan capacidades transaccionales locales para coordenadas, verificación y cancelación; los clientes siguen sin `UPDATE` directo.
- Migración `20260915120000_payment_intent_refresh_qualification.sql`: renovación de wallet califica `status`/`expires_at` para evitar ambigüedad con parámetros de salida; los fixtures SQL exigen receptor exacto y diferencian limpieza administrativa de acciones cliente.
- Analytics/UTM convertido en no-op estricto; la sesión nativa no persiste refresh token en Web Storage.
- Android `versionCode 5`, `versionName 1.4`; se desbloqueó temporalmente la toolchain local y se generaron APKs debug separados de Rider, Backoffice y Wallet Observer.
- Caja por restaurante y turno: `cash_register_sessions`/`cash_register_entries`, apertura, cobro, ajustes y cierre idempotentes; el saldo esperado se calcula en servidor y el arqueo exige explicación cuando hay diferencia.
- Pedidos delivery en efectivo y mesas con pago en efectivo quedan vinculados al turno; el reintento de mesa reutiliza `payment_request_id` y no duplica el movimiento.
- La ruta de cierre manual de mesas quedó limitada a `cash` en el contrato TypeScript y en la RPC; métodos digitales no pueden marcar una mesa como pagada sin su autorización propia.

## Matriz de hallazgos

Estados usados: pendiente, en corrección, en verificación, verificado, bloqueado. Un bloqueo de entorno no es aprobación.

| ID | Estado | Evidencia actual | Pendiente / salida |
|---|---|---|---|
| P-01 | En verificación | Conteo global de coincidencias y test SQL preparados; índice de asignación única añadido | Ejecutar `npm run db:test` con Postgres local y concurrencia |
| P-02 | En verificación | `eventId` estable por binding/notificación y conflicto de observación único en migración | Prueba SQL/nativa en dos dispositivos y evento tardío |
| P-03 | En verificación | `receiver_account_id` en intento/dispositivo/observación y QR por cuenta exacta | Instalar migración y probar cambio de cuenta |
| P-04 | En verificación | RPC atómico para los tres canales; oferta y pago dentro de la transacción | Test de rollback y actualización limpia en DB local |
| P-05 | En verificación | Parser TS y test de `S/ 1000.00`; parser Java actualizado; pruebas unitarias Android 4/4 pasan | Matriz Android real por versión de billetera |
| P-06 | En verificación | Binding guardado, cola separa eventos por binding y re-vinculación no reenvía | Prueba Android de rotación/revocación |
| P-07 | En verificación | Lock de cola, 500 pendientes, reintentos y estado `queueFull` implementados | Prueba Android offline/reinicio/concurrencia |
| P-08 | En verificación | Adaptadores por paquete y palabras; caso Yape probado | Matriz Android real por versión de billetera |
| P-09 | En verificación | Código normalizado hasta 64; sufijo solo pista y código completo requerido para colisión | Ejecutar SQL y Android; confirmar límites de proveedor |
| P-10 | En verificación | Renovación conserva cuenta histórica y rechaza cuenta desactivada | Ejecutar migración y caso de vencimiento |
| P-11 | En verificación | Textos y estados de pago conservan evidencia separada; reset por pedido | Revisión sobre APK final |
| U-01 | En verificación | Drawer opaco, `isolate`, portal `z-[1100]`; test/build web pasan | Captura sobre APK final con mapa normal/expandido |
| U-02 | Verificado local | Navegación móvil compacta + drawer “Más”; `backoffice-layout.test.tsx` pasa | Confirmar en Android final |
| U-03 | En verificación | Store global en cinco módulos; pruebas focalizadas de contexto pasan | Cambiar dos restaurantes con respuestas lentas y probar permisos |
| U-04 | En verificación | Selector de cuenta no recarga en loop; binding exige cuenta activa | Probar Yape→Lemon en dispositivo con DB real |
| U-05 | Bloqueado | Código de insets existente; sin compilación/dispositivo nativo disponible | Java + Android 15/16 + teclado |
| U-06 | En verificación | GPS opcional y dirección escrita permitida; servidor valida coordenadas cuando llegan | E2E delivery/recojo/mesa y cobertura |
| U-07 | En verificación | Carga por `id` siempre reinicia estado; pago se actualiza por intento | E2E offline/retorno a app/última actualización |
| U-08 | En verificación | Reset por `order.id`, respuestas obsoletas y estados separados | E2E navegando entre dos pedidos |
| U-09 | En verificación | Capturas web customer/Rider a 390×844; `scrollWidth === viewport` y barras inferiores opacas para no filtrar texto | Capturas sobre APK final a 360×800, mapa normal/expandido, leyendas/atribución y estados largos |
| U-10 | En verificación | Navegación por teclado sobre bundle customer: 16 destinos con nombre y visibles; controles sin nombre: 0 | axe/contraste/TalkBack, fuente ampliada y validación nativa |
| A-01 | En verificación | Rutas wallet atómicas; helper v2 calcula huella con canal/método/oferta/mesa/datos y rechaza conflicto; cliente reutiliza request y token guest | Ejecutar SQL/pgTAP y E2E real tras pérdida de respuesta/concurrencia |
| A-02 | En verificación | Contratos distintos para delivery, menú y mesa; GPS ya no se exige universalmente y coordenadas entran en la creación | DB limpia + E2E por modalidad |
| A-03 | En verificación | Test y bundle customer real: token sintético de 64 caracteres se conserva en sesión, `location.hash` queda vacío después de cargar; tests focales 19/19 cubren reintento guest y refresco de pago con token estable | E2E con recarga, enlace en otro contexto y pérdida de respuesta sin duplicar pedido |
| A-04 | Verificado local | `analytics.ts` no carga script, no persiste UTM ni emite eventos; tests y build pasan | Confirmar red/`Set-Cookie` en E2E |
| A-05 | En verificación | Native Supabase no persiste refresh token en Web Storage; token observador usa Keystore | Compilar Android y probar cierre/reinicio; evaluar secure storage de sesión |
| A-06 | Verificado local | `.range(0,49)` y sin N+1 de códigos; test de servicio pasa | Confirmar paginación/índice en DB |
| A-07 | En verificación | Migración nueva forward-only y test pgTAP añadido | Instalación limpia, actualización y rollback restaurable |
| A-08 | En verificación | APKs debug Rider/Backoffice/Wallet Observer generadas con versionCode 5/versionName 1.4; hashes registrados abajo | Capturas, instalación/actualización y firma release |
| A-09 | En verificación | RPC account-aware, revocación por `active`, token hash y auditoría existente | SQL/RLS/concurrencia en DB local |
| A-10 | En verificación | Navegador sin cookies y sin scripts de tracking; controles sin nombre: 0 | Revisión completa de logs, GPS, teléfonos, direcciones y permisos |

## Verificaciones ejecutadas

- `npm run typecheck`: pasa.
- `npm run lint`: pasa sin warnings.
- `npm test -- --run`: **65 archivos / 289 pruebas pasan** tras integrar la caja auditable, el cobro de mesas y la regresión de cambio rápido de restaurante.
- Pruebas focalizadas de acceso invitado/order/payment/layout: 19/19 pasan.
- `tests/backoffice-layout.test.tsx`, `tests/cash-register-page.test.tsx` y `tests/supabase-cash-register.test.ts`: **10/10** pasan; la carga obsoleta no puede reemplazar la cuenta seleccionada.
- `npm run build`: pasa.
- `npm run security:secrets`: pasa; 906 archivos sin patrones de secreto.
- Build/aislamiento de bundles customer, rider y backoffice con configuración local sintética: pasa.
- Smoke visual/a11y web: customer, Rider y Backoffice pasan **12/12** en 360×800, 390×844, tablet y desktop sin overflow; barras inferiores no filtran texto; keyboard traversal customer con 16 controles nombrados/visibles y 0 sin nombre; cookies y scripts de tracking: vacíos.
- Evidencia gráfica web final a 390×844, capturada después del loader: `output/evidence/goal-20260915/customer-390x844.png`, `rider-390x844.png` y `backoffice-390x844.png`; las tres respuestas fueron HTTP 200, sin errores de página, cookies, tracking ni overflow. La evidencia nativa sobre APK sigue pendiente.
- Bundle customer compilado: recuperación guest E2E sintética pasa (`#access` se consume y el token queda en sesión); los errores observados son solicitudes a Postgres local no disponible.
- `npm run test:e2e` con previews de los tres bundles levantados: pasa **12/12 combinaciones** (customer/Rider/Back Office en 360×800, 390×844, tablet y desktop), con HTTP 200, ruta/encabezado esperado, sin overflow, controles nombrados y sin `pageerror`.
- Revalidación posterior a la integración de caja (2026-09-15): `npm run build:apps` con configuración pública sintética volvió a compilar los tres bundles y `npm run test:e2e` volvió a pasar **12/12**; los previews se levantaron desde `dist/customer`, `dist/rider` y `dist/backoffice` y respondieron 200 en sus rutas SPA.
- `npm run verify:payments`: rechazado por configuración productiva ausente; correcto para este entorno sin despliegue.
- `npm run build:apps` con configuración pública sintética y `VITE_CULQI_GATEWAY_ENABLED=false`: pasa; customer, Rider y Backoffice quedan aislados.
- Android: `bash android/gradlew test --no-daemon` pasa 4/4 pruebas unitarias y `assembleDebug` pasa para Rider, Backoffice y Wallet Observer; advertencia existente de API deprecada en `YapeNotificationListenerService.java`, sin fallo de compilación.
- Reconstrucción final posterior a `0263ec7`: `npm run build:mobile:roles` volvió a compilar y empaquetar Rider, Backoffice y Wallet Observer con la corrección de cargas obsoletas; `unzip -tqq` y `apksigner verify` v2 pasan en las tres APK.
- PostgreSQL temporal 17.6.1 con esquema mínimo oficial de Auth/Storage equivalente: instalación limpia de **53 migraciones**, `seed.sql` y **24/24 archivos pgTAP** pasan; la migración de caja (`20260915130000`) es la número 54 y queda pendiente de repetir en el flujo oficial. Es evidencia independiente del port-forward, no reemplaza `supabase db lint/test`.
- APK Rider debug: `output/android/Suya-Rider-debug.apk`, 25,370,777 bytes, SHA-256 `378d4a29414eab3f2f6db6eb28f065e741bcab3b0ceea29cda18dc187266ce5d`, paquete `com.suya.rider`, `versionName 1.4`, `versionCode 5`.
- APK Backoffice debug: `output/android/Suya-Backoffice-debug.apk`, 25,238,752 bytes, SHA-256 `d501b61e43c1467a6dd8ac3860cf25ca8ade64df0358462260b9147670a5660c`, paquete `com.suya.backoffice`, `versionName 1.4`, `versionCode 5`.
- APK Wallet Observer debug: `output/android/Suya-Wallet-Observer-debug.apk`, 25,191,916 bytes, SHA-256 `9e7d449d700798cb3b0d1bc14dd0f9bfb3e4c3a6a89b484982aa57a09b65f710`, paquete `com.suya.walletobserver`, `versionName 1.4`, `versionCode 5`.
- Las tres APK pasan `unzip -tqq` y `apksigner verify` con APK Signature Scheme v2; están firmadas con la clave debug del entorno y no son entregables de producción.

## Bloqueos reproducibles

1. `npm run db:lint` no conecta a `127.0.0.1:54322`; `npm run db:start` tampoco puede conectar al socket Docker normal. Se probó un daemon rootless temporal con `vfs`, cgroups desactivados y seccomp/AppArmor aislados: la red `none` no permite aliases, `host` rechaza aliases y la red rootless con `slirp4netns` sí crea `bridge`, pero el contenedor Postgres queda saludable sin publicar el puerto hacia el host; la CLI termina con `LegacyDbConnectError` (timeout/conexión terminada) y limpia el contenedor. No se modificó el sistema ni el código para ocultarlo. La suite SQL sí fue validada de forma independiente en PostgreSQL temporal; queda pendiente repetirla mediante el flujo oficial de Supabase cuando exista daemon/puerto normal.
2. La toolchain Android se preparó temporalmente en el entorno y permite test/build debug; `adb devices` no muestra dispositivos y el SDK temporal no tiene emulator/system image disponible (el catálogo remoto tampoco descargó). Sigue pendiente instalación, teclado, insets, TalkBack, offline/reinicio y visuales nativos.
3. No se dispone de firma release ni autorización para pagos reales; la firma debug no habilita distribución ni prueba financiera.

## Siguiente acción exacta

1. Con Docker Desktop/daemon normal disponible, ejecutar `npm run db:start`, `npm run db:lint` y `npm run db:test`; corregir sintaxis/RLS/concurrencia y actualizar esta matriz. El experimento rootless temporal ya no debe repetirse salvo que cambie el runtime o la publicación de puertos.
2. Completar A-03, U-09, U-10 y A-10 con E2E business de recuperación, visuales, accesibilidad y privacidad; completar E2E de las cuatro modalidades cuando el backend local esté disponible.
3. Completar capturas/instalación/actualización y pruebas físicas cuando haya dispositivo; conservar los hashes debug como evidencia de prueba, no como release.
4. Repetir suite global, build, aislamiento, seguridad y matriz completa. Solo entonces evaluar G10–G12; no marcar el goal completo mientras queden bloqueos o casillas obligatorias.
