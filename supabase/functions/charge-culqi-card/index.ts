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
    .split(',').map((value) => value.trim()).filter(Boolean);
  return allowed.includes(origin);
}

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : value == null ? fallback : String(value);
}

function validEmail(value: unknown): value is string {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) && value.trim().length <= 160;
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function serviceHeaders(serviceRoleKey: string): HeadersInit {
  return { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, 'Content-Type': 'application/json' };
}

function splitName(value: string): { first_name: string; last_name: string } {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  return { first_name: (parts.shift() ?? 'Cliente').slice(0, 80), last_name: (parts.join(' ') || 'Suya').slice(0, 80) };
}

function phone(value: string): string {
  const digits = value.replace(/\D/g, '');
  return (digits.length === 9 ? `+51${digits}` : digits ? `+${digits}` : '+51000000000').slice(0, 20);
}

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const culqiSecretKey = Deno.env.get('CULQI_SECRET_KEY');

Deno.serve(async (request) => {
  const origin = request.headers.get('origin');
  if (!allowedOrigin(origin)) return json({ error: 'Origin no permitido.' }, 403, origin);
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(origin) });
  if (request.method !== 'POST') return json({ error: 'Método no permitido.' }, 405, origin);
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !culqiSecretKey) {
    return json({ error: 'Pasarela Culqi no configurada en el servidor.' }, 503, origin);
  }

  let body: { attemptId?: unknown; tokenId?: unknown; guestAccessToken?: unknown; customerEmail?: unknown };
  try { body = await request.json(); } catch { return json({ error: 'JSON inválido.' }, 400, origin); }
  if (!isUuid(body.attemptId)) return json({ error: 'attemptId inválido.' }, 400, origin);
  if (typeof body.tokenId !== 'string' || !/^tkn_(?:test|live)_[A-Za-z0-9_-]+$/.test(body.tokenId)) {
    return json({ error: 'Token Culqi inválido.' }, 400, origin);
  }
  const incomingAuthorization = request.headers.get('authorization');
  const rpcAuthorization = incomingAuthorization?.startsWith('Bearer ')
    ? incomingAuthorization : `Bearer ${anonKey}`;
  const guestAccessToken = typeof body.guestAccessToken === 'string' ? body.guestAccessToken : null;

  const contextResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/get_culqi_card_payment_context`, {
    method: 'POST',
    headers: { apikey: anonKey, Authorization: rpcAuthorization, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_payment_attempt_id: body.attemptId, p_guest_access_token: guestAccessToken }),
  });
  if (!contextResponse.ok) return json({ error: 'No se pudo validar el intento de tarjeta.' }, 422, origin);
  const contexts = await contextResponse.json() as Array<Record<string, unknown>>;
  const context = contexts[0];
  if (!context) return json({ error: 'El intento de tarjeta no está disponible.' }, 404, origin);

  let customerEmail = validEmail(body.customerEmail) ? body.customerEmail.trim().toLowerCase() : '';
  if (!customerEmail && incomingAuthorization?.startsWith('Bearer ')) {
    const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: { apikey: anonKey, Authorization: incomingAuthorization } });
    if (userResponse.ok) {
      const user = await userResponse.json() as { email?: unknown };
      if (validEmail(user.email)) customerEmail = user.email.trim().toLowerCase();
    }
  }
  if (!customerEmail) return json({ error: 'Correo requerido para procesar tarjeta.' }, 422, origin);

  const names = splitName(text(context.customer_name, 'Cliente Suya'));
  const amount = Math.round(Number(context.amount) * 100);
  if (!Number.isFinite(amount) || amount < 100) return json({ error: 'Monto de tarjeta inválido.' }, 422, origin);

  const chargeResponse = await fetch('https://api.culqi.com/v2/charges', {
    method: 'POST',
    headers: { Authorization: `Bearer ${culqiSecretKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      amount,
      currency_code: 'PEN',
      email: customerEmail,
      source_id: body.tokenId,
      capture: true,
      description: `Suya pedido ${text(context.order_code, 'pago')}`.slice(0, 80),
      metadata: { suya_order_id: text(context.order_id), suya_payment_attempt_id: text(context.attempt_id) },
      antifraud_details: {
        ...names,
        phone_number: phone(text(context.customer_phone)),
        country_code: 'PE',
      },
    }),
  });
  if (!chargeResponse.ok) {
    console.error('Culqi card charge failed', chargeResponse.status, (await chargeResponse.text()).slice(0, 300));
    await fetch(`${supabaseUrl}/rest/v1/payment_attempts?id=eq.${text(context.attempt_id)}`, {
      method: 'PATCH', headers: { ...serviceHeaders(serviceRoleKey), Prefer: 'return=minimal' },
      body: JSON.stringify({ status: 'failed', failure_code: 'culqi_card_charge_failed' }),
    });
    return json({ error: 'Culqi rechazó la tarjeta. Revisa los datos e intenta nuevamente.' }, 402, origin);
  }
  const charge = await chargeResponse.json() as { id?: unknown; object?: unknown; outcome?: unknown };
  const providerReference = text(charge.id);
  if (!/^chr_(?:test|live)_[A-Za-z0-9_-]+$/.test(providerReference)) {
    return json({ error: 'Culqi devolvió un cargo inválido.' }, 502, origin);
  }

  const authorizeResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/authorize_culqi_card_payment`, {
    method: 'POST',
    headers: { apikey: anonKey, Authorization: rpcAuthorization, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      p_payment_attempt_id: context.attempt_id,
      p_provider_reference: providerReference,
      p_guest_access_token: guestAccessToken,
    }),
  });
  if (!authorizeResponse.ok) {
    // Charge succeeded after the identity check. Keep an auditable server-side fallback.
    const fallback = await fetch(`${supabaseUrl}/rest/v1/payment_attempts?id=eq.${text(context.attempt_id)}&status=eq.pending`, {
      method: 'PATCH', headers: { ...serviceHeaders(serviceRoleKey), Prefer: 'return=minimal' },
      body: JSON.stringify({ status: 'authorized', provider_reference: providerReference }),
    });
    if (!fallback.ok) return json({ error: 'Cobro exitoso; conciliación pendiente en back office.' }, 502, origin);
  }
  return json({ status: 'authorized', providerReference }, 200, origin);
});
