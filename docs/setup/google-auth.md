# Acceso con Google

La app ya implementa OAuth 2.0 con Supabase Auth, flujo PKCE y retorno seguro para web, Android e iOS. Las cuentas nuevas creadas con Google ingresan como clientes; los accesos de repartidor y backoffice siguen usando cuentas autorizadas por rol.

## Activación externa pendiente

1. En Google Cloud, crea una credencial OAuth de tipo **Aplicación web**.
2. Añade como URI de redirección autorizada el callback del proyecto: `https://cggxooilzhqlcnofgtmi.supabase.co/auth/v1/callback`.
3. En Supabase Dashboard, abre **Authentication > Providers > Google**, pega Client ID y Client Secret, y habilita Google.
4. En **Authentication > URL Configuration**, conserva los dominios web desplegados y añade `com.suya.app://auth/callback` a Redirect URLs.
5. Prueba una cuenta nueva y otra cuenta cuyo correo ya exista. Verifica creación de `profiles`, rol `customer`, cierre de sesión y reingreso.

Para Supabase local, define fuera del repositorio:

```dotenv
SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID=...
SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET=...
```

Después cambia temporalmente `auth.external.google.enabled` a `true` en una configuración local no publicada.

## Contrato móvil

- Callback: `com.suya.app://auth/callback`
- Android: `MainActivity` acepta el esquema mediante `VIEW` + `BROWSABLE`.
- iOS: `CFBundleURLSchemes` registra `com.suya.app`.
- La app abre Google con `@capacitor/browser`, intercambia `code` por sesión y cierra el navegador.
- El destino posterior solo acepta rutas locales iniciadas en `/`; URLs externas o rutas con `//` se rechazan.

## Seguridad

El Client Secret vive únicamente en Google Cloud/Supabase o en variables privadas del entorno local. Nunca debe usar prefijo `VITE_`, incluirse en APK, bundle web, logs, capturas ni commits.
