# F27 · Loop de pruebas de pago

Estado del código: commit `8b60212`; CI valida base de datos, frontend, E2E, Android e iOS. Este documento no contiene llaves ni datos de clientes.

Último checkpoint: el QR de billeteras de Culqi usa la opción `billetera` del Custom Checkout (la opción `yape` corresponde al flujo de token/código de aprobación); queda bloqueado mientras espera `order.status.changed`. La pantalla se actualiza por polling y solo libera preparación cuando el servidor marca `authorized`. El flujo manual distingue pagos iguales con fingerprint/código completo y la observación Android sigue siendo evidencia no autorizante. Back Office refresca el permiso del observador al volver de Ajustes Android.

## Preparación única

1. Desde `main`, ejecutar el workflow manual `Desplegar Edge Functions Supabase`. Su preflight exige `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `CULQI_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY` y `ALLOWED_ORIGINS`; aplica migraciones y configura los secretos antes de desplegar las Edge Functions.
2. Mantener en GitHub/Supabase únicamente secretos de prueba hasta completar la validación: `CULQI_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY` y `ALLOWED_ORIGINS`.
3. Configurar el frontend con `VITE_CULQI_GATEWAY_ENABLED=true` y la llave pública `pk_test_...`; nunca colocar una `sk_...` en web o APK. El cliente usa Culqi Custom Checkout (`https://js.culqi.com/checkout-js`).
4. Registrar el webhook Culqi `order.status.changed` apuntando a `culqi-webhook` y comprobar que responde por HTTPS.
5. En Back Office, seleccionar el restaurante correcto, guardar las cuentas Yape/Lemon y crear un dispositivo de caja. Activar el acceso de notificaciones Android de forma explícita.

El observador conserva eventos cifrados si pierde red y reintenta en segundo plano cada 15 minutos como máximo. Back Office actualiza las observaciones visibles cada 15 segundos. La observación conserva la hora de publicación original para no ampliar artificialmente la ventana de coincidencia.
El parser admite etiquetas de remitente como `De:`/`From:` y separa el nombre del código de operación; el código completo sigue siendo la identidad principal del pago.

La rama con este flujo aún debe desplegarse a producción: el dominio público comprobado antes del despliegue muestra el checkout anterior, con efectivo únicamente. El gate de Cloudflare rechaza publicar si faltan `VITE_CULQI_GATEWAY_ENABLED=true` o `VITE_CULQI_PUBLIC_KEY`. No declarar las pruebas reales listas hasta aplicar migraciones/Edge Functions, configurar secretos y publicar el build correcto.

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

## Evidencia y límites

Guardar solo referencias, estados, timestamps y hashes de APK; no guardar llaves, números completos, credenciales ni capturas con datos personales. Una observación Android es evidencia mínima, opt-in y revisable; nunca reemplaza la confirmación del proveedor ni autoriza por sí sola.

Referencias oficiales: [órdenes Culqi](https://docs.culqi.com/es/documentacion/pagos-online/ordenes-de-pago/ordenes/), [billeteras móviles](https://docs.culqi.com/es/documentacion/pagos-online/ordenes-de-pago/billetera-moviles), [Custom Checkout](https://docs.culqi.com/es/documentacion/checkout/checkout-custom) y [webhooks](https://docs.culqi.com/es/documentacion/pagos-online/webhooks/).
