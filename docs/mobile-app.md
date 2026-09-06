# Suya móvil

Suya móvil reutiliza la aplicación customer existente mediante Capacitor. El WebView comparte React,
React Router, Zustand y los servicios Supabase de la web; no duplica catálogo, pedidos ni reglas RLS.

## Targets

- Android: `android/`, application id `com.suya.app`.
- iOS: `ios/`, bundle id `com.suya.app`.
- Web assets: `dist/customer`.

## Build local

Configura las variables productivas de Supabase y ejecuta:

```bash
npm run build:mobile
cd android
./gradlew assembleDebug
```

APK: `android/app/build/outputs/apk/debug/app-debug.apk`.

En Windows, Android requiere JDK 21, Android SDK y Build Tools. iOS requiere macOS/Xcode para
compilar o firmar. El workflow `Compilar Suya iOS` valida el proyecto en macOS y publica una
aplicación para simulador. Un `.ipa` instalable exige un Apple Developer Team, certificado y perfil
de aprovisionamiento; esas credenciales no se guardan en el repositorio.

## Capacidades nativas

Capacitor integra splash, status bar, geolocalización, preferencias, compartir, portapapeles,
haptics y push notifications. El adaptador nativo de ubicación se usa solo en Android/iOS; navegador
mantiene `navigator.geolocation`. Push necesita configurar FCM/APNs antes de producción.
