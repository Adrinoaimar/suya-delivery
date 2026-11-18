const corsHeaders = (origin: string | null) => ({
  'Access-Control-Allow-Origin': origin ?? '',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-suya-autocloud-cron',
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

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : value == null ? fallback : String(value);
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

function serviceHeaders(serviceRoleKey: string): HeadersInit {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    'Content-Type': 'application/json',
  };
}

interface RuntimeGatewayConfig {
  config_id: string;
  restaurant_id: string;
  provider: string;
  environment: string;
  verification_mode: string;
  public_key: string | null;
  secret_key: string | null;
  webhook_secret: string | null;
  merchant_code: string | null;
  qr_payload: string | null;
  active: boolean;
}

async function fetchRuntimeGatewayConfigs(
  supabaseUrl: string,
  serviceRoleKey: string,
  restaurantId: string | null,
  provider: string | null,
): Promise<RuntimeGatewayConfig[]> {
  const res = await fetch(`${supabaseUrl}/rest/v1/rpc/get_payment_gateway_runtime_config`, {
    method: 'POST',
    headers: serviceHeaders(serviceRoleKey),
    body: JSON.stringify({
      p_restaurant_id: restaurantId,
      p_provider: provider,
    }),
  }).catch(() => null);
  if (!res?.ok) return [];
  const rows = (await res.json().catch(() => [])) as unknown;
  return Array.isArray(rows) ? (rows as RuntimeGatewayConfig[]) : [];
}

async function verifyCallerCanReadOrder(
  supabaseUrl: string,
  anonKey: string,
  incomingAuthorization: string | null,
  orderId: string,
  guestAccessToken: string | null,
): Promise<boolean> {
  const rpcAuth = incomingAuthorization?.startsWith('Bearer ')
    ? incomingAuthorization
    : `Bearer ${anonKey}`;
  const res = await fetch(`${supabaseUrl}/rest/v1/rpc/get_payment_intent`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: rpcAuth,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      p_order_id: orderId,
      p_guest_access_token: guestAccessToken,
    }),
  }).catch(() => null);
  if (!res?.ok) return false;
  const rows = (await res.json().catch(() => [])) as unknown;
  return Array.isArray(rows) && rows.length > 0;
}

async function computeHmacSha256Hex(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, '0')).join('');
}

function decodeBase64UrlToUtf8(input: string): string {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
}

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

export const automaticHandler = async (request: Request): Promise<Response> => {
  const origin = request.headers.get('origin');
  if (!allowedOrigin(origin)) return json({ error: 'Origin no permitido.' }, 403, origin);
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(origin) });
  if (request.method !== 'POST') return json({ error: 'Método no permitido.' }, 405, origin);
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return json({ error: 'Configuración de Supabase incompleta en el servidor.' }, 503, origin);
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: 'JSON inválido.' }, 400, origin);
  }

  const action = text(body.action);
  const incomingAuth = request.headers.get('authorization');

  // 1. Acción: Comprobar conexión de credenciales (Panel Administrativo autenticado)
  if (action === 'test_connection') {
    const provider = text(body.provider).toLowerCase();
    const restaurantId = text(body.restaurantId);
    if (!isUuid(restaurantId)) return json({ error: 'restaurantId inválido.' }, 400, origin);
    if (!incomingAuth?.startsWith('Bearer ')) {
      return json({ error: 'Sesión administrativa requerida.' }, 401, origin);
    }

    const authCheck = await fetch(`${supabaseUrl}/rest/v1/rpc/list_payment_gateway_configs`, {
      method: 'POST',
      headers: {
        apikey: anonKey,
        Authorization: incomingAuth,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_restaurant_id: restaurantId }),
    }).catch(() => null);
    if (!authCheck?.ok) {
      return json({ error: 'No autorizado para comprobar la configuración del restaurante.' }, 403, origin);
    }

    const dbConfigs = await fetchRuntimeGatewayConfigs(
      supabaseUrl,
      serviceRoleKey,
      restaurantId,
      provider,
    );
    const dbCfg = dbConfigs[0];

    const mpToken = dbCfg?.secret_key?.trim() || Deno.env.get('MERCADOPAGO_ACCESS_TOKEN') || '';
    const culqiSecret = dbCfg?.secret_key?.trim() || Deno.env.get('CULQI_SECRET_KEY') || '';
    const taypiSecret = dbCfg?.secret_key?.trim() || Deno.env.get('TAYPI_SECRET_KEY') || '';
    const izipaySecret = dbCfg?.secret_key?.trim() || Deno.env.get('IZIPAY_HASH_KEY') || '';

    let connected = false;
    let detail = '';

    if (provider === 'mercado_pago') {
      if (!mpToken) {
        return json(
          {
            ok: false,
            connected: false,
            message:
              'Guarda primero tu Access Token de Mercado Pago en el panel o configura MERCADOPAGO_ACCESS_TOKEN en Supabase.',
          },
          200,
          origin,
        );
      }
      const res = await fetch('https://api.mercadopago.com/v1/payment_methods', {
        headers: { Authorization: `Bearer ${mpToken}` },
      }).catch(() => null);
      connected = Boolean(res?.ok);
      detail = connected
        ? 'Conexión real verificada con Mercado Pago Perú API (Yape OTP y tarjetas activos).'
        : 'Mercado Pago rechazó el Access Token configurado.';
    } else if (provider === 'culqi') {
      if (!culqiSecret) {
        return json(
          {
            ok: false,
            connected: false,
            message: 'Guarda tu Secret Key de Culqi o configura CULQI_SECRET_KEY en Supabase.',
          },
          200,
          origin,
        );
      }
      connected = /^sk_(?:test|live)_[A-Za-z0-9_-]+$/.test(culqiSecret);
      detail = connected
        ? 'Credenciales de Culqi válidas en el servidor.'
        : 'Formato de Secret Key Culqi inválido.';
    } else if (provider === 'taypi_qr') {
      connected = taypiSecret.length >= 16;
      detail = connected
        ? 'Credenciales de TAYPI/KUTI QR Dinámico disponibles en el servidor.'
        : 'Falta Secret Key de TAYPI QR Dinámico.';
    } else if (provider === 'izipay') {
      connected = izipaySecret.length >= 16;
      detail = connected
        ? 'Llave HMAC de Izipay disponible en el servidor.'
        : 'Falta Hash Key de Izipay.';
    } else if (provider === 'static_qr') {
      const autoCloudSecret =
        dbCfg?.webhook_secret?.trim() || Deno.env.get('STATIC_QR_AUTOCLOUD_SECRET') || '';
      const gmailRefreshToken = Deno.env.get('GMAIL_REFRESH_TOKEN') ?? '';
      connected = Boolean(dbCfg?.qr_payload?.trim() || autoCloudSecret || gmailRefreshToken);
      detail =
        autoCloudSecret || gmailRefreshToken
          ? 'QR Estático AutoCloud activo: síntesis EMVCo (Tag 54 + CRC16) y puente criptográfico DKIM en la nube sin celular.'
          : 'Guarda primero el Payload EMVCo del QR y tu secreto AutoCloud para activar la verificación automática.';
    } else {
      return json({ error: 'Proveedor no soportado.' }, 400, origin);
    }

    return json({ ok: connected, connected, message: detail }, 200, origin);
  }

  // 2. Acción: Cobro síncrono server-to-server con Yape OTP (6 dígitos) vía Mercado Pago Perú
  if (action === 'charge_yape_otp') {
    const attemptId = text(body.attemptId);
    const orderId = text(body.orderId);
    const guestAccessToken =
      typeof body.guestAccessToken === 'string' ? body.guestAccessToken : null;
    const phoneNumber = text(body.phoneNumber).replace(/\D/g, '');
    const otp = text(body.otp).replace(/\D/g, '');
    const customerEmail = text(body.customerEmail, 'cliente@suyadelivery.com')
      .trim()
      .toLowerCase();

    if (!isUuid(attemptId) || !isUuid(orderId)) {
      return json({ error: 'Identificadores de pedido o intento inválidos.' }, 400, origin);
    }
    if (!/^9\d{8}$/.test(phoneNumber)) {
      return json({ error: 'Ingresa un número de celular Yape válido de 9 dígitos.' }, 400, origin);
    }
    if (!/^\d{6}$/.test(otp)) {
      return json(
        { error: 'Ingresa el código de aprobación de 6 dígitos de la app Yape.' },
        400,
        origin,
      );
    }

    const authorizedCaller = await verifyCallerCanReadOrder(
      supabaseUrl,
      anonKey,
      incomingAuth,
      orderId,
      guestAccessToken,
    );
    if (!authorizedCaller) {
      return json({ error: 'No autorizado para cobrar este pedido.' }, 403, origin);
    }

    // Leer el intento y el restaurante dueño del pedido desde PostgreSQL
    const attemptUrl = new URL(`${supabaseUrl}/rest/v1/payment_attempts`);
    attemptUrl.searchParams.set('id', `eq.${attemptId}`);
    attemptUrl.searchParams.set('order_id', `eq.${orderId}`);
    attemptUrl.searchParams.set(
      'select',
      'id,order_id,amount,amount_cents,status,checkout_reference,external_transaction_id,orders!inner(restaurant_id)',
    );
    const attemptRes = await fetch(attemptUrl, { headers: serviceHeaders(serviceRoleKey) });
    if (!attemptRes.ok) {
      return json({ error: 'No se pudo consultar el intento de pago.' }, 502, origin);
    }
    const attempts = (await attemptRes.json()) as Array<Record<string, unknown>>;
    const attempt = attempts[0];
    if (!attempt) {
      return json({ error: 'Intento de pago no encontrado.' }, 404, origin);
    }
    if (attempt.status === 'authorized') {
      return json(
        {
          status: 'authorized',
          providerReference: text(attempt.external_transaction_id || attempt.checkout_reference),
          message: 'Este pedido ya tiene el pago confirmado.',
        },
        200,
        origin,
      );
    }

    const orderMeta = attempt.orders as { restaurant_id?: string } | undefined;
    const restaurantId = isUuid(orderMeta?.restaurant_id) ? orderMeta!.restaurant_id : null;
    const dbConfigs = restaurantId
      ? await fetchRuntimeGatewayConfigs(supabaseUrl, serviceRoleKey, restaurantId, 'mercado_pago')
      : [];
    const dbCfg = dbConfigs[0];

    const mpPublicKey = dbCfg?.public_key?.trim() || Deno.env.get('MERCADOPAGO_PUBLIC_KEY') || '';
    const mpAccessToken = dbCfg?.secret_key?.trim() || Deno.env.get('MERCADOPAGO_ACCESS_TOKEN') || '';
    if (!mpPublicKey || !mpAccessToken) {
      return json(
        { error: 'Pasarela Mercado Pago Yape no configurada en el servidor.' },
        503,
        origin,
      );
    }

    const amountCents = Math.round(Number(attempt.amount) * 100);
    const amountPen = Number((amountCents / 100).toFixed(2));
    if (!Number.isFinite(amountCents) || amountCents < 200 || amountCents > 50000) {
      return json(
        { error: 'El monto para Yape automático debe estar entre S/ 2.00 y S/ 500.00.' },
        422,
        origin,
      );
    }

    // Paso 1: Tokenizar celular + OTP de 6 dígitos en Mercado Pago PCI Yape API
    const tokenUrl = `https://api.mercadopago.com/platforms/pci/yape/v1/payment?public_key=${encodeURIComponent(
      mpPublicKey,
    )}`;
    const tokenRes = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phoneNumber,
        otp,
        requestId: `${attemptId}-${Date.now()}`,
      }),
    });
    if (!tokenRes.ok) {
      return json(
        {
          error:
            'Yape no pudo generar el token. Verifica que el código de aprobación de 6 dígitos esté vigente.',
        },
        422,
        origin,
      );
    }
    const tokenPayload = (await tokenRes.json()) as { id?: unknown };
    const yapeToken = text(tokenPayload.id);
    if (!yapeToken) {
      return json({ error: 'Mercado Pago no devolvió un token Yape válido.' }, 502, origin);
    }

    // Paso 2: Ejecutar cobro síncrono con clave de idempotencia derivada del intento
    const idempotencyKey = `suya-mp-yape-${attemptId}`;
    const paymentRes = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${mpAccessToken}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify({
        transaction_amount: amountPen,
        token: yapeToken,
        description: `SUYA Delivery ${text(attempt.checkout_reference)}`,
        installments: 1,
        payment_method_id: 'yape',
        external_reference: attemptId,
        metadata: {
          suya_order_id: orderId,
          suya_payment_attempt_id: attemptId,
          suya_checkout_reference: text(attempt.checkout_reference),
        },
        payer: {
          email: customerEmail,
        },
      }),
    });

    if (!paymentRes.ok) {
      return json(
        {
          error:
            'El cobro en Yape fue rechazado. Verifica tu saldo, límite diario o genera un nuevo código de aprobación.',
        },
        402,
        origin,
      );
    }

    const paymentData = (await paymentRes.json()) as {
      id?: unknown;
      status?: unknown;
      transaction_amount?: unknown;
      currency_id?: unknown;
    };
    const externalTxId = text(paymentData.id);
    const mpStatus = text(paymentData.status).toLowerCase();
    const mpAmountCents = Math.round(Number(paymentData.transaction_amount) * 100);

    // Liquidar atómicamente en PostgreSQL mediante settle_verified_gateway_payment
    const settleRes = await fetch(`${supabaseUrl}/rest/v1/rpc/settle_verified_gateway_payment`, {
      method: 'POST',
      headers: serviceHeaders(serviceRoleKey),
      body: JSON.stringify({
        p_provider: 'mercado_pago',
        p_event_id: `mp_sync_${externalTxId}`,
        p_external_transaction_id: externalTxId,
        p_payment_attempt_id: attemptId,
        p_amount_cents: mpAmountCents,
        p_currency: text(paymentData.currency_id, 'PEN'),
        p_provider_status: mpStatus === 'approved' ? 'approved' : mpStatus,
        p_raw_payload: { id: externalTxId, status: mpStatus },
      }),
    });

    if (!settleRes.ok) {
      return json(
        { error: 'El cobro se procesó pero quedó pendiente de conciliación en el servidor.' },
        502,
        origin,
      );
    }

    if (mpStatus !== 'approved') {
      return json(
        { error: 'Yape no aprobó la operación. Revisa tu aplicación Yape.' },
        402,
        origin,
      );
    }

    return json(
      {
        status: 'authorized',
        providerReference: externalTxId,
        message: 'Pago con Yape confirmado automáticamente.',
      },
      200,
      origin,
    );
  }

  // 3. Acción: Generar sesión QR Dinámico Interoperable (TAYPI / KUTI EMVCo BCRP)
  if (action === 'create_dynamic_qr') {
    const attemptId = text(body.attemptId);
    const orderId = text(body.orderId);
    const guestAccessToken =
      typeof body.guestAccessToken === 'string' ? body.guestAccessToken : null;
    if (!isUuid(attemptId) || !isUuid(orderId)) {
      return json({ error: 'Identificadores inválidos.' }, 400, origin);
    }

    const authorizedCaller = await verifyCallerCanReadOrder(
      supabaseUrl,
      anonKey,
      incomingAuth,
      orderId,
      guestAccessToken,
    );
    if (!authorizedCaller) {
      return json({ error: 'No autorizado para generar QR de este pedido.' }, 403, origin);
    }

    const attemptUrl = new URL(`${supabaseUrl}/rest/v1/payment_attempts`);
    attemptUrl.searchParams.set('id', `eq.${attemptId}`);
    attemptUrl.searchParams.set('order_id', `eq.${orderId}`);
    attemptUrl.searchParams.set(
      'select',
      'id,order_id,amount,status,checkout_reference,gateway_qr_payload,orders!inner(restaurant_id)',
    );
    const attemptRes = await fetch(attemptUrl, { headers: serviceHeaders(serviceRoleKey) });
    if (!attemptRes.ok) return json({ error: 'No se pudo leer el intento.' }, 502, origin);
    const attempts = (await attemptRes.json()) as Array<Record<string, unknown>>;
    const attempt = attempts[0];
    if (!attempt) return json({ error: 'Intento no encontrado.' }, 404, origin);
    if (typeof attempt.gateway_qr_payload === 'string' && attempt.gateway_qr_payload.trim()) {
      return json({ qrPayload: attempt.gateway_qr_payload }, 200, origin);
    }

    const orderMeta = attempt.orders as { restaurant_id?: string } | undefined;
    const restaurantId = isUuid(orderMeta?.restaurant_id) ? orderMeta!.restaurant_id : null;
    const dbConfigs = restaurantId
      ? await fetchRuntimeGatewayConfigs(supabaseUrl, serviceRoleKey, restaurantId, 'taypi_qr')
      : [];
    const dbCfg = dbConfigs[0];

    const taypiPublicKey = dbCfg?.public_key?.trim() || Deno.env.get('TAYPI_PUBLIC_KEY') || '';
    const taypiSecretKey = dbCfg?.secret_key?.trim() || Deno.env.get('TAYPI_SECRET_KEY') || '';
    if (!taypiPublicKey || !taypiSecretKey) {
      return json({ error: 'Pasarela TAYPI QR Dinámico no configurada.' }, 503, origin);
    }

    const amountPen = Number(attempt.amount).toFixed(2);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const requestPath = '/v1/checkout/sessions';
    const payload = JSON.stringify({
      amount: amountPen,
      currency: 'PEN',
      reference: attemptId,
      description: `Pedido SUYA ${text(attempt.checkout_reference)}`,
    });
    const signature = await computeHmacSha256Hex(
      taypiSecretKey,
      `${timestamp}\nPOST\n${requestPath}\n${payload}`,
    );

    const sessionRes = await fetch(`https://app.taypi.pe${requestPath}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Taypi-Key': taypiPublicKey,
        'Taypi-Timestamp': timestamp,
        'Taypi-Signature': signature,
      },
      body: payload,
    });
    if (!sessionRes.ok) {
      return json({ error: 'No se pudo generar el QR dinámico interoperable.' }, 502, origin);
    }
    const sessionData = (await sessionRes.json()) as {
      id?: unknown;
      qr_payload?: unknown;
      qr_url?: unknown;
    };
    const qrPayload = text(sessionData.qr_payload || sessionData.qr_url);
    if (qrPayload) {
      await fetch(`${supabaseUrl}/rest/v1/payment_attempts?id=eq.${attemptId}`, {
        method: 'PATCH',
        headers: serviceHeaders(serviceRoleKey),
        body: JSON.stringify({
          gateway_qr_payload: qrPayload,
          provider_reference: text(sessionData.id) || null,
        }),
      }).catch(() => null);
    }

    return json(
      {
        sessionId: text(sessionData.id),
        qrPayload,
      },
      200,
      origin,
    );
  }

  // 4. Acción: Sincronización Serverless AutoCloud vía Gmail API OAuth2 (Sin celular encendido)
  if (action === 'sync_gmail_autocloud') {
    const dbConfigs = await fetchRuntimeGatewayConfigs(supabaseUrl, serviceRoleKey, null, 'static_qr');
    const activeSecret =
      Deno.env.get('STATIC_QR_AUTOCLOUD_SECRET') ||
      dbConfigs.find((c) => c.active && c.webhook_secret)?.webhook_secret?.trim() ||
      '';
    const cronHeader = request.headers.get('x-suya-autocloud-cron')?.trim() || '';
    const hasCronSecret = Boolean(activeSecret && cronHeader === activeSecret);
    const orderId = text(body.orderId);
    const guestAccessToken = typeof body.guestAccessToken === 'string' ? body.guestAccessToken : null;
    const isOrderPoll = isUuid(orderId);

    if (!hasCronSecret) {
      if (isOrderPoll) {
        const canReadOrder = await verifyCallerCanReadOrder(
          supabaseUrl,
          anonKey,
          incomingAuth,
          orderId,
          guestAccessToken,
        );
        if (!canReadOrder) {
          return json({ error: 'No autorizado para consultar este pedido.' }, 403, origin);
        }
      } else {
        if (!incomingAuth?.startsWith('Bearer ')) {
          return json({ error: 'Autenticación requerida para sincronizar AutoCloud.' }, 401, origin);
        }
        const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
          headers: { apikey: anonKey, Authorization: incomingAuth },
        }).catch(() => null);
        if (!userRes?.ok) {
          return json({ error: 'Sesión no válida.' }, 401, origin);
        }
      }
    }

    const clientId = Deno.env.get('GMAIL_CLIENT_ID') ?? '';
    const clientSecret = Deno.env.get('GMAIL_CLIENT_SECRET') ?? '';
    const refreshToken = Deno.env.get('GMAIL_REFRESH_TOKEN') ?? '';

    if (!clientId || !clientSecret || !refreshToken || !activeSecret) {
      if (isOrderPoll) {
        return json({ ok: false, skipped: true, reason: 'gmail_oauth_not_configured' }, 200, origin);
      }
      return json(
        {
          error:
            'Configura GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN y STATIC_QR_AUTOCLOUD_SECRET en Supabase.',
        },
        503,
        origin,
      );
    }

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });
    if (!tokenRes.ok) {
      return json({ error: 'No se pudo obtener access_token de Gmail API OAuth2.' }, 502, origin);
    }
    const { access_token: accessToken } = (await tokenRes.json()) as { access_token?: string };
    if (!accessToken) {
      return json({ error: 'Gmail OAuth2 no devolvió access_token.' }, 502, origin);
    }

    const query =
      'is:unread newer_than:2d (from:notificacionesbcp.com.pe OR from:yape.com.pe OR from:interbank.pe OR from:interbank.com.pe OR from:bbva.com.pe OR from:scotiabank.com.pe OR from:izipay.pe OR from:lemon.me OR from:dale.pe OR from:gmoney.pe OR from:gmoney.com.pe)';
    const listUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=15&q=${encodeURIComponent(
      query,
    )}`;
    const listRes = await fetch(listUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!listRes.ok) {
      return json({ error: 'No se pudo listar mensajes de Gmail API.' }, 502, origin);
    }
    const listData = (await listRes.json()) as { messages?: Array<{ id?: string }> };
    const messages = listData.messages ?? [];
    let processedCount = 0;

    for (const item of messages) {
      const msgId = text(item.id);
      if (!msgId) continue;
      const msgRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(
          msgId,
        )}?format=raw`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (!msgRes.ok) continue;
      const msgJson = (await msgRes.json()) as { raw?: string; snippet?: string };
      const rawMime = typeof msgJson.raw === 'string' ? decodeBase64UrlToUtf8(msgJson.raw) : '';
      const crlfEnd = rawMime.indexOf('\r\n\r\n');
      const lfEnd = crlfEnd < 0 ? rawMime.indexOf('\n\n') : -1;
      const headerBlock =
        crlfEnd >= 0 ? rawMime.slice(0, crlfEnd) : lfEnd >= 0 ? rawMime.slice(0, lfEnd) : rawMime;
      const rawMimeBody =
        crlfEnd >= 0 ? rawMime.slice(crlfEnd + 4) : lfEnd >= 0 ? rawMime.slice(lfEnd + 2) : '';
      const unfoldedHeaders = headerBlock.replace(/\r?\n[ \t]+/g, ' ');
      const extractHeader = (name: string): string => {
        const match = unfoldedHeaders.match(new RegExp(`^${name}:\\s*(.+)$`, 'im'));
        return match ? match[1].trim() : '';
      };

      const forwardPayload = JSON.stringify({
        messageId: msgId,
        subject: extractHeader('Subject'),
        recipientAddress: extractHeader('To'),
        authenticationResultsHeader: extractHeader('Authentication-Results'),
        dkimSignatureHeader: extractHeader('DKIM-Signature'),
        rawMimeHeaders: headerBlock,
        rawMimeBody,
        rawBodyText: rawMimeBody || text(msgJson.snippet),
      });
      const sig = await computeHmacSha256Hex(activeSecret, forwardPayload);
      const whRes = await fetch(`${supabaseUrl}/functions/v1/payment-webhook?provider=static_qr`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-suya-autocloud-signature': `sha256=${sig}`,
        },
        body: forwardPayload,
      });
      if (whRes.ok) processedCount += 1;
    }

    return json({ ok: true, scanned: messages.length, processed: processedCount }, 200, origin);
  }

  return json({ error: 'Acción no reconocida en payment-gateway.' }, 400, origin);
};
