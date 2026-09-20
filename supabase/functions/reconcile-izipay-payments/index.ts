function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : value == null ? fallback : String(value);
}

function safeEqual(left: string, right: string): boolean {
  const length = Math.max(left.length, right.length);
  let mismatch = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) {
    mismatch |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return mismatch === 0;
}

function hasReconcileAuth(request: Request, secret: string): boolean {
  const header = request.headers.get('authorization') ?? '';
  if (!/^Bearer\s+/i.test(header)) return false;
  return safeEqual(header.replace(/^Bearer\s+/i, '').trim(), secret);
}

function serviceHeaders(serviceRoleKey: string): HeadersInit {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    'Content-Type': 'application/json',
  };
}

function sessionToken(value: unknown): string {
  const row = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const response = row.response && typeof row.response === 'object'
    ? row.response as Record<string, unknown>
    : {};
  return text(response.token ?? row.token);
}

function firstRow(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) return (value[0] as Record<string, unknown> | undefined) ?? null;
  return value && typeof value === 'object' ? value as Record<string, unknown> : null;
}

function normalizeProviderPayload(value: unknown, transactionId: string): Record<string, unknown> {
  const row = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  if (typeof row.payloadHttp === 'string') {
    try {
      const payload = JSON.parse(row.payloadHttp) as Record<string, unknown>;
      if (payload && typeof payload === 'object') {
        return {
          ...payload,
          transactionId: text(payload.transactionId, text(row.transactionId, transactionId)),
        };
      }
    } catch {
      // La respuesta se valida más abajo mediante el RPC; no persistas texto inválido.
    }
  }
  return {
    ...row,
    transactionId: text(row.transactionId, transactionId),
  };
}

type PendingAttempt = {
  id?: unknown;
  provider_reference?: unknown;
  checkout_reference?: unknown;
  amount?: unknown;
  status?: unknown;
};

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const merchantCode = Deno.env.get('IZIPAY_MERCHANT_CODE');
const publicKey = Deno.env.get('IZIPAY_PUBLIC_KEY');
const reconcileSecret = Deno.env.get('IZIPAY_RECONCILE_SECRET');
const production = Deno.env.get('IZIPAY_ENVIRONMENT') === 'production';
const apiBase = production ? 'https://api-pw.izipay.pe' : 'https://sandbox-api-pw.izipay.pe';
const tokenUrl = Deno.env.get('IZIPAY_TOKEN_URL') || `${apiBase}/security/v1/Token/Generate`;
const orderQueryUrl = Deno.env.get('IZIPAY_ORDER_QUERY_URL') || `${apiBase}/orderinfo/v1/Transaction/Search`;

async function pendingAttempts(limit: number): Promise<PendingAttempt[]> {
  if (!supabaseUrl || !serviceRoleKey) return [];
  const url = new URL(`${supabaseUrl}/rest/v1/payment_attempts`);
  url.searchParams.set('provider', 'eq.izipay');
  url.searchParams.set('status', 'eq.pending');
  url.searchParams.set('select', 'id,provider_reference,checkout_reference,amount,status');
  url.searchParams.set('order', 'created_at.asc');
  url.searchParams.set('limit', String(limit));
  const response = await fetch(url, { headers: serviceHeaders(serviceRoleKey) });
  if (!response.ok) throw new Error('No se pudo leer la cola Izipay.');
  const value = await response.json();
  return Array.isArray(value) ? value as PendingAttempt[] : [];
}

async function queryProvider(attempt: PendingAttempt): Promise<Record<string, unknown>> {
  if (!merchantCode || !publicKey) throw new Error('Izipay no está configurado.');
  const transactionId = text(attempt.provider_reference);
  const orderNumber = text(attempt.checkout_reference);
  const amount = Number(attempt.amount);
  if (!/^[A-Za-z0-9]{5,40}$/.test(transactionId)) throw new Error('transactionId inválido.');
  if (!/^[A-Za-z0-9]{5,15}$/.test(orderNumber)) throw new Error('orderNumber inválido.');
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Monto de intento inválido.');

  const tokenResponse = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', transactionId },
    body: JSON.stringify({
      requestSource: 'ECOMMERCE',
      merchantCode,
      orderNumber,
      publicKey,
      amount: amount.toFixed(2),
    }),
  });
  const tokenBody = await tokenResponse.json().catch(() => ({}));
  const token = sessionToken(tokenBody);
  if (!tokenResponse.ok || text(tokenBody?.code) !== '00' || !token) {
    throw new Error(`Izipay token ${text(tokenBody?.code, String(tokenResponse.status))}`);
  }

  const queryResponse = await fetch(orderQueryUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      transactionId,
    },
    body: JSON.stringify({ merchantCode, numberOrden: orderNumber, language: 'ESP' }),
  });
  const queryBody = await queryResponse.json().catch(() => ({}));
  if (!queryResponse.ok) throw new Error(`Izipay consulta ${queryResponse.status}`);
  return normalizeProviderPayload(
    Array.isArray(queryBody) ? firstRow(queryBody) ?? {} : queryBody,
    transactionId,
  );
}

async function persistResult(transactionId: string, payload: Record<string, unknown>): Promise<Record<string, unknown> | null> {
  if (!supabaseUrl || !serviceRoleKey) throw new Error('Supabase no está configurado.');
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/apply_izipay_webhook`, {
    method: 'POST',
    headers: serviceHeaders(serviceRoleKey),
    body: JSON.stringify({ p_transaction_id: transactionId, p_payload: payload }),
  });
  if (!response.ok) throw new Error('No se pudo persistir el resultado Izipay.');
  return firstRow(await response.json().catch(() => []));
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json({ error: 'Método no permitido.' }, 405);
  if (!supabaseUrl || !serviceRoleKey || !merchantCode || !publicKey || !reconcileSecret) {
    return json({ error: 'Reconciliación Izipay no configurada.' }, 503);
  }
  if (!hasReconcileAuth(request, reconcileSecret)) {
    return json({ error: 'Autenticación de reconciliación requerida.' }, 401);
  }

  const configuredLimit = Number.parseInt(Deno.env.get('IZIPAY_RECONCILE_LIMIT') ?? '20', 10);
  const limit = Number.isFinite(configuredLimit) ? Math.min(Math.max(configuredLimit, 1), 50) : 20;
  let queue: PendingAttempt[];
  try {
    queue = await pendingAttempts(limit);
  } catch (cause) {
    console.error('Izipay reconciliation queue failed', cause instanceof Error ? cause.message : 'unknown');
    return json({ error: 'No se pudo leer la cola Izipay.' }, 502);
  }

  let authorized = 0;
  let failed = 0;
  let pending = 0;
  const errors: string[] = [];
  for (const attempt of queue) {
    const transactionId = text(attempt.provider_reference);
    try {
      const result = await queryProvider(attempt);
      const persisted = await persistResult(transactionId, result);
      const status = text(persisted?.payment_status, 'pending');
      if (status === 'authorized') authorized += 1;
      else if (status === 'failed') failed += 1;
      else pending += 1;
    } catch (cause) {
      pending += 1;
      if (errors.length < 10) errors.push(`${transactionId || 'unknown'}: ${cause instanceof Error ? cause.message : 'error'}`);
    }
  }

  return json({ processed: queue.length, authorized, failed, pending, errors });
});
