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
3. Una Edge Function con `service_role` envía la invitación OAuth/Google; nunca se expone esa
   clave en la app ni en SQL público.
4. Tras el primer inicio de sesión, el administrador vincula `owner_user_id` y cambia el estado a
   `active`. Un trigger crea o reactiva el miembro `owner` de ese restaurante; cambiar propietario
   desactiva el miembro anterior.

No se crean cuentas live hasta recibir esos cuatro correos y validar identidad comercial.
