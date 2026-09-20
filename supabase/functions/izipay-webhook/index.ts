function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : value == null ? fallback : String(value);
}

function constantTimeEqual(left: string, right: string): boolean {
  const length = Math.max(left.length, right.length);
  let mismatch = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) {
    mismatch |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return mismatch === 0;
}

async function hmacBase64(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  let binary = '';
  for (const byte of new Uint8Array(digest)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const hashKey = Deno.env.get('IZIPAY_HASH_KEY');

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json({ error: 'Método no permitido.' }, 405);
  if (!supabaseUrl || !serviceRoleKey || !hashKey) return json({ error: 'Webhook Izipay no configurado.' }, 503);

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return json({ error: 'JSON inválido.' }, 400);
  }

  const transactionId = text(request.headers.get('transactionId') || body.transactionId);
  const payloadHttp = text(body.payloadHttp);
  const signature = text(body.signature || request.headers.get('signature') || request.headers.get('Signature'));
  if (!/^SUYA[A-Z0-9]{28}$/.test(transactionId) || !payloadHttp || !signature) {
    return json({ error: 'Notificación Izipay incompleta.' }, 400);
  }

  const code = text(body.code).toUpperCase();
  if (code !== '021' && code !== 'COMMUNICATION_ERROR') {
    const expected = await hmacBase64(payloadHttp, hashKey);
    if (!constantTimeEqual(expected, signature)) return json({ error: 'Firma Izipay inválida.' }, 401);
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(payloadHttp) as Record<string, unknown>;
  } catch {
    return json({ error: 'payloadHttp inválido.' }, 400);
  }
  if (text(payload.transactionId) && text(payload.transactionId) !== transactionId) {
    return json({ error: 'transactionId inconsistente.' }, 422);
  }

  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/apply_izipay_webhook`, {
    method: 'POST',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_transaction_id: transactionId, p_payload: payload }),
  });
  if (!response.ok) {
    console.error('Izipay webhook persistence failed', response.status);
    return json({ error: 'No se pudo registrar la notificación Izipay.' }, 502);
  }
  const result = await response.json().catch(() => []);
  return json({ received: true, status: Array.isArray(result) ? result[0]?.payment_status ?? null : null });
});
