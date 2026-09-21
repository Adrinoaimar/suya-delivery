const corsHeaders = (origin: string | null) => ({
  'Access-Control-Allow-Origin': origin ?? '',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  Vary: 'Origin',
});

function json(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
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

function finiteCoordinate(value: string | undefined, min: number, max: number): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : null;
}

function routeCoordinates(request: Request): { start: [number, number]; end: [number, number] } | null {
  const url = new URL(request.url);
  const marker = '/route/v1/driving/';
  const markerIndex = url.pathname.indexOf(marker);
  if (markerIndex < 0) return null;
  const coordinatePart = url.pathname.slice(markerIndex + marker.length);
  const pairs = coordinatePart.split(';');
  if (pairs.length !== 2) return null;
  const [startLng, startLat] = pairs[0].split(',');
  const [endLng, endLat] = pairs[1].split(',');
  const startLngValue = finiteCoordinate(startLng, -180, 180);
  const startLatValue = finiteCoordinate(startLat, -90, 90);
  const endLngValue = finiteCoordinate(endLng, -180, 180);
  const endLatValue = finiteCoordinate(endLat, -90, 90);
  if (startLngValue === null || startLatValue === null || endLngValue === null || endLatValue === null) return null;
  return { start: [startLngValue, startLatValue], end: [endLngValue, endLatValue] };
}

function distanceKm(start: [number, number], end: [number, number]): number {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const latDelta = toRadians(end[1] - start[1]);
  const lngDelta = toRadians(end[0] - start[0]);
  const latitude = toRadians((start[1] + end[1]) / 2);
  const x = lngDelta * Math.cos(latitude);
  const y = latDelta;
  return Math.sqrt(x * x + y * y) * 6371;
}

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

Deno.serve(async (request) => {
  const origin = request.headers.get('origin');
  if (!allowedOrigin(origin)) return json({ error: 'Origin no permitido.' }, 403, origin);
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(origin) });
  if (request.method !== 'GET') return json({ error: 'Método no permitido.' }, 405, origin);
  if (!supabaseUrl || !serviceRoleKey) return json({ error: 'Función no configurada.' }, 503, origin);

  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) return json({ error: 'Sesión requerida.' }, 401, origin);

  const callerResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: serviceRoleKey, Authorization: authorization },
  });
  if (!callerResponse.ok) return json({ error: 'Sesión inválida.' }, 401, origin);
  const caller = (await callerResponse.json()) as { id?: unknown; app_metadata?: { role?: unknown } };
  if (!isUuid(caller.id)) return json({ error: 'No se pudo identificar la sesión.' }, 401, origin);

  if (caller.app_metadata?.role !== 'platform_admin') {
    const riderUrl = new URL(`${supabaseUrl}/rest/v1/rider_profiles`);
    riderUrl.searchParams.set('user_id', `eq.${caller.id}`);
    riderUrl.searchParams.set('verified_at', 'not.is.null');
    riderUrl.searchParams.set('status', 'neq.suspended');
    riderUrl.searchParams.set('select', 'user_id');
    riderUrl.searchParams.set('limit', '1');
    const riderResponse = await fetch(riderUrl, { headers: serviceHeaders(serviceRoleKey) });
    if (!riderResponse.ok || (await riderResponse.json() as unknown[]).length === 0) {
      return json({ error: 'Solo un repartidor verificado puede solicitar rutas.' }, 403, origin);
    }
  }

  const coordinates = routeCoordinates(request);
  if (!coordinates) return json({ error: 'Coordenadas inválidas.' }, 400, origin);
  if (distanceKm(coordinates.start, coordinates.end) > 100) {
    return json({ error: 'La ruta supera el límite permitido.' }, 422, origin);
  }

  const upstream = new URL(
    `https://router.project-osrm.org/route/v1/driving/${coordinates.start[0]},${coordinates.start[1]};${coordinates.end[0]},${coordinates.end[1]}`,
  );
  upstream.searchParams.set('overview', 'full');
  upstream.searchParams.set('steps', 'true');
  upstream.searchParams.set('geometries', 'geojson');
  upstream.searchParams.set('alternatives', 'true');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8_000);
  try {
    const upstreamResponse = await fetch(upstream, {
      headers: { Accept: 'application/json', 'User-Agent': 'SuyaDelivery/route-proxy' },
      signal: controller.signal,
    });
    if (!upstreamResponse.ok) return json({ error: 'El motor vial no está disponible.' }, 502, origin);
    const payload = await upstreamResponse.json();
    return json(payload, 200, origin);
  } catch {
    return json({ error: 'El motor vial no respondió a tiempo.' }, 504, origin);
  } finally {
    clearTimeout(timeoutId);
  }
});
