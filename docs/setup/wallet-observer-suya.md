# Conectar Suya Wallet Observer con Supabase

La migración `20260907110000_wallet_observations.sql` crea una bandeja de observaciones no verificadas. No escribe en `payment_attempts`, no modifica pedidos y no marca pagos como confirmados.

## Primera conexión

1. Aplicar las migraciones de Suya en el proyecto Supabase (`supabase db push` desde un entorno autenticado).
2. Desde una sesión de propietario/manager llamar `create_wallet_observer_device(restaurant_id, 'Caja principal')`.
3. Guardar el `device_token` una sola vez y pegarlo en **Suya Wallet Observer** junto con la URL y la publishable/anon key.
4. No usar `service_role` en el APK.

## Qué llega a la base

La RPC `ingest_wallet_observation` recibe proveedor, monto en céntimos, moneda, nombre visible, código visible, fecha y un `event_id` idempotente. La base guarda el nombre y solo los últimos cuatro caracteres del código; el código completo se almacena como hash no recuperable. La notificación original nunca se envía.

## Revisión

Las observaciones empiezan en `unverified` y solo owner/manager o platform admin pueden leerlas. La conciliación con un pedido y cualquier transición a pago verificado deben implementarse en un flujo posterior autorizado; una notificación por sí sola no libera pedidos.
