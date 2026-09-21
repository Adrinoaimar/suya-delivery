# F27 · Loop de pruebas de pago

Estado del código: commit `a4fd10b` (ignora callbacks duplicados de token para impedir dos cargos desde un mismo checkout; habilita en CSP el Custom Checkout de Culqi y conserva la autenticación Basic del webhook sobre `db277e2`; además blinda con regresiones la preselección temprana de restaurante en Mesas/QR y Catálogo, implementada en `f6c1df6`; separa el título de billetera y el nombre del remitente en web y Android sobre el flujo de `9682706`; estabiliza y enriquece notificaciones expandidas sobre `f890b34`, captura el remitente en el formato «te envió» y conserva la preselección temprana de cuenta implementada en `762d7e0`; identificación Android sobre `53cb470`; funcionalidad de pagos en `66d808f` y `a35faa6`); CI valida base de datos, frontend, E2E, Android e iOS. Este documento no contiene llaves ni datos de clientes.

Último checkpoint: el QR de billeteras de Culqi usa la opción `billetera` del Custom Checkout (la opción `yape` corresponde al flujo de token/código de aprobación); queda bloqueado mientras espera `order.status.changed`. La pantalla se actualiza por polling y solo libera preparación cuando el servidor marca `authorized`. El flujo manual distingue pagos iguales con fingerprint/código completo; Back Office añade una pista visual de coincidencia entre remitente y cliente, sin autorizar por sí sola; y la observación Android sigue siendo evidencia no autorizante.

## Preparación única

1. Ejecutar `npm run verify:payments` con las variables públicas reales. El procedimiento completo está en [F27.6 · Preflight de pagos](F27.6-payment-preflight.md); `--deployment` añade la comprobación de secretos y `--network` solo hace solicitudes `OPTIONS`.
2. Desde `main`, ejecutar el workflow manual `Desplegar Edge Functions Supabase`. Su preflight exige `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `CULQI_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CULQI_WEBHOOK_USERNAME`, `CULQI_WEBHOOK_PASSWORD` y `ALLOWED_ORIGINS`; aplica migraciones y configura los secretos antes de desplegar las Edge Functions.
3. Mantener en GitHub/Supabase únicamente secretos de prueba hasta completar la validación: `CULQI_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CULQI_WEBHOOK_USERNAME`, `CULQI_WEBHOOK_PASSWORD` y `ALLOWED_ORIGINS` (dominios web y orígenes nativos Capacitor).
4. Configurar el frontend con `VITE_CULQI_GATEWAY_ENABLED=true` y la llave pública `pk_test_...`; nunca colocar una `sk_...` en web o APK. El cliente usa Culqi Custom Checkout (`https://js.culqi.com/checkout-js`).
5. Registrar el webhook Culqi `order.status.changed` apuntando a `culqi-webhook`, activar su autenticación Basic con el mismo usuario/contraseña y comprobar que responde por HTTPS.
6. En Back Office, seleccionar el restaurante correcto, guardar las cuentas Yape/Lemon y crear un dispositivo de caja. Abrir la APK dedicada Suya en el teléfono receptor, pegar el token y activar allí el acceso de notificaciones Android de forma explícita.

El observador conserva eventos cifrados si pierde red y reintenta en segundo plano cada 15 minutos como máximo. Back Office actualiza las observaciones visibles cada 15 segundos. La observación conserva la hora de publicación original para no ampliar artificialmente la ventana de coincidencia.
El parser admite etiquetas de remitente como `De:`/`From:` y el formato «Ana te envió…», lee todos los campos estándar de texto de una notificación Android y separa el nombre del código de operación. La clave opaca de Android y el contenido se incorporan solo al hash idempotente local; el código completo sigue siendo la identidad principal del pago.

La rama con este flujo aún debe desplegarse a producción: el dominio público comprobado antes del despliegue muestra el checkout anterior, con efectivo únicamente. El gate de Cloudflare admite el modo manual directo con `VITE_CULQI_GATEWAY_ENABLED=false`; si se activa el checkout opcional, exige `true` y `VITE_CULQI_PUBLIC_KEY`. No declarar las pruebas reales listas hasta aplicar migraciones/Edge Functions, configurar secretos y publicar el build correcto.

La reserva de creación también cubre doble toque en `Continuar con pago`: una solicitud prepara la orden externa y la otra debe recibir `409`; no repitas el pago mientras el primer checkout esté preparando la orden.
En Dispositivos de pagos, la primera cuenta visible se fija apenas llega el catálogo; las cargas lentas de observaciones o dispositivos ya no dejan el selector sin restaurante.
Si el cliente cierra el modal de Culqi sin completar el pago, la pantalla libera el estado de apertura y permite reintentar; durante el cargo por token permanece bloqueada hasta la respuesta del backend. Si el token es rechazado, refresca el intento cerrado desde el servidor antes de permitir otro pago; si ese refresh falla, invalida localmente la referencia y obliga a crear otra, evitando reutilizar una referencia `pending` local.

CI Android `34915589843` recompiló Rider, Back Office y Caja para `cbd0725`; los seis checks del PR #36 quedaron verdes, las regresiones nativas y las nuevas pruebas de selección temprana pasaron, y las tres APK pasaron `unzip -tqq`. Los hashes y rutas exactas están en `docs/STATE.md` y en el checkpoint `F27.20` de este archivo.

## Checkpoint F27.16 · APKs del último rebuild `f4b6b3a`

- Rider: `output/apks/f4b6b3a/Suya-Rider-debug-e1a03e56d95cfceb93a52be0cc0895b715c0b851/Suya-Rider-debug.apk`; SHA-256 `997d2029c25c4692df0100424725b421d07dedfcf99719679be93ae78308a783`.
- Back Office: `output/apks/f4b6b3a/Suya-Backoffice-debug-e1a03e56d95cfceb93a52be0cc0895b715c0b851/Suya-Backoffice-debug.apk`; SHA-256 `761c07949558149e644b9b80fee7c0807292aa57b271ee2e576ab397e434931d`.
- Caja / Wallet Observer: `output/apks/f4b6b3a/Suya-Wallet-Observer-debug-e1a03e56d95cfceb93a52be0cc0895b715c0b851/Suya-Wallet-Observer-debug.apk`; SHA-256 `6dde33a2bda596889f49ab1e705352a4c630285c39d884c346ee9fb766060a66`.
- Son APKs debug para pruebas, no builds release firmados. Las tres pasaron `unzip -tqq`; la compilación Android proviene del run `34910434713`.

## Checkpoint F27.17 · APKs del último rebuild `9682706`

- Rider: `output/apks/9682706/Suya-Rider-debug-970b945517b8fee9769f052ae1707884947c87fa/Suya-Rider-debug.apk`; SHA-256 `beaf447ca45c5063e1e54dd32c309bc4c96f8b4895644480a8e6946e90e424e2`.
- Back Office: `output/apks/9682706/Suya-Backoffice-debug-970b945517b8fee9769f052ae1707884947c87fa/Suya-Backoffice-debug.apk`; SHA-256 `271616a7f5cd6cd3a915b98c680c9ebf2faf7fddf784782329b7d13b906035a2`.
- Caja / Wallet Observer: `output/apks/9682706/Suya-Wallet-Observer-debug-970b945517b8fee9769f052ae1707884947c87fa/Suya-Wallet-Observer-debug.apk`; SHA-256 `e2c47471d440063fe5daaeb5feef80cd2634808026b498a9ddc36d9f0dacd86e`.
- Son APKs debug para pruebas, no builds release firmados. Las tres pasaron `unzip -tqq`; la compilación Android proviene del run `34911517744`.

## Checkpoint F27.18 · APKs del fix de remitente `1c36124`

- El parser web y el listener Android revisan campos separados antes de combinar el texto; `Yape` ya no se mezcla con `Ana María Torres` cuando el título y el mensaje llegan en propiedades distintas.
- Rider: `output/apks/1c36124/Suya-Rider-debug-10dc7ae26a80a27d0b9b82ccc61d23144145eef9/Suya-Rider-debug.apk`; SHA-256 `88c2733acfc0fcc0bf0018f5cf3ec3d47ad25b3fc420fc79c06fadab3d2668aa`.
- Back Office: `output/apks/1c36124/Suya-Backoffice-debug-10dc7ae26a80a27d0b9b82ccc61d23144145eef9/Suya-Backoffice-debug.apk`; SHA-256 `f8577dacc638cffbc988b92d8b0a6ddd7a2700d266049212f0ef597868ef0bfd`.
- Caja / Wallet Observer: `output/apks/1c36124/Suya-Wallet-Observer-debug-10dc7ae26a80a27d0b9b82ccc61d23144145eef9/Suya-Wallet-Observer-debug.apk`; SHA-256 `349b577dd93528e530eeac73ac0ae28709571dc5e5e3b920ea7c91a191fd5a9a`.
- Android ejecutó 3 pruebas unitarias; las tres APK son debug, no release firmadas, y pasaron `unzip -tqq`.

## Checkpoint F27.19 · APKs con preselección temprana `f6c1df6`

- Mesas/QR y Catálogo fijan la primera cuenta visible apenas termina el catálogo, sin esperar la carga de mesas, productos o configuración.
- Rider: `output/apks/f6c1df6/Suya-Rider-debug-09cca4f632203e9915d8d818c6c2d285d9a90a0b/Suya-Rider-debug.apk`; SHA-256 `a2ca7900fecb738db0dfa2df86b607c756234706f6448e55824fca3a6bc960f5`.
- Back Office: `output/apks/f6c1df6/Suya-Backoffice-debug-09cca4f632203e9915d8d818c6c2d285d9a90a0b/Suya-Backoffice-debug.apk`; SHA-256 `610d772868c46444c197af3007fd2197b30954b831e21aa997ca29d59883f9e6`.
- Caja / Wallet Observer: `output/apks/f6c1df6/Suya-Wallet-Observer-debug-09cca4f632203e9915d8d818c6c2d285d9a90a0b/Suya-Wallet-Observer-debug.apk`; SHA-256 `16cb732dd55580d36e7993986a9fc6a94484542e917ce041ba1d677d3b7a64e3`.
- Android ejecutó sus pruebas nativas; las tres APK son debug, no release firmadas, y pasaron `unzip -tqq`.

## Checkpoint F27.20 · APKs con regresiones de selección `cbd0725`

- La suite de operaciones cubre que Mesas/QR y Catálogo muestren la primera cuenta antes de que finalicen las cargas secundarias.
- Rider: `output/apks/cbd0725/Suya-Rider-debug-90a6918eb12aa5e611d6bb9a2ca280edcc0cf740/Suya-Rider-debug.apk`; SHA-256 `2bdb2abc9ae50207d0013c6ebd7d7155c510108ada6f7e56109f6f89e4f21241`.
- Back Office: `output/apks/cbd0725/Suya-Backoffice-debug-90a6918eb12aa5e611d6bb9a2ca280edcc0cf740/Suya-Backoffice-debug.apk`; SHA-256 `0c9850f58f40e054ab3838adc039b926aa63e85e31ce03bae4e22bd2eaec27f2`.
- Caja / Wallet Observer: `output/apks/cbd0725/Suya-Wallet-Observer-debug-90a6918eb12aa5e611d6bb9a2ca280edcc0cf740/Suya-Wallet-Observer-debug.apk`; SHA-256 `61afd3e42fa90f24b73aea4f7fc63ffeb35cf1ad98e9c27684bfe5dff8c9304e`.
- CI Android ejecutó las pruebas nativas; las tres APK son debug, no release firmadas, y pasaron `unzip -tqq`.

## Checkpoint F27.21 · Autenticación del webhook y suite completa `db277e2`

- `culqi-webhook` exige `Authorization: Basic` con `CULQI_WEBHOOK_USERNAME` y `CULQI_WEBHOOK_PASSWORD`, comparación constante y respuesta `401` si el evento no está autenticado. El workflow y el preflight exigen ambos secretos antes de desplegar.
- Suite local completa: 62 archivos y 267 pruebas pasan; lint, typecheck y `git diff --check` también pasan.
- El cambio no modifica el frontend ni las APK; las APK verificadas más recientes siguen siendo las del checkpoint F27.20 (`cbd0725`).

## Checkpoint F27.22 · APKs del rebuild autenticado `db277e2`

- El run Android `34916878043` terminó verde; los seis jobs CI asociados al commit (`browser`, `browser-e2e`, `build`, `debug`, `simulator` y `test`) terminaron en `success`.
- Rider: `output/apks/db277e2/Suya-Rider-debug-eccfccde11a8160ddc9f8ced3fd13201cf275fc3/Suya-Rider-debug.apk`; SHA-256 `d28259644b9e001507ef83d989f8de3f2c860d145036b482847107bd120f6554`.
- Back Office: `output/apks/db277e2/Suya-Backoffice-debug-eccfccde11a8160ddc9f8ced3fd13201cf275fc3/Suya-Backoffice-debug.apk`; SHA-256 `ed0f390ca31154430ca658fcac1cf8e0287e144d4bc6a2667def253d029e3d2b`.
- Caja / Wallet Observer: `output/apks/db277e2/Suya-Wallet-Observer-debug-eccfccde11a8160ddc9f8ced3fd13201cf275fc3/Suya-Wallet-Observer-debug.apk`; SHA-256 `ec81301e55abdfbc942e8e24e5f1ce559750b09e11943e6c6ec6dfd9f1312e7e`.
- Las tres son APK debug, no release firmadas, y pasaron `unzip -tqq`.

## Checkpoint F27.23 · CSP para Custom Checkout `82e2531`

- `public/_headers` permite únicamente los dominios de Culqi necesarios para cargar el script, conectar el checkout y mostrar su iframe: `js.culqi.com` y `checkoutview.culqi.com`.
- Regresión focal: 8 pruebas pasan (`security-hardening` y `culqiCheckout`); lint, typecheck y `git diff --check` también pasan.
- Los seis checks CI del PR #36 quedaron verdes: `browser`, `browser-e2e`, `build`, `debug`, `simulator` y `test`.

## Checkpoint F27.24 · APKs más recientes `82e2531`

- Android run `34921570922` terminó en `success`; las tres APK pasaron `unzip -tqq`.
- Rider: `output/apks/82e2531/Suya-Rider-debug-82758779fc567fc1242eb3e4782ab8845798310a/Suya-Rider-debug.apk`; SHA-256 `cd9f21a76fe9125b4a2d569db08107aca8c5619ac91709900742252ec2360e9f`.
- Back Office: `output/apks/82e2531/Suya-Backoffice-debug-82758779fc567fc1242eb3e4782ab8845798310a/Suya-Backoffice-debug.apk`; SHA-256 `a5e003f91d6b4d0dc3957a8589e22ec9aba9adb0cb4673a6795f3ba266e56e68`.
- Caja / Wallet Observer: `output/apks/82e2531/Suya-Wallet-Observer-debug-82758779fc567fc1242eb3e4782ab8845798310a/Suya-Wallet-Observer-debug.apk`; SHA-256 `1bb34bd4590594e224b8df0a0579e99c93540dbb907fc98b899b42b41d143ba1`.
- Son APKs debug para pruebas, no release firmadas. La versión Android sigue en `versionCode 3`, `versionName 1.2`.

## Checkpoint F27.27 · Validación multiplataforma del árbol `a4fd10b`

- En el árbol con el fix anti doble-cobro, la validación remota de E2E web, base de datos/RLS e iOS terminó en `success`: runs `34923044731`, `34923044705` y `34923044700`.
- Los runs posteriores sobre el checkpoint documental `fd2cd67` (sin cambios de código) repitieron la misma cobertura: E2E `34924109652`, base de datos `34924108958` e iOS `34924108804`, todos verdes.
- No hay `adb` ni emulador local disponible; queda pendiente el smoke visual en dispositivo físico y la configuración productiva de pagos.

## Checkpoint F27.25 · Protección contra callback duplicado `a4fd10b`

- `PaymentInstructions` ignora un segundo callback de token mientras el primer cargo Culqi sigue en curso; la regresión cubre dos callbacks consecutivos y confirma un solo `chargeCard`.
- Suite local completa: 62 archivos y 268 pruebas pasan; lint, typecheck y `git diff --check` también pasan.

## Checkpoint F27.26 · APKs del fix anti doble-cobro `a4fd10b`

- Android run `34923193574` terminó en `success`; las tres APK pasaron `unzip -tqq`.
- Rider: `output/apks/a4fd10b/Suya-Rider-debug-a4fd10b5d5f700b4fd8eafe64fed40601f5cb6bb/Suya-Rider-debug.apk`; SHA-256 `0cfe990fb6be57c0943dae2114f9db81fa453f6cb1f6bf5399e96b36e0ccd6e8`.
- Back Office: `output/apks/a4fd10b/Suya-Backoffice-debug-a4fd10b5d5f700b4fd8eafe64fed40601f5cb6bb/Suya-Backoffice-debug.apk`; SHA-256 `91221ab7df09e20f4d4d171d35e095ea6f9097ee01f153c70f150d404c565a78`.
- Caja / Wallet Observer: `output/apks/a4fd10b/Suya-Wallet-Observer-debug-a4fd10b5d5f700b4fd8eafe64fed40601f5cb6bb/Suya-Wallet-Observer-debug.apk`; SHA-256 `9ba2886dd7512ce8fdd6a165b8f5602af5d3cb3fd650d460a240b16369fb3edc`.
- Son APKs debug para pruebas, no release firmadas. La versión Android sigue en `versionCode 3`, `versionName 1.2`.

El listener mantiene un identificador estable cuando una billetera actualiza una misma notificación desde una vista corta a una expandida. La cola local cifra el evento, completa campos faltantes y vuelve a sincronizarlo; la RPC solo enriquece observaciones abiertas y preserva las verificadas.

## Caso 1 · Dos Yape de S/30

1. Crear dos pedidos desde dos sesiones de cliente, ambos por S/30.00, y anotar sus referencias visibles.
2. En cada cliente, pagar el monto exacto y escribir el código completo de aprobación de su propia constancia. Si hay un error, usar `Cambiar código` antes de verificar.
3. En el celular de caja, esperar dos observaciones `unverified`. Cada fila debe mostrar monto, hora y código enmascarado; el observador no autoriza.
4. En Back Office, pulsar `Buscar pedido` en cada fila. Debe aparecer un único cliente/pedido compatible.
5. Verificar el primer pago y comprobar que solo ese pedido pasa a `authorized`; repetir con el segundo.
6. Intentar preparar antes de verificar: debe fallar. Después de verificar: debe permitir preparación únicamente para ese pedido.

## Caso 2 · Culqi Yape QR dinámico

1. Crear un pedido entre S/6.00 y S/500.00.
2. Abrir `Abrir QR Yape`; Culqi debe mostrar `Billeteras móviles`, generar un QR ligado a la orden y mostrar el monto exacto.
3. Pagar, esperar `order.status.changed` y confirmar que la pantalla se actualiza a `Pago verificado` después del webhook.
4. Recargar la pantalla y confirmar que el intento conserva la misma referencia y no crea una segunda orden mientras siga vigente.

## Caso 3 · Tarjeta

1. Usar únicamente tarjeta/token de integración Culqi.
2. Hacer doble clic en el botón de pago: una solicitud debe reservar el intento y la otra recibir `409` de pago en proceso; nunca deben existir dos autorizaciones Suya.
3. Confirmar en Back Office el cargo `chr_test_...`, el monto exacto y el bloqueo de preparación hasta `authorized`.

## Caso 4 · Lemon y negativos

- Repetir el caso 1 con Lemon y códigos distintos.
- Código equivocado: no debe aparecer candidato ni autorizar.
- Monto distinto, proveedor distinto o ventana vencida: no debe aparecer candidato.
- Notificación sin código: Back Office puede completar el código visible en la constancia; solo entonces se busca coincidencia.
- Referencia manual vencida: el cliente debe pulsar `Generar nueva referencia`; la anterior queda `failed/expired` y no se crean dos pendientes.
- Pedido cancelado después de crear el intento: el intento queda `failed/order_cancelled`, no aparece como candidato y la RPC final rechaza verificarlo.

## Evidencia y límites

Guardar solo referencias, estados, timestamps y hashes de APK; no guardar llaves, números completos, credenciales ni capturas con datos personales. Una observación Android es evidencia mínima, opt-in y revisable; nunca reemplaza la confirmación del proveedor ni autoriza por sí sola.

Referencias oficiales: [órdenes Culqi](https://docs.culqi.com/es/documentacion/pagos-online/ordenes-de-pago/ordenes/), [billeteras móviles](https://docs.culqi.com/es/documentacion/pagos-online/ordenes-de-pago/billetera-moviles), [Custom Checkout](https://docs.culqi.com/es/documentacion/checkout/checkout-custom) y [webhooks](https://docs.culqi.com/es/documentacion/pagos-online/webhooks/).
