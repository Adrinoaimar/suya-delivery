const corsHeaders = (origin: string | null) => ({
  'Access-Control-Allow-Origin': origin ?? '',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  Vary: 'Origin',
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
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function validEmail(value: string): boolean {
  return /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i.test(
    value,
  );
}

function validPhone(value: string): boolean {
  return !value || /^\+?[0-9 ()-]{6,20}$/.test(value);
}

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

Deno.serve(async (request) => {
  const origin = request.headers.get('origin');
  if (!allowedOrigin(origin)) return json({ error: 'Origin no permitido.' }, 403, origin);
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(origin) });
  if (request.method !== 'POST') return json({ error: 'Método no permitido.' }, 405, origin);
  if (!supabaseUrl || !serviceRoleKey)
    return json({ error: 'Función no configurada.' }, 503, origin);

  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer '))
    return json({ error: 'Sesión requerida.' }, 401, origin);

  const callerResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: serviceRoleKey, Authorization: authorization },
  });
  if (!callerResponse.ok) return json({ error: 'Sesión inválida.' }, 401, origin);
  const caller = (await callerResponse.json()) as { id?: string; app_metadata?: { role?: string } };
  if (!isUuid(caller.id)) return json({ error: 'No se pudo identificar la sesión.' }, 401, origin);

  let body: {
    restaurantId?: unknown;
    email?: unknown;
    displayName?: unknown;
    phone?: unknown;
    vehicleType?: unknown;
    vehicleColor?: unknown;
    vehiclePlate?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'JSON inválido.' }, 400, origin);
  }

  if (!isUuid(body.restaurantId)) return json({ error: 'restaurantId inválido.' }, 400, origin);
  const email = text(body.email).toLowerCase();
  const displayName = text(body.displayName);
  const phone = text(body.phone);
  const vehicleType = text(body.vehicleType);
  const vehicleColor = text(body.vehicleColor);
  const vehiclePlate = text(body.vehiclePlate).toUpperCase();
  if (!validEmail(email)) return json({ error: 'Escribe un correo válido.' }, 400, origin);
  if (displayName.length < 2 || displayName.length > 120)
    return json({ error: 'El nombre debe tener entre 2 y 120 caracteres.' }, 400, origin);
  if (!validPhone(phone))
    return json({ error: 'El teléfono no tiene un formato válido.' }, 400, origin);
  if (
    phone.length > 20 ||
    vehicleType.length > 40 ||
    vehicleColor.length > 40 ||
    vehiclePlate.length > 20
  ) {
    return json({ error: 'Los datos del repartidor superan el límite permitido.' }, 400, origin);
  }

  const isPlatformAdmin = caller.app_metadata?.role === 'platform_admin';
  if (!isPlatformAdmin) {
    const membershipQuery = new URL(`${supabaseUrl}/rest/v1/restaurant_members`);
    membershipQuery.searchParams.set('restaurant_id', `eq.${body.restaurantId}`);
    membershipQuery.searchParams.set('user_id', `eq.${caller.id}`);
    membershipQuery.searchParams.set('active', 'eq.true');
    membershipQuery.searchParams.set('role', 'in.(owner,manager)');
    membershipQuery.searchParams.set('select', 'user_id');
    const membershipResponse = await fetch(membershipQuery, {
      headers: serviceHeaders(serviceRoleKey),
    });
    if (!membershipResponse.ok)
      return json({ error: 'No se pudo verificar el alcance de la cuenta.' }, 502, origin);
    const memberships = (await membershipResponse.json()) as Array<{ user_id?: string }>;
    if (memberships.length === 0)
      return json({ error: 'No tienes permisos para gestionar este restaurante.' }, 403, origin);
  }

  let riderId: string | undefined;
  let existingRider = false;
  const usersUrl = new URL(`${supabaseUrl}/auth/v1/admin/users`);
  usersUrl.searchParams.set('page', '1');
  usersUrl.searchParams.set('per_page', '1000');
  const usersResponse = await fetch(usersUrl, { headers: serviceHeaders(serviceRoleKey) });
  if (!usersResponse.ok) return json({ error: 'No se pudo verificar el correo.' }, 502, origin);
  const usersPayload = await usersResponse.json() as { users?: Array<{ id?: string; email?: string }> };
  const existingUser = (usersPayload.users ?? []).find((user) => user.email?.toLowerCase() === email);
  if (existingUser?.id) {
    const profileQuery = new URL(`${supabaseUrl}/rest/v1/rider_profiles`);
    profileQuery.searchParams.set('user_id', `eq.${existingUser.id}`);
    profileQuery.searchParams.set('select', 'user_id');
    const profileLookup = await fetch(profileQuery, { headers: serviceHeaders(serviceRoleKey) });
    if (!profileLookup.ok) return json({ error: 'No se pudo verificar el perfil de repartidor.' }, 502, origin);
    const profiles = await profileLookup.json() as Array<{ user_id?: string }>;
    if (profiles.length === 0) return json({ error: 'El correo ya está registrado y no tiene un perfil de repartidor.' }, 409, origin);
    riderId = existingUser.id;
    existingRider = true;
  } else {
    const inviteResponse = await fetch(`${supabaseUrl}/auth/v1/admin/invite`, {
      method: 'POST',
      headers: serviceHeaders(serviceRoleKey),
      body: JSON.stringify({ email, data: { display_name: displayName, phone, rider: true } }),
    });
    if (!inviteResponse.ok) {
      if (inviteResponse.status === 422 || inviteResponse.status === 409) {
        return json({ error: 'No se pudo invitar: el correo puede estar registrado o no ser válido.' }, 409, origin);
      }
      return json({ error: 'No se pudo crear la invitación.' }, 502, origin);
    }
    const invitePayload = await inviteResponse.json() as { id?: string; user?: { id?: string } };
    riderId = invitePayload.user?.id ?? invitePayload.id;
  }
  if (!isUuid(riderId)) return json({ error: 'No se pudo obtener una identidad válida de repartidor.' }, 502, origin);

  if (!existingRider) {
    const profileResponse = await fetch(`${supabaseUrl}/rest/v1/rider_profiles`, {
      method: 'POST',
      headers: {
        ...serviceHeaders(serviceRoleKey),
        Prefer: 'resolution=merge-duplicates,return=representation',
      },
      body: JSON.stringify({
        user_id: riderId,
        status: 'offline',
        verified_at: new Date().toISOString(),
        phone: phone || null,
        vehicle_type: vehicleType || null,
        vehicle_color: vehicleColor || null,
        vehicle_plate: vehiclePlate || null,
      }),
    });
    if (!profileResponse.ok)
      return json(
        { error: 'La invitación se creó, pero no se pudo preparar el perfil operativo.' },
        502,
        origin,
      );
  }

  const assignmentResponse = await fetch(`${supabaseUrl}/rest/v1/restaurant_riders?on_conflict=restaurant_id%2Crider_id`, {
    method: 'POST',
    headers: {
      ...serviceHeaders(serviceRoleKey),
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify({
      restaurant_id: body.restaurantId,
      rider_id: riderId,
      active: true,
      created_by: caller.id,
    }),
  });
  if (!assignmentResponse.ok)
    return json(
      { error: 'La invitación se creó, pero no se pudo vincular al restaurante.' },
      502,
      origin,
    );

  return json({ ok: true, riderId, email, displayName, existing: existingRider }, 200, origin);
});
