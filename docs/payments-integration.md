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

Tarjeta sigue bloqueada en la interfaz porque todavía falta una pasarela autorizada y su webhook.

## Contrato requerido para una pasarela

No basta sustituir `CashPaymentService`. Un proveedor real puede requerir tokenización, 3DS,
redirect y confirmación asíncrona. Para tarjeta, ampliar `PaymentResult` con estados como
`pending`, `requires_action`, `authorized` y `failed`, además de `clientSecret`/`returnUrl` cuando
corresponda. La orden solo debe quedar pagable/confirmada después del webhook autenticado.

El total debe recalcularse en Supabase desde catálogo y reglas del negocio; nunca confiar en el
monto calculado por el navegador. Crear el intento de pago y la orden debe ser idempotente, con
firma/verificación del webhook, auditoría y protección contra reintentos.

No integrar claves de prueba como producción ni publicar una opción visual que el backend rechaza.
