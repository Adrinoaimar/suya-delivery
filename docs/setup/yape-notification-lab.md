# Laboratorio experimental de billeteras

## Qué hace

La APK Android dedicada de caja de Suya incluye un `NotificationListenerService` opt-in que
reconoce notificaciones de paquetes allowlist verificados de Yape, Lemon, Plin
(apps bancarias participantes) y Mercado Pago, extrae monto, moneda, nombre y código cuando están visibles y guarda hasta 100
observaciones cifradas. Con un dispositivo de caja configurado, sincroniza solo ese metadato
minimizado mediante `ingest_wallet_observation`; no abre billeteras y no modifica
pedidos. Si la red falla, conserva la evidencia cifrada y un `JobScheduler` persistente
la reintenta cuando vuelve la conectividad, como máximo cada 15 minutos. La hora enviada
corresponde a la publicación original de la notificación, no al momento posterior de
sincronización. Las futuras billeteras requieren registrar su package ID verificado en
un adaptador; no se aceptan IDs adivinados.

El extractor acepta remitentes con etiquetas `De:`, `From:`, `Remitente:` o `Sender:` y
separa esas etiquetas de códigos como `seguridad`, `operación` o `referencia`; el nombre
visible es contexto, no autorización.

Cada registro lleva `verification: unverified`: una notificación o captura puede
ser falsa, retrasarse o no incluir todos los datos. Nunca se debe marcar una
orden como pagada con este laboratorio.

## Prueba controlada

1. Instala la APK dedicada de caja en un Android de pruebas; Rider y Back Office no observan billeteras.
2. Crea un dispositivo en Back Office, copia el token una sola vez en la APK de caja y
   concede acceso a notificaciones en Ajustes de Android.
3. Recibe un pago de prueba de bajo monto en una billetera admitida y revisa que
   aparezcan proveedor, monto, moneda y código en **Dispositivos de pagos**.
   Plin se observa desde la app bancaria que emite la notificación.
4. Revoca el permiso y elimina los datos de Suya al terminar.

## Prueba de identidad: dos pagos de S/30

1. Crea dos pedidos distintos de exactamente S/30 y verifica que cada uno muestre una referencia `SUYA-…` diferente.
2. Haz que dos personas paguen por Yape. Cada persona escribe en su pedido el código completo visible en su constancia; Suya guarda solo un fingerprint y los últimos cuatro.
3. En **Dispositivos de pagos**, revisa nombre visible, hora, monto y código. Si la notificación no trae código, caja puede agregarlo desde la constancia del cliente.
4. Busca candidatos: solo aparece el pedido cuyo proveedor, monto, ventana y código coinciden. Verificar el código del segundo pedido sobre la primera observación debe fallar.
5. Confirma un pedido y prueba **Iniciar preparación**. El servidor debe permitirlo solo para el intento `authorized`; el otro permanece pendiente.

Repite la misma prueba con Lemon manual. Para Culqi, usa dos órdenes distintas desde Checkout y verifica que cada `ord_test_…` permanezca ligado a un solo pedido; el webhook es la fuente final de estado.

En una build `debug`, el archivo de observaciones se puede inspeccionar con:

```powershell
adb shell run-as com.suya.app cat shared_prefs/suya_yape_lab.xml
```

El servicio no es una integración oficial de ninguna billetera y puede romperse
si una billetera cambia el formato de sus notificaciones. Para producción, usa
Yape Empresa o una pasarela autorizada con webhook firmado, como Culqi o Izipay.
Las observaciones siguen siendo `unverified` y nunca confirman pagos.
