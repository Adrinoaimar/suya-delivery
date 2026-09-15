# Integración de pagos reales

## Estado actual

El checkout habilita efectivo, Yape, Lemon y tarjeta cuando Culqi está configurado. Para Yape/Lemon
manuales, Supabase crea un `payment_attempt` con el total calculado por servidor, una referencia
`SUYA-XXXXXXXX` y expiración. La referencia Suya correlaciona el pedido; el código de seguridad u
operación de la constancia es el identificador fuerte del pago. El celular de caja solo ingresa
evidencia de la notificación; Back Office busca coincidencias exactas por restaurante, billetera,
monto, ventana de tiempo y código, y un rol autorizado confirma mediante `verify_wallet_payment`.
Una notificación nunca libera una orden automáticamente.

El QR estático del negocio es opcional y se configura en **Back Office → Dispositivos de pagos**.
El cliente escribe el monto exacto indicado por Suya y luego registra el código de la constancia.
No se presenta como QR dinámico: el QR dinámico por monto solo se usa en el flujo Culqi. Yape
Empresa ofrece operación por cajas y verificación en su portal ([sitio oficial](https://empresas.yape.com.pe/)),
pero este repositorio no inventa una API/webhook que no esté disponible; para autorización automática
se requiere un proveedor con webhook firmado.
Si una referencia manual vence, Suya cierra ese intento y genera una referencia nueva sin dejar
dos intentos pendientes para el mismo pedido.

Tarjeta queda bloqueada si Culqi no está configurado; con el flag y webhook activos usa checkout seguro.

## Reglas de una pasarela real

La integración no sustituye el control del servidor: Culqi tokeniza la tarjeta en Checkout,
Suya crea la orden/cargo desde Edge Functions y la orden solo puede pasar a preparación con un
intento digital `authorized`. Los estados conservan `pending`, `authorized` y `failed`; cualquier
acción adicional del proveedor debe resolverse en servidor.

El total debe recalcularse en Supabase desde catálogo y reglas del negocio; nunca confiar en el
monto calculado por el navegador. Crear el intento de pago y la orden debe ser idempotente, con
firma/verificación del webhook, auditoría y protección contra reintentos.

No integrar claves de prueba como producción ni publicar una opción visual que el backend rechaza.
## Flujo de identidad

Cada pedido digital nace con monto calculado por servidor y referencia única. Yape/Lemon manuales conservan solo los últimos cuatro caracteres del código de constancia; Back Office exige coincidencia exacta de restaurante, proveedor, monto PEN, ventana temporal y código antes de autorizar. Dos pagos de S/30 no se mezclan por monto.

Si el pedido se cancela, un trigger cierra cualquier intento pendiente como `failed` con motivo
`order_cancelled`; además, la búsqueda y la RPC final rechazan pedidos cancelados o entregados.

Si la notificación no muestra el código, caja puede copiarlo desde la constancia del cliente en **Dispositivos de pagos**. Suya guarda un fingerprint no reversible y solo muestra los últimos cuatro caracteres; también muestra el nombre visible del remitente y el cliente del pedido para resolver rápido una coincidencia.

## Culqi: Yape y tarjeta

El flujo opcional Culqi crea la orden desde `create-culqi-payment-intent`, usando monto bloqueado del pedido. `create-culqi-order` crea la orden Culqi con metadata de `suya_order_id`, `suya_payment_attempt_id` y referencia visible. Antes de llamar a Culqi, una reserva efímera de creación evita que dos toques creen dos órdenes externas; un intento ya autorizado se devuelve sin reemplazar su referencia `chr_`. El cliente abre Culqi Custom Checkout; Yape genera QR asociado al monto exacto. Tarjeta o Yape pueden devolver un token al frontend de Culqi y `charge-culqi-card` crea el cargo en servidor. Antes del cargo, Suya reserva atómicamente el intento para evitar doble cobro por reintentos concurrentes. Datos de tarjeta nunca pasan por Suya.

La integración usa `https://js.culqi.com/checkout-js`, con configuración de monto, orden, correo y método permitido por pedido. Se evita Checkout v4 porque Culqi indica que dejará de estar disponible.

El CSP de Pages permite únicamente el script de `js.culqi.com` y el frame/conexión de `checkoutview.culqi.com`, necesarios para que el checkout seguro funcione sin abrir otros orígenes.

`culqi-webhook` recibe `order.status.changed` con autenticación Basic configurada en CulqiPanel, consulta nuevamente la orden con `CULQI_SECRET_KEY`, valida estado, monto y moneda, y actualiza el intento de forma idempotente. No se autoriza por callback del navegador.

Activación requiere:

- `VITE_CULQI_GATEWAY_ENABLED=true` y `VITE_CULQI_PUBLIC_KEY` en el build web/mobile.
- Secretos Supabase: `CULQI_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CULQI_WEBHOOK_USERNAME`, `CULQI_WEBHOOK_PASSWORD` disponibles en Edge Functions y `ALLOWED_ORIGINS` con los tres dominios.
- En CulqiPanel, webhook `https://<project-ref>.supabase.co/functions/v1/culqi-webhook` con evento `order.status.changed`.
- Probar primero con llaves `pk_test_`/`sk_test_`; cambiar a live solo después de validar monto, estado y conciliación.

Yape Culqi exige órdenes dentro de sus límites publicados; el backend rechaza menos de S/6 y más de S/500 para este flujo. Lemon permanece como billetera manual hasta contar con API/webhook oficial compatible.

## Observer Android

El observador de notificaciones vive en la APK Android dedicada de caja (no en Rider ni Back Office), es opt-in, requiere permiso del sistema y sincroniza evidencia mínima `unverified`. Back Office crea el dispositivo y muestra el token una sola vez; la APK de caja lo guarda cifrado. Si falla la red, conserva los eventos cifrados y los reintenta en segundo plano con red disponible; usa la hora original de publicación para ajustar la ventana. Nunca confirma pagos por sí solo.
