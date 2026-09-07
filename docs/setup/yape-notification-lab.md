# Laboratorio experimental de Yape

## Qué hace

La variante Android de Suya incluye un `NotificationListenerService` opt-in que
reconoce notificaciones de los paquetes oficiales de Yape, extrae monto y código
cuando están visibles y guarda hasta 100 observaciones localmente. No envía
datos, no abre Yape y no modifica pedidos.

Cada registro lleva `verification: unverified`: una notificación o captura puede
ser falsa, retrasarse o no incluir todos los datos. Nunca se debe marcar una
orden como pagada con este laboratorio.

## Prueba controlada

1. Instala el APK de laboratorio en un Android de pruebas.
2. Concede manualmente a Suya el acceso a notificaciones en Ajustes de Android.
3. Recibe un pago de prueba de bajo monto en Yape y revisa que aparezcan monto y
   código en el almacenamiento local del laboratorio.
4. Revoca el permiso y elimina los datos de Suya al terminar.

En una build `debug`, el archivo de observaciones se puede inspeccionar con:

```powershell
adb shell run-as com.suya.app cat shared_prefs/suya_yape_lab.xml
```

El servicio no es una integración oficial de Yape y puede romperse si Yape
cambia el formato de sus notificaciones. Para producción, usa Yape Empresa o
una pasarela autorizada con webhook firmado, como Culqi o Izipay.
