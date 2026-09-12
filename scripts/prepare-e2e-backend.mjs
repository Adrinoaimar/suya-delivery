import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL?.trim();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const email = process.env.E2E_CUSTOMER_EMAIL?.trim() || 'e2e.customer@suya.test';
const password = process.env.E2E_CUSTOMER_PASSWORD?.trim() || 'SuyaE2E!2026Local';
const adminEmail = process.env.E2E_ADMIN_EMAIL?.trim() || 'e2e.admin@suya.test';
const riderEmail = process.env.E2E_RIDER_EMAIL?.trim() || 'e2e.rider@suya.test';
const restaurantEmail = process.env.E2E_RESTAURANT_EMAIL?.trim() || 'e2e.restaurant@suya.test';

if (!url || !serviceRoleKey) {
  throw new Error('Fixture E2E rechazado: faltan VITE_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.');
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

const { data: restaurant, error: restaurantError } = await admin
  .from('restaurants')
  .select('id')
  .eq('slug', 'anda-paya')
  .maybeSingle();
if (restaurantError || !restaurant?.id) {
  throw new Error(`No se pudo localizar Andá Paya para el propietario E2E: ${restaurantError?.message ?? 'sin fila'}`);
}
const { error: memberError } = await admin
  .from('restaurant_members')
  .upsert({ restaurant_id: restaurant.id, user_id: restaurantOwner.id, role: 'owner', active: true }, { onConflict: 'restaurant_id,user_id' });
if (memberError) throw new Error(`No se pudo vincular el propietario E2E: ${memberError.message}`);

console.log(`Fixture E2E listo: cliente=${email}, admin=${adminEmail}, rider=${rider.id}, propietario=${restaurantOwner.id}`);
