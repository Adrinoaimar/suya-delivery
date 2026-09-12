import { createClient } from '@supabase/supabase-js';
import { execFileSync } from 'node:child_process';

const url = process.env.VITE_SUPABASE_URL?.trim();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const databaseUrl = process.env.SUPABASE_DB_URL?.trim();
const email = process.env.E2E_CUSTOMER_EMAIL?.trim() || 'e2e.customer@suya.test';
const password = process.env.E2E_CUSTOMER_PASSWORD?.trim() || 'SuyaE2E!2026Local';
const adminEmail = process.env.E2E_ADMIN_EMAIL?.trim() || 'e2e.admin@suya.test';
const riderEmail = process.env.E2E_RIDER_EMAIL?.trim() || 'e2e.rider@suya.test';
const restaurantEmail = process.env.E2E_RESTAURANT_EMAIL?.trim() || 'e2e.restaurant@suya.test';

if (!url || !serviceRoleKey || !databaseUrl) {
  throw new Error('Fixture E2E rechazado: faltan VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY o SUPABASE_DB_URL.');
}

const admin = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: existing, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (listError) throw new Error(`No se pudo consultar el usuario E2E: ${listError.message}`);
async function ensureUser(targetEmail, displayName, appMetadata = {}) {
  const current = existing.users.find((user) => user.email?.toLowerCase() === targetEmail.toLowerCase());
  const result = current
    ? await admin.auth.admin.updateUserById(current.id, {
        password,
        email_confirm: true,
        user_metadata: { display_name: displayName },
        app_metadata: appMetadata,
      })
    : await admin.auth.admin.createUser({
        email: targetEmail,
        password,
        email_confirm: true,
        user_metadata: { display_name: displayName },
        app_metadata: appMetadata,
      });
  if (result.error || !result.data.user) {
    throw new Error(`No se pudo preparar ${targetEmail}: ${result.error?.message ?? 'respuesta vacía'}`);
  }
  return result.data.user;
}

await ensureUser(email, 'Cliente E2E Suya');
await ensureUser(adminEmail, 'Operaciones E2E Suya', { role: 'platform_admin' });
const rider = await ensureUser(riderEmail, 'Repartidor E2E Suya');
const restaurantOwner = await ensureUser(restaurantEmail, 'Propietario E2E Suya');
if (!/^[0-9a-f-]{36}$/iu.test(restaurantOwner.id)) {
  throw new Error('Fixture E2E rechazado: Auth devolvió un UUID de propietario inválido.');
}
const ownerId = restaurantOwner.id;

try {
  const verification = execFileSync('psql', [
    databaseUrl,
    '-v',
    'ON_ERROR_STOP=1',
    '-qAt',
    '-c',
    `
      with target as (
        select id from public.restaurants where slug = 'anda-paya'
      )
      insert into public.restaurant_members (restaurant_id, user_id, role, active)
      select id, '${ownerId}'::uuid, 'owner'::public.restaurant_role, true
      from target
      on conflict (restaurant_id, user_id)
      do update set role = excluded.role, active = excluded.active;

      update public.restaurant_account_registry
      set owner_user_id = '${ownerId}'::uuid, account_status = 'active'
      where restaurant_id = (select id from public.restaurants where slug = 'anda-paya');

      select count(*)
      from public.restaurant_members rm
      join public.restaurants r on r.id = rm.restaurant_id
      where r.slug = 'anda-paya' and rm.user_id = '${ownerId}'::uuid and rm.role = 'owner' and rm.active;
    `,
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (verification.trim().split(/\s+/u).at(-1) !== '1') {
    throw new Error('la consulta de verificación no encontró la membresía owner');
  }
} catch (error) {
  const detail = error?.stderr?.toString().trim() || error?.message || 'error desconocido';
  throw new Error(`No se pudo preparar el propietario E2E en la base local: ${detail}`);
}

console.log(`Fixture E2E listo: cliente=${email}, admin=${adminEmail}, rider=${rider.id}, propietario=${restaurantOwner.id}`);
