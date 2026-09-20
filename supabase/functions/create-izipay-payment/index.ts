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

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : value == null ? fallback : String(value);
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function firstRow(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) return (value[0] as Record<string, unknown> | undefined) ?? null;
  return value && typeof value === 'object' ? value as Record<string, unknown> : null;
}

function allowedOrigin(origin: string | null): boolean {
  if (!origin) return true;
  return (Deno.env.get('ALLOWED_ORIGINS') ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .includes(origin);
}

function serviceHeaders(key: string): HeadersInit {
  return { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
}

function safeEmail(value: unknown): string {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 160 ? email : '';
}

function splitName(value: string): { firstName: string; lastName: string } {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  return {
    firstName: (parts.shift() ?? 'Cliente').slice(0, 80),
    lastName: (parts.join(' ') || 'Suya').slice(0, 80),
  };
}

function phone(value: string): string {
  const digits = value.replace(/\D/g, '');
  return (digits.length === 9 ? `+51${digits}` : digits ? `+${digits}` : '+51000000000').slice(0, 20);
}

function sessionToken(value: unknown): string {
  const row = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const response = row.response && typeof row.response === 'object'
    ? row.response as Record<string, unknown>
    : {};
  return text(response.token ?? row.token);
}

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const merchantCode = Deno.env.get('IZIPAY_MERCHANT_CODE');
const publicKey = Deno.env.get('IZIPAY_PUBLIC_KEY');
const keyRSA = Deno.env.get('IZIPAY_KEY_RSA') || publicKey;
const tokenUrl = Deno.env.get('IZIPAY_TOKEN_URL')
  || (Deno.env.get('IZIPAY_ENVIRONMENT') === 'production'
    ? 'https://api-pw.izipay.pe/security/v1/Token/Generate'
    : 'https://sandbox-api-pw.izipay.pe/security/v1/Token/Generate');
const webhookUrl = Deno.env.get('IZIPAY_WEBHOOK_URL')
  || (supabaseUrl ? `${supabaseUrl}/functions/v1/izipay-webhook` : '');

Deno.serve(async (request) => {
  const origin = request.headers.get('origin');
  if (!allowedOrigin(origin)) return json({ error: 'Origin no permitido.' }, 403, origin);
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(origin) });
  if (request.method !== 'POST') return json({ error: 'Método no permitido.' }, 405, origin);
  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey || !merchantCode || !publicKey || !keyRSA || !webhookUrl) {
    return json({ error: 'Izipay no está configurado en el servidor.' }, 503, origin);
  }
  try {
    const parsedWebhookUrl = new URL(webhookUrl);
    if (parsedWebhookUrl.protocol !== 'https:') throw new Error('Webhook inseguro');
  } catch {
    return json({ error: 'La URL del webhook Izipay no es válida.' }, 503, origin);
  }

  let body: { orderId?: unknown; guestAccessToken?: unknown; customerEmail?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'JSON inválido.' }, 400, origin);
  }
  if (!isUuid(body.orderId)) return json({ error: 'orderId inválido.' }, 400, origin);

  const incomingAuthorization = request.headers.get('authorization');
  const rpcAuthorization = incomingAuthorization?.startsWith('Bearer ')
    ? incomingAuthorization
    : `Bearer ${supabaseAnonKey}`;
  const guestAccessToken = typeof body.guestAccessToken === 'string' ? body.guestAccessToken : null;

  const intentResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/create_izipay_payment_intent`, {
    method: 'POST',
    headers: { apikey: supabaseAnonKey, Authorization: rpcAuthorization, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_order_id: body.orderId, p_guest_access_token: guestAccessToken }),
  });
  if (!intentResponse.ok) {
    const detail = (await intentResponse.text()).slice(0, 240);
    return json({ error: detail || 'No se pudo crear el intento Izipay.' }, 422, origin);
  }
  const intent = firstRow(await intentResponse.json());
  if (!intent) return json({ error: 'Supabase no devolvió el intento Izipay.' }, 502, origin);

  const transactionId = text(intent.provider_reference);
  const amount = Number(intent.amount);
  if (!/^SUYA[A-Z0-9]{28}$/.test(transactionId) || !Number.isFinite(amount) || amount <= 0) {
    return json({ error: 'Intento Izipay inconsistente.' }, 502, origin);
  }
  const expiration = Date.parse(text(intent.expires_at));
  if (!Number.isFinite(expiration) || expiration <= Date.now()) {
    return json({ error: 'El intento de pago ya venció.' }, 409, origin);
  }

  const orderUrl = new URL(`${supabaseUrl}/rest/v1/orders`);
  orderUrl.searchParams.set('id', `eq.${body.orderId}`);
  orderUrl.searchParams.set('select', 'id,code,customer_name,customer_phone,delivery_address');
  const orderResponse = await fetch(orderUrl, { headers: serviceHeaders(supabaseServiceRoleKey) });
  if (!orderResponse.ok) return json({ error: 'No se pudo leer el pedido.' }, 502, origin);
  const order = (await orderResponse.json() as Array<Record<string, unknown>>)[0];
  if (!order) return json({ error: 'Pedido no encontrado.' }, 404, origin);

  const names = splitName(text(order.customer_name, 'Cliente Suya'));
  const customerEmail = safeEmail(body.customerEmail) || 'pagos@suyadelivery.com';
  const orderNumber = text(intent.checkout_reference).slice(0, 36);
  const tokenResponse = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', transactionId: transactionId },
    body: JSON.stringify({
      requestSource: 'ECOMMERCE',
      merchantCode,
      orderNumber,
      publicKey,
      amount: amount.toFixed(2),
    }),
  });
  if (!tokenResponse.ok) {
    console.error('Izipay token request failed', tokenResponse.status);
    return json({ error: 'Izipay no pudo preparar el checkout. Verifica credenciales y ambiente.' }, 502, origin);
  }
  const token = sessionToken(await tokenResponse.json());
  if (!token || token.length > 12000) {
    return json({ error: 'Izipay devolvió un token inválido.' }, 502, origin);
  }

  return json({
    paymentIntent: {
      attempt_id: text(intent.attempt_id),
      order_id: text(intent.order_id),
      method: 'yape',
      status: text(intent.status, 'pending'),
      amount,
      currency: 'PEN',
      checkout_reference: text(intent.checkout_reference),
      expires_at: text(intent.expires_at),
      provider: 'izipay',
      provider_reference: transactionId,
      qr_payload: null,
    },
    izipaySession: {
      authorization: token,
      keyRSA,
      transactionId,
      merchantCode,
      orderNumber,
      urlIPN: webhookUrl,
      order: {
        orderNumber,
        currency: 'PEN',
        amount: amount.toFixed(2),
        processType: 'AT',
        merchantBuyerId: text(order.id),
        dateTimeTransaction: new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14),
        payMethod: 'QR',
      },
      billing: {
        firstName: names.firstName,
        lastName: names.lastName,
        email: customerEmail,
        phoneNumber: phone(text(order.customer_phone)),
        street: text(order.delivery_address, 'Sullana'),
        city: 'Sullana',
        state: 'Piura',
        country: 'PE',
        postalCode: '20101',
        documentType: 'DNI',
        document: '00000000',
      },
    },
  }, 200, origin);
});
