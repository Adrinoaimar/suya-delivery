# Pagos Lemon con QR estático

Suya muestra un QR estático de Lemon y crea un intento de pago con el monto calculado por Supabase. El cliente nunca define el monto final.

## Prueba privada

1. Copia `.env.example` a `.env.local`.
2. Define `VITE_LEMON_QR_IMAGE` con una URL HTTPS privada o un `data:image/...`.
3. Trata el QR como contenido público de la app, no como secreto. No confirmes la imagen, el nombre del titular ni el valor en Git, Pages o documentación pública.
4. Ejecuta la migración `20260920193000_lemon_qr_payments.sql` en Supabase.
5. Abre checkout, elige Lemon y verifica que el importe mostrado coincida con el pedido.

El QR solo se muestra cuando `VITE_LEMON_QR_IMAGE` tiene valor. Sin esa variable, checkout conserva efectivo y muestra Lemon como no configurado.

## Evidencia de notificación

La app observadora reconoce el paquete `com.applemoncash`, guarda una observación cifrada localmente y la envía como `unverified`. Una notificación no autoriza un pedido automáticamente.

Un usuario `owner` o `manager` debe revisar la observación y llamar `reconcile_lemon_payment(observation_id, order_id)`. La RPC exige mismo negocio, proveedor Lemon, moneda PEN, monto exacto y ventana temporal del intento.

## Limitación actual

El QR estático no confirma el pago por sí mismo. La prueba valida visualización, creación de intento y captura de evidencia. Reconciliación manual sigue requerida hasta integrar una fuente oficial de confirmación Lemon.
