# Suya móvil

Suya móvil puede empaquetar en un único APK las experiencias de cliente, repartidor y backoffice, o
generar APKs operativos separados para las pruebas de cada rol. El WebView
comparte React, React Router, Zustand y los servicios Supabase de la web; no duplica catálogo, pedidos
ni reglas RLS.

## Targets

- Android: `android/`, application id `com.suya.app`.
- iOS: `ios/`, bundle id `com.suya.app`.
- Web assets del APK unificado: `dist/mobile`.
- Rutas nativas: cliente en `/`, repartidor en `/rider` y backoffice protegido en `/backoffice`.
- Los builds web separados (`customer`, `rider`, `backoffice`) se mantienen para Cloudflare Pages.

## APKs operativos por rol

El build por rol reutiliza los mismos bundles web protegidos y permite instalar ambas apps en el mismo
Android:

- Rider: `com.suya.rider`, pantalla inicial de acceso de repartidor.
- Backoffice: `com.suya.backoffice`, pantalla inicial de acceso de operaciones.

```bash
npm run build:mobile:roles
```

Salidas:

- `output/android/Suya-Rider-debug.apk`
- `output/android/Suya-Backoffice-debug.apk`

Son APKs debug para validación interna, no releases firmados para distribución. Google OAuth requiere
autorizar también los callbacks `com.suya.rider://auth/callback` y
`com.suya.backoffice://auth/callback` en la configuración de Supabase; el acceso demo por correo y
contraseña no depende de ese ajuste.

## Build local

Configura las variables productivas de Supabase y ejecuta:

```bash
npm run build:mobile
cd android
./gradlew assembleDebug
```

APK: `android/app/build/outputs/apk/debug/app-debug.apk`.

La sección "Ofertas exclusivas de la app" solo se muestra en el APK. El equipo autorizado crea y
activa campañas en `/backoffice/offers`; el cliente puede guardar el código y aplicarlo en checkout.
Fecha, negocio, mínimo, límite de redenciones y descuento se validan de nuevo en Supabase mediante
RPC transaccional, con una redención por pedido.

En Windows, Android requiere JDK 21, Android SDK y Build Tools. iOS requiere macOS/Xcode para
compilar o firmar. El workflow `Compilar Suya iOS` valida el proyecto en macOS y publica una
aplicación para simulador. Un `.ipa` instalable exige un Apple Developer Team, certificado y perfil
de aprovisionamiento; esas credenciales no se guardan en el repositorio.

## Capacidades nativas

Capacitor integra splash, status bar, navegador OAuth, geolocalización, preferencias, compartir,
portapapeles, haptics y push notifications. Google Auth usa PKCE, navegador del sistema y callback
`com.suya.app://auth/callback` en el APK unificado y un callback por rol en los APKs separados; su
activación externa se documenta en `docs/setup/google-auth.md`.
El adaptador nativo de ubicación se usa solo en Android/iOS; navegador mantiene
`navigator.geolocation`. Push necesita configurar FCM/APNs antes de producción.
