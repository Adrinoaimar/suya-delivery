# Conectar Suya Wallet Observer con Supabase

La migración `20260907110000_wallet_observations.sql` crea una bandeja de observaciones no verificadas. No escribe en `payment_attempts`, no modifica pedidos y no marca pagos como confirmados.

## Primera conexión

1. Aplicar las migraciones de Suya en el proyecto Supabase (`supabase db push` desde un entorno autenticado).
2. Desde una sesión de propietario/manager crear un código con `create_wallet_observer_pairing(restaurant_id, receiver_account_id, 'Caja principal')`.
3. En **Back Office → Dispositivos de pagos**, genera el código de emparejamiento. Abre la APK dedicada **Suya** en el celular de caja, escribe el código una sola vez y concede el permiso de notificaciones. La APK recibe una credencial interna, la cifra en Android Keystore y nunca la muestra.
4. No usar `service_role` en el APK.

## Qué llega a la base

La RPC `ingest_wallet_observation` recibe proveedor, monto en céntimos, moneda, nombre visible, código visible, fecha y un `event_id` idempotente. El observador lee los campos estándar de Android (`title`, `text`, `bigText`, `subText`, `infoText` y `summaryText`) porque algunas versiones de Yape/Lemon colocan allí el código. La clave opaca de Android y el texto completo se usan únicamente para formar un hash local idempotente; nunca se envían. La base guarda el nombre y solo los últimos cuatro caracteres del código; el código completo se almacena como hash no recuperable. La notificación original nunca se envía: solo viaja el metadato mínimo.

El código de emparejamiento dura diez minutos y se consume una sola vez mediante `complete_wallet_observer_pairing`. No se habilita una ingesta anónima sin dispositivo: quitar toda autenticación permitiría inyectar pagos falsos.

## Revisión

Las observaciones empiezan en `unverified` y solo owner/manager o platform admin pueden leerlas. El cliente debe registrar el código de seguridad/operación; el servidor lo cruza con la evidencia antes de mostrar candidatos. La transición a pago verificado sigue siendo manual y autorizada; una notificación por sí sola no libera pedidos.
