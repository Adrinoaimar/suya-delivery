# Izipay QR en Suya

Suya crea el pedido con total calculado en Supabase. Después, la Edge Function
`create-izipay-payment` crea el intento Izipay y entrega al cliente solo la sesión
efímera necesaria para cargar el Web SDK. El estado final no se toma del cliente:
`izipay-webhook` verifica la firma y actualiza `payment_attempts` y `orders`.

## Activación

La interfaz permanece en efectivo mientras `VITE_IZIPAY_GATEWAY_ENABLED=false`.
Para sandbox, construir con:

```dotenv
VITE_IZIPAY_GATEWAY_ENABLED=true
VITE_IZIPAY_ENVIRONMENT=sandbox
```

Configurar en Supabase, fuera del bundle y del APK:

```text
IZIPAY_ENVIRONMENT=sandbox
IZIPAY_MERCHANT_CODE=...
IZIPAY_PUBLIC_KEY=...
IZIPAY_KEY_RSA=...
IZIPAY_HASH_KEY=...
IZIPAY_WEBHOOK_URL=https://<project-ref>.supabase.co/functions/v1/izipay-webhook
ALLOWED_ORIGINS=https://suyadelivery.com,https://<project-ref>.pages.dev
```

Aplicar migraciones, desplegar `create-izipay-payment`, `izipay-webhook` y
`reconcile-izipay-payments`, y ejecutar el smoke test sandbox antes de producción.
Nunca poner claves Izipay ni secretos Supabase en variables `VITE_*`.

## Confirmación

El callback del SDK solo informa que Izipay respondió. Confirmación operativa
requiere webhook HMAC verificado y conciliación periódica. Si la Edge Function no
puede preparar el intento, pedido queda creado para efectivo y app informa al cliente.
