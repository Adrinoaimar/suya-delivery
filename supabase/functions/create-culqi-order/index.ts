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
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function validEmail(value: unknown): value is string {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) && value.trim().length <= 160;
}

function firstRow(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) return (value[0] as Record<string, unknown> | undefined) ?? null;
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : value == null ? fallback : String(value);
}

function amountCents(value: unknown): number {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Monto de pago inválido.');
  return Math.round(amount * 100);
}

function splitName(value: string): { first_name: string; last_name: string } {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  return {
    first_name: (parts.shift() ?? 'Cliente').slice(0, 80),
    last_name: (parts.join(' ') || 'Suya').slice(0, 80),
  };
}

function phone(value: string): string {
  const digits = value.replace(/\D/g, '');
  return (digits.length === 9 ? `+51${digits}` : digits ? `+${digits}` : '+51000000000').slice(0, 20);
}

function isHttpsUrl(value: unknown): value is string {
  return typeof value === 'string' && /^https:\/\/[^\s]+$/i.test(value) && value.length <= 4000;
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

  let body: {
    orderId?: unknown;
    method?: unknown;
    guestAccessToken?: unknown;
    customerEmail?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'JSON inválido.' }, 400, origin);
  }
  if (!isUuid(body.orderId)) return json({ error: 'orderId inválido.' }, 400, origin);
  if (body.method !== 'yape' && body.method !== 'card') {
    return json({ error: 'Método Culqi inválido.' }, 400, origin);
  }
  const orderId = body.orderId;
  const method = body.method;
  const guestAccessToken = typeof body.guestAccessToken === 'string' ? body.guestAccessToken : null;
  const incomingAuthorization = request.headers.get('authorization');
  const rpcAuthorization = incomingAuthorization?.startsWith('Bearer ')
    ? incomingAuthorization
    : `Bearer ${anonKey}`;

  const intentResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/create_culqi_payment_intent`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: rpcAuthorization,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      p_order_id: orderId,
      p_method: method,
      p_guest_access_token: guestAccessToken,
    }),
  });
  if (!intentResponse.ok) {
    const detail = (await intentResponse.text()).slice(0, 240);
    return json({ error: detail || 'No se pudo crear el intento Culqi.' }, 422, origin);
  }
  const intent = firstRow(await intentResponse.json());
  if (!intent) return json({ error: 'Supabase no devolvió el intento Culqi.' }, 502, origin);

  const amount = amountCents(intent.amount);
  if (amount < 600) {
    return json({ error: 'Culqi requiere un mínimo de S/ 6.00 para este flujo.' }, 422, origin);
  }
  if (method === 'yape' && amount > 50000) {
    return json({ error: 'Culqi Yape permite hasta S/ 500.00 por orden.' }, 422, origin);
  }

  const orderUrl = new URL(`${supabaseUrl}/rest/v1/orders`);
  orderUrl.searchParams.set('id', `eq.${orderId}`);
  orderUrl.searchParams.set('select', 'id,code,customer_name,customer_phone,total');
  const orderResponse = await fetch(orderUrl, { headers: serviceHeaders(serviceRoleKey) });
  if (!orderResponse.ok) return json({ error: 'No se pudo leer el pedido.' }, 502, origin);
  const orders = await orderResponse.json() as Array<Record<string, unknown>>;
  const order = orders[0];
  if (!order) return json({ error: 'Pedido no encontrado.' }, 404, origin);

  let customerEmail = validEmail(body.customerEmail) ? body.customerEmail.trim().toLowerCase() : '';
  if (!customerEmail && incomingAuthorization?.startsWith('Bearer ')) {
    const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: anonKey, Authorization: incomingAuthorization },
    });
    if (userResponse.ok) {
      const user = await userResponse.json() as { email?: unknown };
      if (validEmail(user.email)) customerEmail = user.email.trim().toLowerCase();
    }
  }
  if (!customerEmail) {
    return json({ error: 'Correo requerido para abrir el checkout seguro.' }, 422, origin);
  }

  const names = splitName(text(order.customer_name, 'Cliente Suya'));
  const expiration = Math.floor(new Date(text(intent.expires_at)).getTime() / 1000);
  if (!Number.isFinite(expiration) || expiration <= Math.floor(Date.now() / 1000)) {
    return json({ error: 'El intento de pago ya venció.' }, 409, origin);
  }
  const culqiResponse = await fetch('https://api.culqi.com/v2/orders', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${culqiSecretKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      amount,
      currency_code: 'PEN',
      description: `Suya pedido ${text(order.code, orderId.slice(0, 8))}`.slice(0, 80),
      order_number: text(intent.checkout_reference).slice(0, 36),
      expiration_date: expiration,
      client_details: {
        ...names,
        email: customerEmail,
        phone_number: phone(text(order.customer_phone)),
      },
      metadata: {
        suya_order_id: orderId,
        suya_payment_attempt_id: text(intent.attempt_id),
        suya_checkout_reference: text(intent.checkout_reference),
        suya_method: method,
      },
    }),
  });
  if (!culqiResponse.ok) {
    console.error('Culqi order creation failed', culqiResponse.status, (await culqiResponse.text()).slice(0, 300));
    await fetch(`${supabaseUrl}/rest/v1/payment_attempts?id=eq.${text(intent.attempt_id)}`, {
      method: 'PATCH',
      headers: { ...serviceHeaders(serviceRoleKey), Prefer: 'return=minimal' },
      body: JSON.stringify({ status: 'failed', failure_code: 'culqi_order_create_failed' }),
    });
    return json({ error: 'Culqi no pudo preparar el pago. Intenta nuevamente.' }, 502, origin);
  }
  const culqiOrder = await culqiResponse.json() as { id?: unknown; qr?: unknown; state?: unknown };
  const providerReference = text(culqiOrder.id);
  if (!/^ord_(?:test|live)_[A-Za-z0-9_-]+$/.test(providerReference)) {
    return json({ error: 'Culqi devolvió una orden inválida.' }, 502, origin);
  }
  const gatewayQr = isHttpsUrl(culqiOrder.qr) ? culqiOrder.qr : null;
  const updateResponse = await fetch(`${supabaseUrl}/rest/v1/payment_attempts?id=eq.${text(intent.attempt_id)}`, {
    method: 'PATCH',
    headers: { ...serviceHeaders(serviceRoleKey), Prefer: 'return=minimal' },
    body: JSON.stringify({ provider_reference: providerReference, gateway_qr_payload: gatewayQr }),
  });
  if (!updateResponse.ok) {
    console.error('Payment attempt provider reference update failed', updateResponse.status, (await updateResponse.text()).slice(0, 240));
    return json({ error: 'No se pudo vincular la orden Culqi al pedido.' }, 502, origin);
  }

  return json({
    paymentIntent: {
      attempt_id: text(intent.attempt_id),
      order_id: text(intent.order_id),
      method,
      status: text(intent.status, 'pending'),
      amount: Number(intent.amount),
      currency: 'PEN',
      checkout_reference: text(intent.checkout_reference),
      expires_at: text(intent.expires_at),
      provider: 'culqi',
      provider_reference: providerReference,
      qr_payload: gatewayQr,
    },
    gatewayOrderId: providerReference,
  }, 200, origin);
});
