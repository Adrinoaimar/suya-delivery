# Firma de release Android

El repositorio no contiene keystore ni contraseñas. `assembleRelease` funciona sin secretos y
produce `app-release-unsigned.apk`; ese artefacto sirve para inspección, no para distribución.
El workflow `Compilar Suya Android` genera APKs **debug de QA**, no releases firmadas. No se debe
reenviar ninguno de esos artefactos como actualización oficial.

## Variables privadas

Para producir un APK instalable firmado, define estas cuatro variables únicamente en el entorno de
build (local seguro o GitHub Actions Secrets):

```dotenv
SUYA_RELEASE_STORE_FILE=/ruta/privada/suya-upload.jks
SUYA_RELEASE_STORE_PASSWORD=...
SUYA_RELEASE_KEY_ALIAS=suya-upload
SUYA_RELEASE_KEY_PASSWORD=...
```

El archivo debe existir en el runner y nunca debe subirse al repositorio. Sin variables, el build
deja resultado explícitamente unsigned. Configuración parcial falla con los nombres exactos de las
variables ausentes. Gradle solo firma `release` cuando están presentes las cuatro variables.

Para actualizar una APK ya instalada, usa **la misma clave de firma original**, el mismo
`applicationId` y un `versionCode` mayor. Una clave nueva no actualizará la instalación anterior;
el usuario tendría que desinstalarla y perdería los datos locales de esa aplicación. Antes de
distribuir, compara la huella del certificado anterior con la del nuevo mediante `apksigner`.
Las cuatro APK release 1.6/code 7 verificadas usan certificado SHA-256
`4695c3a9d18c672c891fbe90c4b53bb436c3a456f501261f4d154c6ca6aec071`.

## Crear un keystore nuevo (solo primera instalación)

Ejecuta en una máquina segura, conserva una copia de respaldo y registra alias/huella en el gestor
de secretos del propietario:

```bash
keytool -genkeypair -v \
  -keystore suya-upload.jks \
  -alias suya-upload \
  -keyalg RSA -keysize 4096 -validity 10000
```

No crees una clave nueva para reemplazar una APK ya distribuida sin aceptar explícitamente una
reinstalación. No reutilices este comando con contraseñas reales dentro del historial shell. Para CI, guarda el
keystore como secreto base64 (`SUYA_RELEASE_KEYSTORE_BASE64`), decodifícalo en un archivo temporal
con permisos restrictivos, exporta `SUYA_RELEASE_STORE_FILE` a esa ruta, ejecuta Gradle y elimina el
archivo temporal al finalizar.

## Verificación

```bash
bash android/gradlew -p android assembleRelease --no-daemon

# Debe mostrar certificados para un APK firmado; fallará para unsigned.
$ANDROID_HOME/build-tools/35.0.0/apksigner verify --verbose --print-certs \
  android/app/build/outputs/apk/release/app-release.apk

# Repite con la APK anterior y compara el digest SHA-256 del firmante.
$ANDROID_HOME/build-tools/35.0.0/apksigner verify --verbose --print-certs \
  /ruta/privada/apk-anterior.apk
```

Además de la firma, antes de compartir una APK se exige staging aislado, prueba de login por rol,
instalación de actualización sobre la versión anterior y regresión Android en el commit exacto.
La firma release aún requiere la clave original y custodia segura del propietario. No se incluyen
secretos de firma en CI hasta recibirlos por un canal seguro.
