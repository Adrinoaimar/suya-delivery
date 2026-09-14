# Integración de pagos reales

## Estado actual

El checkout habilita efectivo, Yape y Lemon. Para Yape/Lemon, Supabase crea un `payment_attempt`
con el total calculado por servidor, una referencia `SUYA-XXXXXXXX` y expiración. El celular de
caja solo ingresa evidencia de la notificación; Back Office busca coincidencias exactas por
restaurante, billetera, monto y ventana de tiempo, y un rol autorizado confirma el pago mediante
`verify_wallet_payment`. Una notificación nunca libera una orden automáticamente.

El QR del negocio es opcional y se configura en **Back Office → Dispositivos de pagos**. Es un
payload público del QR comercial; el cliente escribe el monto exacto indicado por Suya. No se
presenta como QR dinámico mientras no exista un proveedor que lo genere con monto embebido.

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

## Culqi: Yape y tarjeta

El flujo opcional Culqi crea la orden desde `create-culqi-payment-intent`, usando monto bloqueado del pedido. `create-culqi-order` crea la orden Culqi con metadata de `suya_order_id`, `suya_payment_attempt_id` y referencia visible. El cliente abre Checkout v4; Yape genera QR asociado al monto exacto. Tarjeta devuelve token al frontend de Culqi y `charge-culqi-card` crea el cargo en servidor. Datos de tarjeta nunca pasan por Suya.

La integración actual usa Checkout v4 por rapidez para las pruebas; Culqi indica migrar a Checkout Custom porque v4 quedará deprecado.

`culqi-webhook` recibe `order.status.changed`, consulta nuevamente la orden con `CULQI_SECRET_KEY`, valida estado, monto y moneda, y actualiza el intento de forma idempotente. No se autoriza por callback del navegador.

Activación requiere:

- `VITE_CULQI_GATEWAY_ENABLED=true` y `VITE_CULQI_PUBLIC_KEY` en el build web/mobile.
- Secretos Supabase: `CULQI_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY` disponible en Edge Functions y `ALLOWED_ORIGINS` con los tres dominios.
- En CulqiPanel, webhook `https://<project-ref>.supabase.co/functions/v1/culqi-webhook` con evento `order.status.changed`.
- Probar primero con llaves `pk_test_`/`sk_test_`; cambiar a live solo después de validar monto, estado y conciliación.

Yape Culqi exige órdenes dentro de sus límites publicados; el backend rechaza menos de S/6 y más de S/500 para este flujo. Lemon permanece como billetera manual hasta contar con API/webhook oficial compatible.

## Observer Android

El observador de notificaciones es opt-in, visible en Back Office, requiere permiso del sistema y sincroniza evidencia mínima `unverified`. Nunca confirma pagos por sí solo.
