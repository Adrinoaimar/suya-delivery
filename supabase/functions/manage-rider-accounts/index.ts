import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

const allowedOrigins = new Set(['https://panel.suyadelivery.com']);
const supabaseUrl = Deno.env.get('SUPABASE_URL');
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

type Caller = { id?: string; app_metadata?: { role?: string } };
type AdminUser = { id?: string; email?: string };

function response(body: Record<string, unknown>, status: number, origin: string | null): Response {
  const headers = new Headers({ 'Content-Type': 'application/json', Vary: 'Origin', 'Cache-Control': 'no-store' });
  if (origin && allowedOrigins.has(origin)) headers.set('Access-Control-Allow-Origin', origin);
  headers.set('Access-Control-Allow-Headers', 'authorization, apikey, content-type, x-client-info');
  headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  return new Response(JSON.stringify(body), { status, headers });
}

function validUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function validEmail(value: string): boolean {
  return value.length <= 254 && /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i.test(value);
}

function validPassword(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 12 && value.length <= 128;
}

function validPhone(value: string): boolean {
  return !value || /^\+?[0-9 ()-]{6,20}$/.test(value);
}

function adminHeaders(): HeadersInit {
  return {
    apikey: serviceRoleKey ?? '',
    Authorization: `Bearer ${serviceRoleKey ?? ''}`,
    'Content-Type': 'application/json',
  };
}

async function restRequest(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(adminHeaders());
  new Headers(init.headers).forEach((value, key) => headers.set(key, value));
  return fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...init,
    headers,
  });
}

async function cleanupUser(userId: string): Promise<boolean> {
  const filters = [
    `restaurant_riders?rider_id=eq.${userId}`,
    `rider_profiles?user_id=eq.${userId}`,
    `profiles?id=eq.${userId}`,
  ];
  let cleanupSucceeded = true;
  for (const path of filters) {
    const result = await restRequest(path, { method: 'DELETE' });
    if (!result.ok) cleanupSucceeded = false;
  }
  const authDelete = await fetch(`${supabaseUrl}/auth/v1/admin/users/${userId}`, {
    method: 'DELETE',
    headers: adminHeaders(),
  });
  return cleanupSucceeded && authDelete.ok;
}

async function createRider(body: Record<string, unknown>, callerId: string, origin: string | null): Promise<Response> {
  const restaurantId = body.restaurantId;
  const email = cleanText(body.email).toLowerCase();
  const displayName = cleanText(body.displayName);
  const password = body.password;
  const phone = cleanText(body.phone);
  const vehicleType = cleanText(body.vehicleType);
  const vehicleColor = cleanText(body.vehicleColor);
  const vehiclePlate = cleanText(body.vehiclePlate).toUpperCase();

  if (!validUuid(restaurantId)) return response({ error: 'Selecciona una cuenta de restaurante válida.' }, 400, origin);
  if (!validEmail(email)) return response({ error: 'Escribe un correo válido.' }, 400, origin);
  if (displayName.length < 2 || displayName.length > 120) return response({ error: 'El nombre debe tener entre 2 y 120 caracteres.' }, 400, origin);
  if (!validPassword(password)) return response({ error: 'La clave debe tener entre 12 y 128 caracteres.' }, 400, origin);
  if (!validPhone(phone)) {
    return response({ error: 'El teléfono debe usar entre 6 y 20 caracteres permitidos.' }, 400, origin);
  }
  if (vehicleType.length > 40 || vehicleColor.length > 40 || vehiclePlate.length > 20) {
    return response({ error: 'Los datos del repartidor superan el límite permitido.' }, 400, origin);
  }

  const storeQuery = new URL(`${supabaseUrl}/rest/v1/restaurants`);
  storeQuery.searchParams.set('id', `eq.${restaurantId}`);
  storeQuery.searchParams.set('active', 'eq.true');
  storeQuery.searchParams.set('select', 'id');
  const storeCheck = await fetch(storeQuery, { headers: adminHeaders() });
  if (!storeCheck.ok) return response({ error: 'No se pudo validar la cuenta de restaurante.' }, 502, origin);
  const stores = await storeCheck.json() as Array<{ id?: string }>;
  if (!stores.some((store) => store.id === restaurantId)) return response({ error: 'La cuenta está inactiva o no existe.' }, 404, origin);

  const createResponse = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
    method: 'POST',
    headers: adminHeaders(),
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: displayName, phone, rider: true },
    }),
  });
  if (!createResponse.ok) {
    if (createResponse.status === 409 || createResponse.status === 422) {
      return response({ error: 'Ese correo ya tiene una cuenta o no puede usarse.' }, 409, origin);
    }
    return response({ error: 'Supabase no pudo crear la cuenta.' }, 502, origin);
  }
  const user = await createResponse.json() as AdminUser;
  if (!validUuid(user.id)) return response({ error: 'Supabase no devolvió una identidad válida.' }, 502, origin);

  const now = new Date().toISOString();
  const profileResponse = await restRequest('profiles?on_conflict=id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ id: user.id, display_name: displayName, phone: phone || null }),
  });
  if (!profileResponse.ok) {
    const rolledBack = await cleanupUser(user.id);
    return response({ error: rolledBack ? 'No se pudo preparar el perfil; se revirtió el alta.' : 'Falló el perfil y no se confirmó la reversión. Revisa Auth antes de reintentar.' }, 502, origin);
  }

  const riderResponse = await restRequest('rider_profiles?on_conflict=user_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({
      user_id: user.id,
      status: 'offline',
      verified_at: now,
      phone: phone || null,
      vehicle_type: vehicleType || null,
      vehicle_color: vehicleColor || null,
      vehicle_plate: vehiclePlate || null,
    }),
  });
  if (!riderResponse.ok) {
    const rolledBack = await cleanupUser(user.id);
    return response({ error: rolledBack ? 'No se pudo preparar el perfil rider; se revirtió el alta.' : 'Falló el perfil rider y no se confirmó la reversión. Revisa Auth antes de reintentar.' }, 502, origin);
  }

  const assignmentResponse = await restRequest('restaurant_riders?on_conflict=restaurant_id%2Crider_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ restaurant_id: restaurantId, rider_id: user.id, active: true, created_by: callerId }),
  });
  if (!assignmentResponse.ok) {
    const rolledBack = await cleanupUser(user.id);
    return response({ error: rolledBack ? 'No se pudo vincular el rider; se revirtió el alta.' : 'Falló el vínculo y no se confirmó la reversión. Revisa Auth antes de reintentar.' }, 502, origin);
  }

  return response({ ok: true, riderId: user.id, email, displayName }, 201, origin);
}

async function resetRiderPassword(body: Record<string, unknown>, origin: string | null): Promise<Response> {
  const restaurantId = body.restaurantId;
  const riderId = body.riderId;
  const password = body.password;
  if (!validUuid(restaurantId) || !validUuid(riderId)) return response({ error: 'Selecciona un rider y una cuenta válidos.' }, 400, origin);
  if (!validPassword(password)) return response({ error: 'La clave debe tener entre 12 y 128 caracteres.' }, 400, origin);

  const membership = new URL(`${supabaseUrl}/rest/v1/restaurant_riders`);
  membership.searchParams.set('restaurant_id', `eq.${restaurantId}`);
  membership.searchParams.set('rider_id', `eq.${riderId}`);
  membership.searchParams.set('active', 'eq.true');
  membership.searchParams.set('select', 'rider_id');
  const membershipResponse = await fetch(membership, { headers: adminHeaders() });
  if (!membershipResponse.ok) return response({ error: 'No se pudo validar la asignación del rider.' }, 502, origin);
  const assignments = await membershipResponse.json() as Array<{ rider_id?: string }>;
  if (!assignments.some((assignment) => assignment.rider_id === riderId)) {
    return response({ error: 'El rider no está activo en la cuenta seleccionada.' }, 404, origin);
  }

  const updateResponse = await fetch(`${supabaseUrl}/auth/v1/admin/users/${riderId}`, {
    method: 'PUT',
    headers: adminHeaders(),
    body: JSON.stringify({ password }),
  });
  if (!updateResponse.ok) return response({ error: 'Supabase no pudo restablecer la clave.' }, 502, origin);
  const user = await updateResponse.json() as AdminUser;
  return response({ ok: true, email: user.email ?? '' }, 200, origin);
}

Deno.serve(async (request) => {
  const origin = request.headers.get('origin');
  if (origin && !allowedOrigins.has(origin)) return response({ error: 'Origen no permitido.' }, 403, null);
  if (request.method === 'OPTIONS') return response({ ok: true }, 200, origin);
  if (request.method !== 'POST') return response({ error: 'Método no permitido.' }, 405, origin);
  if (!supabaseUrl || !serviceRoleKey) return response({ error: 'Función no configurada.' }, 503, origin);

  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) return response({ error: 'Inicia sesión como administrador.' }, 401, origin);
  const callerResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: serviceRoleKey, Authorization: authorization },
  });
  if (!callerResponse.ok) return response({ error: 'La sesión expiró; vuelve a iniciar sesión.' }, 401, origin);
  const caller = await callerResponse.json() as Caller;
  if (!validUuid(caller.id) || caller.app_metadata?.role !== 'platform_admin') {
    return response({ error: 'Solo una cuenta de plataforma puede gestionar riders.' }, 403, origin);
  }

  let body: Record<string, unknown>;
  try {
    const value: unknown = await request.json();
    if (!value || typeof value !== 'object' || Array.isArray(value)) return response({ error: 'Solicitud inválida.' }, 400, origin);
    body = value as Record<string, unknown>;
  } catch {
    return response({ error: 'Solicitud inválida.' }, 400, origin);
  }

  try {
    if (body.action === 'create') {
      return await createRider(body, caller.id, origin);
    }
    if (body.action === 'reset_password') {
      return await resetRiderPassword(body, origin);
    }
    return response({ error: 'Acción no reconocida.' }, 400, origin);
  } catch {
    return response({ error: 'No se pudo completar la gestión del rider.' }, 500, origin);
  }
});
