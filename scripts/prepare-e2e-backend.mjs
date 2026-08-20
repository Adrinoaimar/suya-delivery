import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL?.trim();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const email = process.env.E2E_CUSTOMER_EMAIL?.trim() || 'e2e.customer@suya.test';
const password = process.env.E2E_CUSTOMER_PASSWORD?.trim() || 'SuyaE2E!2026Local';

if (!url || !serviceRoleKey) {
  throw new Error('Fixture E2E rechazado: faltan VITE_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.');
}

const admin = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: existing, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (listError) throw new Error(`No se pudo consultar el usuario E2E: ${listError.message}`);
const current = existing.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
const userResult = current
  ? await admin.auth.admin.updateUserById(current.id, {
      password,
      email_confirm: true,
      user_metadata: { display_name: 'Cliente E2E Suya' },
    })
  : await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: 'Cliente E2E Suya' },
    });
if (userResult.error || !userResult.data.user) {
  throw new Error(`No se pudo preparar el usuario E2E: ${userResult.error?.message ?? 'respuesta vacía'}`);
}

const { error: restaurantError } = await admin
  .from('restaurants')
  .update({ accepting_orders: true, address: 'Av. José de Lama 480, Sullana' })
  .eq('slug', 'anda-paya');
if (restaurantError) throw new Error(`No se pudo abrir el restaurante E2E: ${restaurantError.message}`);

console.log(`Fixture E2E listo: ${email}`);

