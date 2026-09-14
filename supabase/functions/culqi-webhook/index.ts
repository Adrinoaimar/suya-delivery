function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : value == null ? fallback : String(value);
}

function serviceHeaders(serviceRoleKey: string): HeadersInit {
  return { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, 'Content-Type': 'application/json' };
}

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const culqiSecretKey = Deno.env.get('CULQI_SECRET_KEY');

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json({ error: 'Método no permitido.' }, 405);
  if (!supabaseUrl || !serviceRoleKey || !culqiSecretKey) return json({ error: 'Webhook no configurado.' }, 503);

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
    await fetch(`${supabaseUrl}/rest/v1/payment_attempts?id=eq.${attempt.id}&status=eq.pending`, {
      method: 'PATCH', headers: { ...serviceHeaders(serviceRoleKey), Prefer: 'return=minimal' },
      body: JSON.stringify({ status: 'failed', failure_code: 'culqi_amount_mismatch' }),
    });
    return json({ error: 'Monto Culqi inconsistente.' }, 422);
  }

  const state = text(providerOrder.state).toLowerCase();
  if (state === 'paid') {
    await fetch(`${supabaseUrl}/rest/v1/payment_attempts?id=eq.${attempt.id}&status=eq.pending`, {
      method: 'PATCH', headers: { ...serviceHeaders(serviceRoleKey), Prefer: 'return=minimal' },
      body: JSON.stringify({ status: 'authorized' }),
    });
  } else if (['expired', 'deleted', 'failed'].includes(state)) {
    await fetch(`${supabaseUrl}/rest/v1/payment_attempts?id=eq.${attempt.id}&status=eq.pending`, {
      method: 'PATCH', headers: { ...serviceHeaders(serviceRoleKey), Prefer: 'return=minimal' },
      body: JSON.stringify({ status: 'failed', failure_code: `culqi_order_${state}` }),
    });
  }
  return json({ received: true });
});
