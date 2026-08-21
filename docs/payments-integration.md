# Integración de pagos reales

## Estado actual

Producción habilita únicamente efectivo contra entrega. `CashPaymentService` rechaza Yape y
tarjeta; `SupabaseOrderService` vuelve a rechazar cualquier método distinto de `cash`. Esto es
intencional: no se declara un pago digital sin proveedor, credenciales del comercio y webhook.

## Contrato requerido para una pasarela

No basta sustituir `CashPaymentService`. Un proveedor real puede requerir tokenización, 3DS,
redirect y confirmación asíncrona. Antes de habilitarlo, ampliar `PaymentResult` con estados como
`pending`, `requires_action`, `authorized` y `failed`, además de `clientSecret`/`returnUrl` cuando
corresponda. La orden solo debe quedar pagable/confirmada después del webhook autenticado.

El total debe recalcularse en Supabase desde catálogo y reglas del negocio; nunca confiar en el
monto calculado por el navegador. Crear el intento de pago y la orden debe ser idempotente, con
firma/verificación del webhook, auditoría y protección contra reintentos.

No integrar claves de prueba como producción ni publicar una opción visual que el backend rechaza.
