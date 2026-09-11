# Firma de release Android

El repositorio no contiene keystore ni contraseñas. `assembleRelease` funciona sin secretos y
produce `app-release-unsigned.apk`; ese artefacto sirve para inspección, no para distribución.
El workflow `Compilar Suya Android` publica este artefacto separado del APK debug para comprobar
el pipeline release sin confundirlo con una entrega firmada.

## Variables privadas

Para producir un APK instalable firmado, define estas cuatro variables únicamente en el entorno de
build (local seguro o GitHub Actions Secrets):

```dotenv
SUYA_RELEASE_STORE_FILE=/ruta/privada/suya-upload.jks
SUYA_RELEASE_STORE_PASSWORD=...
SUYA_RELEASE_KEY_ALIAS=suya-upload
SUYA_RELEASE_KEY_PASSWORD=...
```

El archivo debe existir en el runner y nunca debe subirse al repositorio. Sin variables, build deja
resultado explícitamente unsigned. Configuración parcial falla para evitar una entrega ambigua.

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

La firma release aún requiere decisión del propietario sobre keystore, alias y custodia. No se
incluyen secretos de firma en CI hasta recibirlos por un canal seguro.
