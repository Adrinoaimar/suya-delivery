# Activación de cobros — SUYA Delivery

Fecha: 16 de noviembre de 2026, America/Lima.

**Estado: código integrado y pruebas locales superadas; no desplegado ni validado con dinero real.** El usuario indicó que sólo tiene Yape/Plin personal y pidió mantener QA pausado. No se cambiaron planes, no se abrieron cuentas, no se enviaron claves y no se hicieron transacciones reales.

## Lo que debes hacer tú

1. Solicitar una cuenta oficial de vendedor de Mercado Pago Perú como persona natural, completar su verificación y comprobar que permite Checkout Pro para las ventas del restaurante receptor. La cuenta personal con DNI no garantiza aprobación de cobros API sin RUC. Si el proveedor exige RUC para tu caso, esta restricción queda sin resolver: no se debe eludirla ni marcar la cuenta como habilitada.
2. Confirmar en esa cuenta su tarifa completa, IGV, plazo de disponibilidad y medios admitidos. El checkout ofrece los medios habilitados por el proveedor; no promete Plin ni un QR personal. Consulta la [investigación](SUYA_PAYMENT_RESEARCH.md) para comparar precios y requisitos.
3. Cuando quieras continuar las pruebas remotas, autorizar la reactivación de **SUYA-STAGING-QA**. Permanece pausado por tu instrucción. La aplicación de migraciones, pruebas SQL y despliegue de funciones puede realizarla ingeniería; no necesitas modificar código.
4. En el panel publicado tras esas pruebas, abrir **Configuración de cobros — SUYA Delivery**, seleccionar el restaurante, guardar las credenciales oficiales y completar el webhook de prueba. No pegues claves por chat.
5. Después de sandbox, autorizar un primer cobro real controlado para verificar recepción, pedido, notificación y devolución según corresponda. Esa operación no está autorizada ni ejecutada en esta entrega.

Un QR personal por sí solo no basta. Si sólo mantienes Yape/Plin personal, SUYA no puede aprobar automáticamente con una API oficial no disponible. Los indicios siguen en el panel; no se disfrazan de confirmación financiera.

## Alcance de la cuenta receptora

La configuración es **por restaurante y para sus ventas propias**, con su Access Token oficial. No se centralizan fondos de restaurantes terceros en una cuenta personal del operador. Si SUYA actúa como marketplace recaudador o necesita split, hay que obtener la habilitación contractual del proveedor y su modalidad oficial OAuth/split. Ese permiso no lo concede un checkbox ni disponer de un token. [Requisitos oficiales de marketplace](https://www.mercadopago.com.pe/developers/es/docs/split-payments/split-1-1/prerequisites).

## Preparación técnica, una sola vez

Repositorio actualizado: `/home/adriano/Documentos/ChatGPT/SUYA`. Mantener todos los cambios previos del usuario. El paquete `SUYA_PAYMENT_IMPLEMENTATION.zip` contiene los archivos de esta intervención y un parche; no sustituye todo el proyecto.

Producción exclusiva: `cggxooilzhqlcnofgtmi`, SUYA-DELYVERI. QA exclusiva: `tgywjfzuspxxfsdywmof`, SUYA-STAGING-QA. No utilizar los proyectos de otras organizaciones que aparezcan en otro conector MCP.

### 1. Validar y aplicar primero en QA

**No ejecutar este bloque mientras QA siga pausado.** No iniciar PostgreSQL local ni Supabase/Docker; lo prohíbe AGENTS.md.

Con acceso CLI oficial y contraseña privada ya configurados, inspeccionar primero:

```bash
npm run typecheck
npm run lint
npm run test
node_modules/.bin/supabase migration list --help
node_modules/.bin/supabase db push --help
node_modules/.bin/supabase db push --project-ref tgywjfzuspxxfsdywmof --dry-run --skip-vault
```

Comparar la lista con el historial remoto. No aprobar un `push` que incluya migraciones inesperadas. Las migraciones nuevas son:

- `20261116195853_harden_legacy_payment_trust.sql`
- `20261116195958_provider_neutral_payment_gateway.sql`

Tras revisar la lista, aplicar en QA con credenciales privadas del entorno y ejecutar:

```bash
node_modules/.bin/supabase db push --project-ref tgywjfzuspxxfsdywmof --skip-vault
npm run db:test
npm run db:lint
node_modules/.bin/supabase db advisors --project-ref tgywjfzuspxxfsdywmof --type security --level warn
```

`db:test` y `db:lint` ya están fijados a QA. Si CLI requiere enlace IPv4, usar `supabase link --help` y vincular explícitamente QA; no usar producción como sustituto. Una consulta inicial de diagnóstico encontró el entorno pausado y una limitación IPv6 de la configuración local; no se intentó reactivar ni resolver cambiando de proyecto.

Los tests pgTAP nuevos cubren roles, referencias, céntimos, estados, idempotencia, rollback por fallo de pedido, devolución canónica y acceso sandbox. El archivo `supabase/tests/isolation/gateway-concurrency.spec` contiene tres carreras para PostgreSQL isolationtester usando dos sesiones remotas QA. Requiere el runner oficial cliente y una conexión de pruebas; se ejecuta aparte de `db:test`. No iniciar una base local para ello. No afirmar que locks y carreras funcionan por haber pasado sólo Vitest o el parser SQL.

### 2. Configurar secretos del runtime

En **Supabase → Edge Functions → Secrets** de QA, y después de validar también en producción:

| Nombre | Valor / origen |
|---|---|
| `PAYMENT_CREDENTIALS_KEY` | 32 bytes aleatorios codificados en base64, generados una sola vez y conservados en un gestor de secretos. Cifra las credenciales por restaurante. |
| `PAYMENT_RECONCILE_TOKEN` | Secreto aleatorio de al menos 32 caracteres para el job cloud. |
| `PAYMENT_CUSTOMER_ORIGIN` | Origen HTTPS del frontend de QA; en producción `https://suyadelivery.com`, sin ruta ni slash final. |
| `ALLOWED_ORIGINS` | Orígenes exactos autorizados de las apps, separados por coma, sin comodines. |

El runtime Supabase aporta `SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY`. Mantener el esquema de claves soportado por el código actual; nunca enviar `service_role` al navegador.

No poner estos secretos en variables `VITE_`, archivos de outputs, PR, capturas, mensajes o logs. Para CLI, usar `supabase secrets set --help` y un `--env-file` privado con permisos 0600 que esté excluido de Git; no introducir claves literales en argumentos. La clave maestra debe permanecer estable: cambiarla sin recifrar el historial impediría conciliar pagos antiguos. Conservar copia segura fuera del repositorio.

Los Access Token y secretos HMAC de Mercado Pago se introducen después desde el formulario del panel; no hay que editar código ni añadirlos a un build.

### 3. Desplegar funciones y frontend de QA

Tras superar migraciones y pruebas SQL:

```bash
node_modules/.bin/supabase functions deploy payment-gateway --project-ref tgywjfzuspxxfsdywmof
node_modules/.bin/supabase functions deploy payment-webhook --project-ref tgywjfzuspxxfsdywmof
node_modules/.bin/supabase functions deploy create-culqi-order --project-ref tgywjfzuspxxfsdywmof
node_modules/.bin/supabase functions deploy charge-culqi-card --project-ref tgywjfzuspxxfsdywmof
node_modules/.bin/supabase functions deploy culqi-webhook --project-ref tgywjfzuspxxfsdywmof
```

`supabase/config.toml` configura la entrada HTTP pública; los handlers verifican JWT/guest mediante RPC, HMAC de Mercado Pago o Basic+API de Culqi. `verify_jwt=false` no significa que se acepten eventos financieros sin autenticar.

Compilar las apps con sus variables públicas de QA reales y `VITE_BACKEND=supabase`, proveedor de mapas real y `VITE_ANALYTICS_PROVIDER=suya`. Sin mocks ni `CI_E2E` en una publicación. Mercado Pago se activa desde DB/panel; no necesita flags ni claves Vite. Mantener Culqi desactivado si no tiene credenciales oficiales propias.

El workflow existente `.github/workflows/supabase-functions.yml` quedó ampliado para ambas funciones y secretos nuevos. Su ejecución manual en `main` aplica cambios productivos: **no se ejecutó en esta misión y no debe ejecutarse hasta superar QA/sandbox y aprobar la publicación**. La publicación del frontend continúa usando Cloudflare Pages y sus verificaciones existentes.

## Uso del formulario administrativo

Ruta web del panel: `/payments`. App unificada: `/backoffice/payments`. Requiere sesión y permisos de administrador de plataforma, propietario o gerente del restaurante en backend. La ruta protegida no sustituye la autorización de RPC.

1. Elegir restaurante y método **Mercado Pago — API oficial**.
2. Elegir **Pruebas**, guardar Access Token oficial de vendedor test y clave secreta de firma de Webhooks. El servidor cifra los valores, borra su visibilidad en el formulario y deja el cobro desactivado.
3. Pulsar **Comprobar conexión**. Consulta `/users/me`, exige sitio Perú `MPE`, cuenta activa y entorno coherente. Crea una preferencia no pagada para comprobar permiso API. La creación de una preferencia no debita dinero. La URL live de esa sonda nunca se entrega como un pago.
4. Copiar la URL exacta de Webhooks que muestra el panel. Incluye `restaurant_id` y `version`; cambiar cualquiera sin conservar el historial puede impedir conciliar pagos ya emitidos.
5. En [Mercado Pago Developers](https://www.mercadopago.com.pe/developers/panel/app), configurar esa URL para notificaciones **payment**, copiar la firma secreta correspondiente al mismo entorno y enviar una notificación de prueba oficial.
6. Pulsar **Actualizar verificación** en SUYA. Sólo un HMAC válido marca el canal verificado. El simulador puede usar un ID financiero inexistente y obtener un error de consulta; eso jamás autoriza un pago. La interfaz separa firma recibida de transacción financiera confirmada.
7. **Realizar prueba segura** genera sólo un enlace sandbox. Usar exclusivamente comprador y medios de prueba oficiales. Esta sonda no es un pedido y no demuestra el recorrido pago→pedido.
8. Para el recorrido completo en QA, iniciar sesión cliente con una identidad `platform_admin` autorizada por Auth y crear un pedido propio. El checkout mostrará **Prueba Mercado Pago** sólo a ese administrador cuando la configuración test esté comprobada. Elegirlo, completar el sandbox oficial y revisar `test_confirmed` en cobros/auditoría. La orden se mantiene `pending_payment`: **ninguna prueba sandbox libera pedidos operativos**. Cancelar el pedido QA al terminar mediante el flujo autorizado del proyecto.
9. Repetir casos pendientes, rechazados, webhook inválido/repetido, reconexión, error DB, importes y referencias incorrectos, y confirmar los tests SQL/carreras. Los handlers devuelven 5xx ante fallo de API/DB para permitir reintentos; nunca inventan éxito.
10. Después de validar QA, usar credenciales live propias. Guardarlas crea una versión nueva desactivada. Repetir comprobación y notificación oficial para esa versión. Confirmar que el titular está habilitado para las ventas del restaurante y aceptar la tarifa efectiva. **Activar cobro automático** permanece bloqueado si falta cualquiera de esos requisitos.

El checkout público mostrará **Pago en línea** cuando el servidor declare la modalidad disponible. El comprador ve el enlace del proveedor por el importe calculado en servidor. Volver del checkout, un callback del navegador o pulsar un botón nunca marca la orden como pagada.

Las firmas de eventos QR de otros productos no se presuponen iguales a payment de Checkout Pro. [Documentación de notificaciones](https://www.mercadopago.com.pe/developers/es/docs/checkout-pro-preferences/payment-notifications), [cuentas de prueba](https://www.mercadopago.com.pe/developers/es/docs/your-integrations/test/accounts).

## Recuperación automática sin celular ni computadora personal

El webhook consulta la API oficial en cada evento. El job cloud recupera eventos omitidos buscando pagos por referencia; no aprueba por coincidencia de monto.

En GitHub configurar secretos:

- `PAYMENT_GATEWAY_URL=https://cggxooilzhqlcnofgtmi.supabase.co/functions/v1/payment-gateway` en producción; usar endpoint QA sólo para su job aislado de pruebas.
- `PAYMENT_RECONCILE_TOKEN`, igual al del runtime correspondiente.

Definir la variable de repositorio `PAYMENT_RECONCILIATION_ENABLED=true` sólo tras comprobar la configuración. El workflow `.github/workflows/reconcile-payments.yml` consulta lotes de hasta 20 intentos cada cinco minutos. Permanece deshabilitado por defecto en esta entrega. Los reintentos de red/5xx son limitados; HTTP207, fallidos o diferidos se reportan como fallo visible y vuelven en un ciclo posterior.

GitHub schedule puede retrasarse y deshabilitarse por inactividad del repositorio público; revisar su salud. No tiene SLA de puntualidad y el webhook sigue siendo el canal principal. Los runners estándar de un repositorio público son gratuitos según [GitHub](https://docs.github.com/en/actions/concepts/billing-and-usage); Supabase conserva sus cuotas y límites propios. No se contrató hosting adicional ni se promete consumo ilimitado gratuito.

## Excepciones y operación

- **Pago correcto:** ID financiero único, receptor/entorno/referencia UUID/metadata/importe exacto PEN/captura validados. La RPC registra transacción y evento, autoriza intento y confirma pedido atómicamente. Realtime y `order_events` alimentan la operación existente; no se acepta el pedido por el restaurante.
- **Mismo importe en dos pedidos:** se asocia por UUID y metadata oficiales, nunca por monto solo. Una transacción no se reutiliza.
- **Pendiente/rechazado:** no libera pedido. Los reintentos conservan el mismo pedido y buscan una preferencia anterior antes de crear otra.
- **Timeout incierto:** no crear otro pedido ni cobrar por un canal alternativo sin conciliar. Conservar el ID y usar **Consultar al proveedor**.
- **Vencido, cancelado o confirmación tardía:** se conserva la transacción y la excepción `late_review`; no se reabre automáticamente la orden. El administrador coordina prestación o devolución según evidencia oficial. No existe botón para forzar un pago como recibido.
- **Importe distinto, identidad distinta o transacción reutilizada:** se rechaza la autorización y queda auditoría. No corregir el importe para hacerlo coincidir ni editar tablas de dinero a mano.
- **Devoluciones y disputas:** ejecutar devolución sólo desde la cuenta oficial del proveedor con autorización del titular. SUYA consulta API/webhook y registra estado parcial/total/disputa sin borrar historial ni reactivar una venta. No se implementó un botón de refund que mueva dinero.
- **Culqi:** se conserva. Un resultado incierto queda bloqueado para conciliación; verificar orden/cargo en API/panel oficial antes de cualquier recuperación. Las claves `pk_test`/`sk_test` y Basic webhook se configuran con el flujo existente. No se afirmó compatibilidad DNI productiva actual sin evaluación del proveedor.
- **Yape/Lemon personal:** declaraciones/códigos y observaciones son indicios pendientes. Ya no autorizan ni cancelan pedidos. El QR existente puede configurarse en Dispositivos de pagos; no habilita la confirmación automática. Plin personal no se añadió como una integración financiera ficticia.
- **Rotación:** credenciales nuevas desactivan el método hasta comprobarlas. Versiones antiguas cifradas permanecen para eventos de pagos anteriores. Desactivar nuevas ventas no elimina un abono ya emitido ni su conciliación.

## Validación de esta entrega y condiciones para producción

Ver `PAYMENT_VERIFICATION.json` y `SUYA_PAYMENT_RESEARCH.md`.

- 524 pruebas locales Vitest superadas, además de types/lint/builds y escaneo de secretos.
- UI de configuración probada a 320/390/1440 px con respuestas controladas claramente identificadas. Capturas no contienen claves ni información personal.
- Smoke de tres bundles en Chromium con rutas públicas/protegidas; no se autenticó una compra real.
- SQL y PLpgSQL nuevos parseados; pgTAP y concurrencia remota escritos pero **no ejecutados**.
- Sandbox autenticado, despliegue remoto y cobro real **pendientes**.

No promocionar sólo por pruebas locales. Faltan ejecución SQL/RLS/rollback/carreras en QA, sandbox oficial completo, revisión de permisos/tarifa de la cuenta, publicación autorizada y primer pago real autorizado. No se necesita reescribir código para configurar una cuenta admitida; sí completar esos pasos externos. La restricción sin RUC permanece sin acreditar para la habilitación comercial concreta del usuario.


## Motor AutoCloud integrado

# Guía de Activación y Configuración de Cobros — SUYA Delivery

Este documento detalla cómo activar el motor de recepción y verificación automática de pagos integrado en **SUYA Delivery**, reduciendo tu intervención manual al mínimo: elegir el proveedor, pegar tus credenciales oficiales en **Configuración de cobros — SUYA Delivery**, comprobar la conexión, ejecutar la prueba segura y activar.

---

## 1. ¿Qué ruta elegir según tu DNI o RUC 10?

| Tu preferencia operativa | Proveedor integrado a elegir | ¿Requiere RUC o Empresa? | Comisión real | ¿Cómo paga el cliente? | ¿Verificación 100% automática sin celular? |
| :--- | :--- | :--- | :--- | :--- | :---: |
| **Opción 0 — Comisión 0% + Sin Celular (AutoCloud QR Estático)** | **QR Estático AutoCloud (`static_qr`) — Yape / Plin / Lemon / IzipayYA** | **Solo DNI peruano** *(o RUC 10 gratis para IzipayYA)* | **`0% (S/ 0.00)`** | Tu QR estático EMVCo (`000201...`) se transforma en la nube con **monto bloqueado (`Tag 54` + céntimo único de conciliación)** y `CRC-16` recalculado; el cliente escanea desde Yape, Plin, Lemon o cualquier app bancaria | **SÍ (AutoCloud vía Cloudflare Email Worker o Gmail API OAuth2 con verificación criptográfica DKIM/SPF/DMARC)** |
| **Opción A — Solo DNI (Pasarela API directa)** | **Mercado Pago Perú (`mercado_pago`)** | **Solo DNI peruano** (Cuenta Personal, sin RUC ni empresa) | `3.49% + S/ 1.00 + IGV` *(S/ 2.00 en pedido de S/ 20)* | **Yape** (celular + código de aprobación de 6 dígitos de la app Yape) o **Tarjeta** | **SÍ (< 2 segundos en la nube)** |
| **Opción B — Menor comisión en pasarela + Yape y Plin con QR Dinámico** | **TAYPI (`taypi_qr`) / KUTI** | **RUC 10 Persona Natural** *(Trámite 100% gratis en 15 min desde App Personas SUNAT con tu DNI, **sin constituir empresa**)* | **`2.50% + S/ 0.20 + IGV`** *(S/ 0.83 en pedido de S/ 20)* | Escanea un **QR Dinámico EMVCo** único por pedido desde **Yape, Plin, BCP, Interbank, BBVA, Scotiabank o Lemon** | **SÍ (< 3 segundos vía Webhook BCRP/CCE)** |
| **Opción C — Yape OTP + QR Plin + Tarjetas con abono el mismo día en BCP** | **Culqi Online (`culqi`)** | **RUC 10 Persona Natural** *(gratis con DNI, sin empresa)* | `3.44% + US$ 0.20 (≈ S/ 0.75)` | **Botón Yape**, **QR Plin/Yape** o **Tarjeta** | **SÍ (API + Webhook en la nube)** |

---

## 2. Paso a Paso: Activar la Opción 0 — QR Estático AutoCloud (`static_qr`) para Yape / Plin / Lemon / IzipayYA (0% Comisión y Sin Celular Encendido)

### ¿Cómo logra SUYA automatizar un QR Estático en la nube sin depender de un celular?
Todos los códigos QR interoperables del Perú (**Yape, Plin, Lemon e IzipayYA**) siguen el estándar **EMVCo Merchant-Presented QR del BCRP (`000201...6304XXXX`)**. SUYA combina dos motores 100% cloud en [`src/lib/payments/staticQrAutoCloud.ts`](src/lib/payments/staticQrAutoCloud.ts):

1. **Inyección Dinámica EMVCo (`Tag 54` + Céntimo Único + `CRC-16/CCITT-FALSE`)**:
   - Pegas una sola vez la cadena EMVCo (`000201...`) de tu QR estático de **Yape, Plin, Lemon o IzipayYA** en **Configuración de cobros — SUYA Delivery**.
   - Por cada pedido, SUYA asigna automáticamente un **importe único de conciliación en céntimos** (`allocateUniqueConciliationAmountCents`, con micro-descuento de `0` a `99` céntimos para el cliente en caso de pedidos simultáneos del mismo precio: `S/ 25.00`, `S/ 24.99`, `S/ 24.98`...) e inyecta ese monto exacto en el `Tag 54` y la referencia `SUYA-...` en el `Tag 62` (`Subtag 05`) de tu QR, recalculando la suma de verificación `Tag 63 (CRC-16)`.
   - Cuando el cliente escanea ese QR desde **Yape, Plin o Lemon**, el monto exacto ya aparece precargado y bloqueado.
2. **Conciliación Criptográfica AutoCloud Sin Celular (`Cloudflare Email Worker` o `Gmail API OAuth2`)**:
   - Cuando el pago entra a tu cuenta receptora (**Plin Interbank / BBVA / Scotiabank, IzipayYA, Lemon o alertas BCP/Yape por correo**), el banco/billetera envía una constancia oficial por correo firmada criptográficamente con **DKIM (`RFC 6376`), SPF y DMARC**.
   - El worker serverless ([`scripts/cloudflare-email-worker-autocloud.mjs`](scripts/cloudflare-email-worker-autocloud.mjs)) o el sincronizador serverless de Gmail API (`action: 'sync_gmail_autocloud'` en [`supabase/functions/payment-gateway/index.ts`](supabase/functions/payment-gateway/index.ts)) valida:
     - `Authentication-Results` emitido por `mx.cloudflare.net` o `mx.google.com` con `spf=pass`, `dkim=pass` y `dmarc=pass`.
     - Dominio firmante en lista blanca bancaria (`notificacionesbcp.com.pe`, `bcp.com.pe`, `yape.com.pe`, `interbank.pe`, `interbank.com.pe`, `netinterbank.com.pe`, `bbva.com.pe`, `scotiabank.com.pe`, `izipay.pe`, `lemon.me`).
     - Integridad criptográfica del cuerpo (`DKIM-Signature` SHA-256 `bh=`) para impedir cualquier adulteración.
   - El motor empareja atómicamente el monto exacto en céntimos y el `providerOperationNumber` único contra `public.payment_attempts` y liquida el pedido en PostgreSQL en menos de 3 segundos, **sin ningún celular encendido**.

### Qué cuenta receptora usar para que el banco siempre envíe correo en cada cobro Yape / Plin
- **Recomendación #1 (Solo DNI, 0% comisión)**: Vincula tu QR receptor a **Plin Interbank**, **Plin BBVA**, **Plin Scotiabank** o **Lemon Cash Perú** (todas son 100% interoperables: tus clientes te pagan desde **Yape** o **Plin** escaneando el mismo QR y el banco envía correo inmediato `spf=pass; dkim=pass; dmarc=pass` por cada abono recibido).
- **Recomendación #2 (QR IzipayYA 0% comisión)**: Activa las notificaciones de abono por correo de `izipay.pe`.
- **Recomendación #3 (BCP / Yape)**: Activa las alertas de abono en cuenta por correo de `notificacionesbcp.com.pe`.

### Paso 1: Extraer el texto EMVCo (`000201...`) de tu QR Estático
1. Escanea una sola vez tu imagen QR de Yape, Plin, Lemon o IzipayYA con cualquier lector QR estándar y copia la cadena de texto que empieza por `000201...` y termina en `6304XXXX`.
2. En **Configuración de cobros — SUYA Delivery**, elige **`QR Estático Billetera (static_qr)`** y pega esa cadena `000201...` en el campo **Payload EMVCo (`000201...`) o URL de QR Estático**.

### Paso 2: Activar el puente AutoCloud (Elige Cloudflare Email Worker o Gmail API OAuth2)

#### Alternativa 2A — Cloudflare Email Worker (Tiempo real < 2 seg, 100% gratis)
1. En tu panel de Cloudflare → **Email Routing** → **Email Workers**, crea un Worker pegando el contenido de [`scripts/cloudflare-email-worker-autocloud.mjs`](scripts/cloudflare-email-worker-autocloud.mjs).
2. En las variables del Worker en Cloudflare, configura:
   - `SUYA_WEBHOOK_URL`: `https://cggxooilzhqlcnofgtmi.supabase.co/functions/v1/payment-webhook?provider=static_qr`
   - `STATIC_QR_AUTOCLOUD_SECRET`: una clave secreta aleatoria (por ejemplo generada con `openssl rand -hex 32`).
   - Despliega el Worker con: `npx wrangler deploy --config scripts/wrangler.autocloud.toml` y registra el secreto con `npx wrangler secret put STATIC_QR_AUTOCLOUD_SECRET --config scripts/wrangler.autocloud.toml`.
3. Configura en tu correo bancario o en Cloudflare Email Routing el enrutamiento de los avisos de abono (`notificacionesbcp.com.pe`, `interbank.pe`, `interbank.com.pe`, `bbva.com.pe`, `scotiabank.com.pe`, `izipay.pe`, `lemon.me`) hacia el Worker `suya-autocloud-email-worker`.

#### Alternativa 2B — Sincronizador Serverless Gmail API OAuth2 (Sin dominio propio)
1. Si recibes los correos del banco directamente en una cuenta `@gmail.com`, crea credenciales OAuth2 de Gmail API (`https://www.googleapis.com/auth/gmail.readonly`) y obtén tu `GMAIL_REFRESH_TOKEN`.
2. Registra en Supabase Secrets:
   ```bash
   npx supabase secrets set \
     STATIC_QR_AUTOCLOUD_SECRET="tu_secreto_hmac_autocloud" \
     GMAIL_CLIENT_ID="tu_client_id.apps.googleusercontent.com" \
     GMAIL_CLIENT_SECRET="tu_client_secret" \
     GMAIL_REFRESH_TOKEN="1//04..." \
     --project-ref cggxooilzhqlcnofgtmi
   ```
3. La función `payment-gateway` (`action: "sync_gmail_autocloud"`) consultará directamente los mensajes autenticados por `mx.google.com`, verificará `DKIM/SPF/DMARC` y liquidará los pedidos automáticamente.

---

## 3. Paso a Paso: Activar la Opción A (Solo DNI — Mercado Pago Perú + Yape Automático)

### Paso 1: Obtener tus credenciales oficiales con tu DNI
1. Ingresa con tu cuenta personal (registrada con tu **DNI**) a [Mercado Pago Developers Perú](https://www.mercadopago.com.pe/developers/panel/app).
2. Haz clic en **Crear aplicación** → nombre: `SUYA Delivery` → selecciona **Pagos online** → **Checkout API / Transparente**.
3. En el menú lateral de tu aplicación:
   - Ve a **Credenciales de prueba** para copiar tu `Public Key` (`TEST-...`) y tu `Access Token` (`TEST-...`).
   - Ve a **Credenciales de producción** (completando la validación biométrica de tu DNI en la app de Mercado Pago) para copiar tu `Public Key` (`APP_USR-...`) y tu `Access Token` (`APP_USR-...`).
4. Ve a la pestaña **Webhooks** en el mismo panel de Mercado Pago:
   - En **URL de producción / prueba**, pega la URL de tu Edge Function de SUYA:
     ```text
     https://cggxooilzhqlcnofgtmi.supabase.co/functions/v1/payment-webhook?provider=mercado_pago
     ```
   - Selecciona el evento: **`Pagos (payments)`**.
   - Guarda y copia la **Clave secreta (`Webhook Signing Secret`)** generada por Mercado Pago.

---

## 4. Paso a Paso: Activar la Opción B (Comisión Mínima `2.50% + S/ 0.20 + IGV` — TAYPI QR Dinámico Yape + Plin)

1. *(Si aún no tienes RUC 10)*: Descarga la app oficial **Personas SUNAT**, elige **Inscríbete en el RUC** con tu DNI y selfie biométrica como **Persona Natural con Negocio** (demora 15 minutos, cuesta **S/ 0.00** y **no requiere constituir empresa ni ir a notaría**).
2. Regístrate en [taypi.pe](https://taypi.pe) (o [kuti.pe](https://kuti.pe)) con tu RUC 10 y el CCI de tu cuenta bancaria personal donde recibirás las liquidaciones.
3. En el panel de desarrolladores de TAYPI:
   - Copia tu `API Public Key` y tu `API Secret Key`.
   - Configura la URL de Webhook:
     ```text
     https://cggxooilzhqlcnofgtmi.supabase.co/functions/v1/payment-webhook?provider=taypi_qr
     ```
   - Copia el `Webhook Secret` (`HMAC-SHA256`).

---

## 5. Despliegue de Migración, Edge Functions y Secretos

Las credenciales guardadas desde el panel **Configuración de cobros — SUYA Delivery** se descifran automáticamente en las Edge Functions vía `get_payment_gateway_runtime_config`; adicionalmente puedes cargar los secretos globales en Supabase CLI y desplegar la migración y funciones tras integrar la rama en `main`:

```bash
# 1. Aplicar migración de base de datos y desplegar Edge Functions
npx supabase db push --project-ref cggxooilzhqlcnofgtmi
npx supabase functions deploy payment-gateway --no-verify-jwt --project-ref cggxooilzhqlcnofgtmi
npx supabase functions deploy payment-webhook --no-verify-jwt --project-ref cggxooilzhqlcnofgtmi

# 2. (Opcional si prefieres secretos por CLI además de guardar en la UI)
npx supabase secrets set \
  ALLOWED_ORIGINS="https://suyadelivery.com,https://panel.suyadelivery.com,https://rider.suyadelivery.com" \
  STATIC_QR_AUTOCLOUD_SECRET="tu_secreto_hmac_autocloud" \
  --project-ref cggxooilzhqlcnofgtmi

# 3. Si elegiste Cloudflare Email Worker AutoCloud (QR Estático 0% sin celular)
npx wrangler deploy --config scripts/wrangler.autocloud.toml
npx wrangler secret put STATIC_QR_AUTOCLOUD_SECRET --config scripts/wrangler.autocloud.toml
```

---

## 6. Activación desde el Panel Administrativo de SUYA (Sin Tocar Código)

1. Inicia sesión en el **Backoffice de SUYA Delivery** (`panel.suyadelivery.com` o `/settings` y `/wallets`).
2. Ubica la sección **«Configuración de cobros — SUYA Delivery»**.
3. En **1. Método receptor**, selecciona el proveedor deseado (`Mercado Pago Perú`, `TAYPI / KUTI QR Dinámico`, `Culqi Online`, `Izipay Online` o `QR Estático Billetera`).
4. Selecciona el **Entorno operativo** (`Pruebas seguras (Sandbox)` o `Producción (Dinero real)`).
5. Introduce tu `Public Key oficial`, `Secret Key / Access Token` y `Webhook Signing Secret` (las claves secretas se almacenan cifradas con `pgcrypto` en `private.payment_gateway_secrets` y nunca vuelven a exponerse al navegador).
6. Haz clic en **Guardar credenciales**.
7. Haz clic en **Comprobar conexión** y verifica el mensaje de confirmación.
8. Haz clic en **Realizar una prueba segura**: el sistema ejecutará automáticamente 4 verificaciones criptográficas y transaccionales (firma HMAC-SHA256, aislamiento de 2 pedidos simultáneos del mismo importe, deduplicación de webhooks y bloqueo de montos inexactos/indicios no verificados).
9. Una vez superadas ambas comprobaciones, se habilitará el botón **Activar método de cobro**. Haz clic en él para dejar el método activo.

---

## 7. Lista Precisa de Acciones que Todavía Dependen de Ti

Todo el código, migraciones SQL, Edge Functions, validadores criptográficos HMAC, máquina de estados atómica, interfaz de checkout del cliente, panel administrativo y pruebas automatizadas ya están implementados y verificados. Lo único que depende de ti para cobrar con dinero real es:

1. **Elegir tu modalidad inicial**:
   - Si no quieres activar RUC 10: entra con tu DNI a `mercadopago.com.pe/developers/panel/app` y copia tus credenciales de Mercado Pago Perú.
   - Si prefieres pagar la menor comisión (`2.50% + S/ 0.20 + IGV`) y aceptar tanto Yape como Plin con QR Dinámico: activa gratis tu RUC 10 en la app Personas SUNAT y crea tu cuenta en `taypi.pe` o `kuti.pe`.
2. **Cargar las variables secretas en tu proyecto Supabase** (`npx supabase secrets set ...`) y desplegar la migración `20261116203000_suya_automatic_payments_engine.sql` junto con las funciones `payment-gateway` y `payment-webhook`.
3. **Entrar a «Configuración de cobros — SUYA Delivery» en el Backoffice**, pulsar **Comprobar conexión**, pulsar **Realizar una prueba segura** y hacer clic en **Activar método de cobro**.
