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
| Pruebas antes de esta ejecución | 62 archivos / 271 pruebas |
| Estado actual | Implementación y tests locales guardados en commits `1b5aa39`, `e22ddce` y `4a3472e`; `output/` preexistente conservado sin versionar |
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
- Recuperación de invitado: el token de alta entropía puede viajar una sola vez en el fragmento URL, se guarda en sesión y se retira del historial; nunca se usa el código corto como autorización.
- Analytics/UTM convertido en no-op estricto; la sesión nativa no persiste refresh token en Web Storage.
- Android `versionCode 4`, `versionName 1.3`; aún sin APK nuevo porque el entorno no tiene Java.

## Matriz de hallazgos

Estados usados: pendiente, en corrección, en verificación, verificado, bloqueado. Un bloqueo de entorno no es aprobación.

| ID | Estado | Evidencia actual | Pendiente / salida |
|---|---|---|---|
| P-01 | En verificación | Conteo global de coincidencias y test SQL preparados; índice de asignación única añadido | Ejecutar `npm run db:test` con Postgres local y concurrencia |
| P-02 | En verificación | `eventId` estable por binding/notificación y conflicto de observación único en migración | Prueba SQL/nativa en dos dispositivos y evento tardío |
| P-03 | En verificación | `receiver_account_id` en intento/dispositivo/observación y QR por cuenta exacta | Instalar migración y probar cambio de cuenta |
| P-04 | En verificación | RPC atómico para los tres canales; oferta y pago dentro de la transacción | Test de rollback y actualización limpia en DB local |
| P-05 | En verificación | Parser TS y test de `S/ 1000.00`; parser Java actualizado | Ejecutar pruebas Android con Java |
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
| A-01 | En verificación | Rutas wallet atómicas; lista cliente y tests de payload actualizados | Resolver y probar idempotencia guest tras pérdida de respuesta |
| A-02 | En verificación | Contratos distintos para delivery, menú y mesa; GPS ya no se exige universalmente | DB limpia + E2E por modalidad |
| A-03 | En verificación | Test y bundle customer real: token sintético de 64 caracteres se conserva en sesión, `location.hash` queda vacío después de cargar y el servidor sigue validando el token | E2E con recarga, enlace en otro contexto y pérdida de respuesta sin duplicar pedido |
| A-04 | Verificado local | `analytics.ts` no carga script, no persiste UTM ni emite eventos; tests y build pasan | Confirmar red/`Set-Cookie` en E2E |
| A-05 | En verificación | Native Supabase no persiste refresh token en Web Storage; token observador usa Keystore | Compilar Android y probar cierre/reinicio; evaluar secure storage de sesión |
| A-06 | Verificado local | `.range(0,49)` y sin N+1 de códigos; test de servicio pasa | Confirmar paginación/índice en DB |
| A-07 | En verificación | Migración nueva forward-only y test pgTAP añadido | Instalación limpia, actualización y rollback restaurable |
| A-08 | Bloqueado | `versionCode 4`/`1.3` preparado; APK nueva no compilable sin Java | Build por rol, SHA-256, firma y captura |
| A-09 | En verificación | RPC account-aware, revocación por `active`, token hash y auditoría existente | SQL/RLS/concurrencia en DB local |
| A-10 | En verificación | Navegador sin cookies y sin scripts de tracking; controles sin nombre: 0 | Revisión completa de logs, GPS, teléfonos, direcciones y permisos |

## Verificaciones ejecutadas

- `npm run typecheck`: pasa.
- `npm run lint`: pasa sin warnings.
- `npm test -- --run`: **63 archivos / 278 pruebas pasan** tras integrar la recuperación de invitado y la protección de overlays.
- Pruebas focalizadas de acceso invitado/order/layout: 11/11 pasan.
- `tests/backoffice-layout.test.tsx`: 1/1 pasa tras compactar navegación móvil.
- `npm run build`: pasa.
- `npm run security:secrets`: pasa; 890 archivos sin patrones de secreto.
- Build/aislamiento de bundles customer, rider y backoffice con configuración local sintética: pasa.
- Smoke visual/a11y web: customer y Rider a 390×844 sin overflow; barras inferiores no filtran texto; keyboard traversal customer con 16 controles nombrados/visibles y 0 sin nombre; cookies y scripts de tracking: vacíos.
- Bundle customer compilado: recuperación guest E2E sintética pasa (`#access` se consume y el token queda en sesión); los errores observados son solicitudes a Postgres local no disponible.
- `npm run test:e2e`: pasa **9/9 combinaciones** (customer/Rider/Back Office en mobile/tablet/desktop), con HTTP 200, ruta/encabezado esperado, sin overflow, controles nombrados y sin `pageerror`.
- `npm run verify:payments`: rechazado por configuración productiva ausente; correcto para este entorno sin despliegue.

## Bloqueos reproducibles

1. `npm run db:lint` no conecta a `127.0.0.1:54322`; `npm run db:start` tampoco puede conectar al socket de Docker. Por eso los SQL son cambios preparados, no SQL aprobados.
2. `bash android/gradlew test --no-daemon` no puede ejecutarse: no existe `java` ni `JAVA_HOME`. No se afirma APK final ni prueba Android.
3. No se dispone en este checkpoint de dispositivo Android físico, firma release ni autorización para pagos reales.

## Siguiente acción exacta

1. Al estar disponible Docker, ejecutar `npm run db:start`, `npm run db:lint` y `npm run db:test`; corregir sintaxis/RLS/concurrencia y actualizar esta matriz.
2. Completar A-03, U-09, U-10 y A-10 con E2E business de recuperación, visuales, accesibilidad y privacidad; completar E2E de las cuatro modalidades cuando el backend local esté disponible.
3. Con Java disponible, ejecutar tests/build Android por `rider`, `backoffice` y `walletobserver`; calcular SHA-256, identificar commit/rol/versión y revisar APK real.
4. Repetir suite global, build, aislamiento, seguridad y matriz completa. Solo entonces evaluar G10–G12; no marcar el goal completo mientras queden bloqueos o casillas obligatorias.
