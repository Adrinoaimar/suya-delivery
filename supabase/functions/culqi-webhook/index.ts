function json(body: Record<string, unknown>, status = 200, extraHeaders: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  });
}

function unauthorized(): Response {
  return json(
    { error: 'Autenticación del webhook requerida.' },
    401,
    { 'WWW-Authenticate': 'Basic realm="suya-culqi-webhook"' },
  );
}

function safeEqual(left: string, right: string): boolean {
  const length = Math.max(left.length, right.length);
  let mismatch = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) {
    const leftCode = index < left.length ? left.charCodeAt(index) : 0;
    const rightCode = index < right.length ? right.charCodeAt(index) : 0;
    mismatch |= leftCode ^ rightCode;
  }
  return mismatch === 0;
}

function hasValidBasicAuth(request: Request, username: string, password: string): boolean {
  const header = request.headers.get('authorization') ?? '';
  if (!/^Basic\s+/i.test(header)) return false;
  let decoded: string;
  try {
    decoded = atob(header.replace(/^Basic\s+/i, '').trim());
  } catch {
    return false;
  }
  const separator = decoded.indexOf(':');
  if (separator < 0) return false;
  return safeEqual(decoded.slice(0, separator), username)
    && safeEqual(decoded.slice(separator + 1), password);
}

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : value == null ? fallback : String(value);
}

function serviceHeaders(serviceRoleKey: string): HeadersInit {
  return { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, 'Content-Type': 'application/json' };
}

async function updateAttempt(
  supabaseUrl: string,
  serviceRoleKey: string,
  attemptId: string,
  patch: Record<string, unknown>,
): Promise<boolean> {
  const response = await fetch(`${supabaseUrl}/rest/v1/payment_attempts?id=eq.${encodeURIComponent(attemptId)}&status=eq.pending`, {
    method: 'PATCH',
    headers: { ...serviceHeaders(serviceRoleKey), Prefer: 'return=minimal' },
    body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
  });
  if (response.ok) return true;
  console.error('Payment attempt webhook update failed', response.status);
  return false;
}

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const culqiSecretKey = Deno.env.get('CULQI_SECRET_KEY');
const webhookUsername = Deno.env.get('CULQI_WEBHOOK_USERNAME');
const webhookPassword = Deno.env.get('CULQI_WEBHOOK_PASSWORD');

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json({ error: 'Método no permitido.' }, 405);
  if (!supabaseUrl || !serviceRoleKey || !culqiSecretKey || !webhookUsername || !webhookPassword) {
    return json({ error: 'Webhook no configurado.' }, 503);
  }
  if (!hasValidBasicAuth(request, webhookUsername, webhookPassword)) return unauthorized();

  let event: { type?: unknown; data?: unknown };
  try { event = await request.json(); } catch { return json({ error: 'JSON inválido.' }, 400); }
  if (event.type !== 'order.status.changed') return json({ received: true });

  let eventData: Record<string, unknown> = {};
  if (typeof event.data === 'string') {
    try { eventData = JSON.parse(event.data) as Record<string, unknown>; } catch { return json({ error: 'Evento inválido.' }, 400); }
  } else if (event.data && typeof event.data === 'object') {
    eventData = event.data as Record<string, unknown>;
  }
  if (eventData.object && typeof eventData.object === 'object') {
    eventData = eventData.object as Record<string, unknown>;
  }
  const providerReference = text(eventData.id);
  if (!/^ord_(?:test|live)_[A-Za-z0-9_-]+$/.test(providerReference)) return json({ received: true });

  const providerUrl = `https://api.culqi.com/v2/orders/${encodeURIComponent(providerReference)}`;
  const providerResponse = await fetch(providerUrl, { headers: { Authorization: `Bearer ${culqiSecretKey}` } });
  if (!providerResponse.ok) return json({ error: 'No se pudo verificar la orden Culqi.' }, 502);
  const providerOrder = await providerResponse.json() as { id?: unknown; state?: unknown; amount?: unknown; currency_code?: unknown };
  if (text(providerOrder.id) !== providerReference || providerOrder.currency_code !== 'PEN') {
    return json({ error: 'Orden Culqi inconsistente.' }, 422);
  }

  const attemptsUrl = new URL(`${supabaseUrl}/rest/v1/payment_attempts`);
  attemptsUrl.searchParams.set('provider', 'eq.culqi');
  attemptsUrl.searchParams.set('provider_reference', `eq.${providerReference}`);
  attemptsUrl.searchParams.set('select', 'id,amount,status');
  const attemptsResponse = await fetch(attemptsUrl, { headers: serviceHeaders(serviceRoleKey) });
  if (!attemptsResponse.ok) return json({ error: 'No se pudo localizar el intento.' }, 502);
  const attempts = await attemptsResponse.json() as Array<{ id?: string; amount?: number | string; status?: string }>;
  const attempt = attempts[0];
  if (!attempt?.id) return json({ received: true });
  if (Math.round(Number(attempt.amount) * 100) !== Number(providerOrder.amount)) {
    const updated = await updateAttempt(supabaseUrl, serviceRoleKey, attempt.id, {
      status: 'failed',
      failure_code: 'culqi_amount_mismatch',
    });
    if (!updated) return json({ error: 'No se pudo registrar la inconsistencia de monto.' }, 502);
    return json({ error: 'Monto Culqi inconsistente.' }, 422);
  }

  const state = text(providerOrder.state).toLowerCase();
  if (state === 'paid') {
    const updated = await updateAttempt(supabaseUrl, serviceRoleKey, attempt.id, {
      status: 'authorized',
      failure_code: null,
    });
    if (!updated) return json({ error: 'No se pudo registrar la autorización Culqi.' }, 502);
  } else if (['expired', 'deleted', 'failed'].includes(state)) {
    const updated = await updateAttempt(supabaseUrl, serviceRoleKey, attempt.id, {
      status: 'failed',
      failure_code: `culqi_order_${state}`,
    });
    if (!updated) return json({ error: 'No se pudo registrar el estado final de Culqi.' }, 502);
  }
  return json({ received: true });
});
