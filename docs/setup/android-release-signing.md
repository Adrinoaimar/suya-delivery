# Firma de release Android

El repositorio no contiene keystore ni contraseñas. `assembleRelease` funciona sin secretos y
produce `app-release-unsigned.apk`; ese artefacto sirve para inspección, no para instalar sobre
una versión firmada. `npm run build:mobile:roles -- --release` exige las cuatro variables de abajo,
compila Cliente, Repartidor, Backoffice y Caja con la misma firma y guarda las APK en
`output/android/` sin borrar otros artefactos.

## Variables privadas

Para producir un APK instalable firmado, define estas cuatro variables únicamente en el entorno de
build (local seguro o GitHub Actions Secrets):

```dotenv
SUYA_RELEASE_STORE_FILE=/ruta/privada/suya-upload.jks
SUYA_RELEASE_STORE_PASSWORD=...
SUYA_RELEASE_KEY_ALIAS=suya-upload
SUYA_RELEASE_KEY_PASSWORD=...
```

El archivo debe existir en el equipo de build y nunca debe subirse al repositorio. Sin variables,
el build helper release se detiene; configuración parcial falla para evitar una entrega ambigua.

## Crear un keystore nuevo

Ejecuta en una máquina segura, conserva una copia de respaldo y registra alias/huella en el gestor
de secretos del propietario:

```bash
keytool -genkeypair -v \
  -keystore suya-upload.jks \
  -alias suya-upload \
  -keyalg RSA -keysize 4096 -validity 10000
```

No reutilices este comando con contraseñas reales dentro del historial shell. Para CI, guarda el
keystore como secreto base64 (`SUYA_RELEASE_KEYSTORE_BASE64`), decodifícalo en un archivo temporal
con permisos restrictivos, exporta `SUYA_RELEASE_STORE_FILE` a esa ruta, ejecuta Gradle y elimina el
archivo temporal al finalizar.

## Verificación

```bash
bash android/gradlew -p android assembleRelease --no-daemon

# Debe mostrar certificados para un APK firmado; fallará para unsigned.
$ANDROID_HOME/build-tools/35.0.0/apksigner verify --verbose --print-certs \
  android/app/build/outputs/apk/release/app-release.apk
```

Para auditar versión, rol, firma y compatibilidad con el certificado instalado, pasa las rutas de
`aapt2` y `apksigner` al verificador. También acepta `--expected-cert-sha256` con la huella pública
del certificado de la APK que ya está en el teléfono.

El workflow público compila APK debug; las releases firmadas se generan en el entorno local
protegido del propietario. No guardes contraseñas en Git, comandos del shell ni logs.
