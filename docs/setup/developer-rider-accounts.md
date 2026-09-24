# Panel de desarrolladores: cuentas rider

Ruta del backoffice: `/developers/riders`.

El enlace y la ruta requieren `app_metadata.role = platform_admin`. La función `manage-rider-accounts` repite esa verificación con una sesión Auth vigente; el control de React no es la frontera de seguridad.

## Crear cuenta

El panel permite elegir una tienda activa, nombre, correo de acceso, teléfono y datos del vehículo. Genera una clave de 32 caracteres o acepta una clave propia de al menos 12 caracteres. La función crea el usuario Auth confirmado, completa `profiles` y `rider_profiles`, y habilita el vínculo en `restaurant_riders`. Si falla una fase, intenta revertir los registros y reporta si no pudo confirmar la reversión.

La clave solo aparece en la pantalla tras la operación; no se guarda en almacenamiento local ni se escribe en logs. El correo es identificador de inicio de sesión. Si no existe buzón, el usuario no puede recuperar su clave por email; un administrador puede restablecerla desde el panel.

## Restablecer clave

El panel solo ofrece riders activos de la tienda seleccionada. El servidor vuelve a validar esa membresía antes de cambiar contraseña mediante Auth Admin. La clave nueva aparece una vez en pantalla.

## Frontera de seguridad

`SUPABASE_SERVICE_ROLE_KEY` queda dentro del runtime de Edge Functions. El navegador usa la publishable key y un JWT de usuario; la función comprueba el rol desde Auth antes de toda acción. `verify_jwt` está activado y CORS permite el origen productivo del backoffice.
