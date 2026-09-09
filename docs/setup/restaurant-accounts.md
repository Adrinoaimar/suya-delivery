# Cuentas de restaurantes

El catálogo real de Supabase contiene cuatro restaurantes con identidad estable:

- Andá Paya (`anda-paya`)
- El Tío Jhony (`tio-jhony`)
- La Waka Fast Food (`la-waka`)
- Donde Joel (`donde-joel`)

La app local todavía muestra 13 negocios, pero los otros nueve pertenecen al catálogo demo y no
reciben cuentas reales hasta confirmar alta comercial y migrar su catálogo.

La migración `20260907090000_restaurant_account_onboarding.sql` crea un casillero administrativo
por restaurante en `public.restaurant_account_registry` y un trigger idempotente para cada alta
futura. Los cuatro quedan inicialmente en `pending_contact`; no se inventan correos, contraseñas,
tokens ni usuarios `auth.users`.

## Activación segura

1. Confirmar representante, correo corporativo y autorización de cada restaurante.
2. Un administrador de plataforma registra el correo en minúsculas y cambia el estado a
   `ready_to_invite`.
3. La Edge Function `invite-restaurant-owner` valida sesión `platform_admin`, consulta el casillero,
   usa `auth/v1/admin/invite` y marca `invited`; nunca expone `service_role` en la app ni en SQL
   público. Debe desplegarse con `SUPABASE_SERVICE_ROLE_KEY` y `ALLOWED_ORIGINS` definidos.
4. Tras aceptar y confirmar el correo, el administrador pulsa “Activar propietario”. La misma Edge
   Function busca el usuario confirmado por correo, vincula `owner_user_id` y cambia a `active`.
   El trigger crea o reactiva miembro `owner`; cambiar propietario desactiva miembro anterior.

No se crean cuentas live hasta recibir esos cuatro correos y validar identidad comercial. La pantalla
de backoffice `/restaurants` solo es visible para `platform_admin`; estados `invited` y `active` son
de solo lectura hasta completar el vínculo del propietario.

El workflow manual `Desplegar Edge Functions Supabase` publica la función cuando exista el secreto
GitHub `SUPABASE_ACCESS_TOKEN`. En configuración de la función, define `ALLOWED_ORIGINS` con los
orígenes exactos de customer, rider y backoffice; `SUPABASE_URL` y
`SUPABASE_SERVICE_ROLE_KEY` los inyecta Supabase en runtime.
