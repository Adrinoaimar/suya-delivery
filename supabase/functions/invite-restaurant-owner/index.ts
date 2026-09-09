const corsHeaders = (origin: string | null) => ({
  'Access-Control-Allow-Origin': origin ?? '',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Vary': 'Origin',
});

function json(body: Record<string, unknown>, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
  });
}

function allowedOrigin(origin: string | null): boolean {
  if (!origin) return true;
  const allowed = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  return allowed.includes(origin);
}

function serviceHeaders(serviceRoleKey: string): HeadersInit {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    'Content-Type': 'application/json',
  };
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

Deno.serve(async (request) => {
  const origin = request.headers.get('origin');
  if (!allowedOrigin(origin)) return json({ error: 'Origin no permitido.' }, 403, origin);
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(origin) });
  if (request.method !== 'POST') return json({ error: 'Método no permitido.' }, 405, origin);
  if (!supabaseUrl || !serviceRoleKey) return json({ error: 'Función no configurada.' }, 503, origin);

  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) return json({ error: 'Sesión requerida.' }, 401, origin);

  const callerResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: serviceRoleKey, Authorization: authorization },
  });
  if (!callerResponse.ok) return json({ error: 'Sesión inválida.' }, 401, origin);
  const caller = await callerResponse.json() as { app_metadata?: { role?: string } };
  if (caller.app_metadata?.role !== 'platform_admin') return json({ error: 'Se requiere rol platform_admin.' }, 403, origin);

  let body: { restaurantId?: unknown; action?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'JSON inválido.' }, 400, origin);
  }
  if (!isUuid(body.restaurantId)) return json({ error: 'restaurantId inválido.' }, 400, origin);
  const action = body.action === 'activate' ? 'activate' : body.action == null ? 'invite' : null;
  if (!action) return json({ error: 'Acción inválida.' }, 400, origin);

  const query = new URL(`${supabaseUrl}/rest/v1/restaurant_account_registry`);
  query.searchParams.set('restaurant_id', `eq.${body.restaurantId}`);
  query.searchParams.set('select', 'restaurant_id,account_status,contact_email,contact_name');
  const registryResponse = await fetch(query, { headers: serviceHeaders(serviceRoleKey) });
  if (!registryResponse.ok) return json({ error: 'No se pudo consultar la cuenta.' }, 502, origin);
  const rows = await registryResponse.json() as Array<{ restaurant_id?: string; account_status?: string; contact_email?: string | null; contact_name?: string | null }>;
  const account = rows[0];
  if (!account) return json({ error: 'Cuenta de restaurante no encontrada.' }, 404, origin);
  if (action === 'invite' && account.account_status !== 'ready_to_invite') return json({ error: 'La cuenta debe estar lista para invitar.' }, 409, origin);
  if (action === 'activate' && account.account_status !== 'invited') return json({ error: 'La cuenta debe tener invitación aceptada.' }, 409, origin);
  if (!account.contact_email) return json({ error: 'Falta correo de contacto.' }, 422, origin);

  if (action === 'activate') {
    const usersUrl = new URL(`${supabaseUrl}/auth/v1/admin/users`);
    usersUrl.searchParams.set('page', '1');
    usersUrl.searchParams.set('per_page', '1000');
    const usersResponse = await fetch(usersUrl, { headers: serviceHeaders(serviceRoleKey) });
    if (!usersResponse.ok) return json({ error: 'No se pudo verificar el propietario.' }, 502, origin);
    const usersPayload = await usersResponse.json() as { users?: Array<{ id?: string; email?: string; email_confirmed_at?: string | null }> };
    const owner = (usersPayload.users ?? []).find((user) => user.email?.toLowerCase() === account.contact_email?.toLowerCase());
    if (!owner?.id) return json({ error: 'El propietario aún no aceptó la invitación.' }, 409, origin);
    if (!owner.email_confirmed_at) return json({ error: 'El propietario debe confirmar su correo antes de activar.' }, 409, origin);
    const activateUrl = new URL(`${supabaseUrl}/rest/v1/restaurant_account_registry`);
    activateUrl.searchParams.set('restaurant_id', `eq.${body.restaurantId}`);
    const activateResponse = await fetch(activateUrl, {
      method: 'PATCH',
      headers: { ...serviceHeaders(serviceRoleKey), Prefer: 'return=minimal' },
      body: JSON.stringify({ account_status: 'active', owner_user_id: owner.id, activated_at: new Date().toISOString() }),
    });
    if (!activateResponse.ok) return json({ error: 'No se pudo activar la cuenta.' }, 502, origin);
    return json({ ok: true, status: 'active' }, 200, origin);
  }

  const inviteResponse = await fetch(`${supabaseUrl}/auth/v1/admin/invite`, {
    method: 'POST',
    headers: serviceHeaders(serviceRoleKey),
    body: JSON.stringify({
      email: account.contact_email,
      data: { display_name: account.contact_name ?? '', restaurant_id: body.restaurantId },
    }),
  });
  if (!inviteResponse.ok) {
    const detail = await inviteResponse.text();
    console.error('Supabase invite failed', inviteResponse.status, detail.slice(0, 300));
    return json({ error: 'Supabase rechazó la invitación.' }, inviteResponse.status === 422 ? 409 : 502, origin);
  }

  const updateUrl = new URL(`${supabaseUrl}/rest/v1/restaurant_account_registry`);
  updateUrl.searchParams.set('restaurant_id', `eq.${body.restaurantId}`);
  const updateResponse = await fetch(updateUrl, {
    method: 'PATCH',
    headers: { ...serviceHeaders(serviceRoleKey), Prefer: 'return=minimal' },
    body: JSON.stringify({ account_status: 'invited', invited_at: new Date().toISOString() }),
  });
  if (!updateResponse.ok) {
    console.error('Registry status update failed', updateResponse.status, (await updateResponse.text()).slice(0, 300));
    return json({ error: 'Invitación enviada, pero estado no actualizado.' }, 502, origin);
  }
  return json({ ok: true, status: 'invited' }, 200, origin);
});
