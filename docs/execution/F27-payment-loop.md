# F27 · Loop de pruebas de pago

Estado del código: commit `825fce0`; CI valida base de datos, frontend, E2E, Android e iOS. Este documento no contiene llaves ni datos de clientes.

## Preparación única

1. Aplicar migraciones en el proyecto Supabase de prueba y desplegar las Edge Functions desde la misma revisión.
2. Configurar en Supabase únicamente secretos de prueba: `CULQI_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY` y `ALLOWED_ORIGINS`.
3. Configurar el frontend con `VITE_CULQI_GATEWAY_ENABLED=true` y la llave pública `pk_test_...`; nunca colocar una `sk_...` en web o APK.
4. Registrar el webhook Culqi `order.status.changed` apuntando a `culqi-webhook` y comprobar que responde por HTTPS.
5. En Back Office, seleccionar el restaurante correcto, guardar las cuentas Yape/Lemon y crear un dispositivo de caja. Activar el acceso de notificaciones Android de forma explícita.

El observador conserva eventos cifrados si pierde red y reintenta en segundo plano cada 15 minutos como máximo. La observación conserva la hora de publicación original para no ampliar artificialmente la ventana de coincidencia.

La reserva de creación también cubre doble toque en `Continuar con pago`: una solicitud prepara la orden externa y la otra debe recibir `409`; no repitas el pago mientras el primer checkout esté preparando la orden.

## Caso 1 · Dos Yape de S/30

1. Crear dos pedidos desde dos sesiones de cliente, ambos por S/30.00, y anotar sus referencias visibles.
2. En cada cliente, pagar el monto exacto y escribir el código completo de aprobación de su propia constancia.
3. En el celular de caja, esperar dos observaciones `unverified`. Cada fila debe mostrar monto, hora y código enmascarado; el observador no autoriza.
4. En Back Office, pulsar `Buscar pedido` en cada fila. Debe aparecer un único cliente/pedido compatible.
5. Verificar el primer pago y comprobar que solo ese pedido pasa a `authorized`; repetir con el segundo.
6. Intentar preparar antes de verificar: debe fallar. Después de verificar: debe permitir preparación únicamente para ese pedido.

## Caso 2 · Culqi Yape QR dinámico

1. Crear un pedido entre S/6.00 y S/500.00.
2. Abrir `Abrir QR Yape`; el QR debe pertenecer a la orden Culqi y mostrar el monto exacto.
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

## Evidencia y límites

Guardar solo referencias, estados, timestamps y hashes de APK; no guardar llaves, números completos, credenciales ni capturas con datos personales. Una observación Android es evidencia mínima, opt-in y revisable; nunca reemplaza la confirmación del proveedor ni autoriza por sí sola.

Referencias oficiales: [órdenes Culqi](https://docs.culqi.com/es/documentacion/pagos-online/ordenes-de-pago/ordenes/), [billeteras móviles](https://docs.culqi.com/es/documentacion/pagos-online/ordenes-de-pago/billetera-moviles), [Checkout](https://docs.culqi.com/es/documentacion/checkout/v4) y [webhooks](https://docs.culqi.com/es/documentacion/pagos-online/webhooks/).
