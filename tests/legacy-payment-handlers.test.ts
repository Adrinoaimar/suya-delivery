import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { webcrypto } from 'node:crypto';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';

const attemptId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const orderId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const claimToken = 'server-only-claim-token-with-more-than-32-characters';
const env = {
  SUPABASE_URL: 'https://test.supabase.co',
  SUPABASE_ANON_KEY: 'public-key',
  SUPABASE_SERVICE_ROLE_KEY: 'test-server-role',
  CULQI_SECRET_KEY: 'sk_test_local_fixture',
  ALLOWED_ORIGINS: 'https://suya.example',
  CULQI_WEBHOOK_USERNAME: 'webhook',
  CULQI_WEBHOOK_PASSWORD: 'local-fixture',
};

type Handler = (request: Request) => Promise<Response>;
function loadHandler(fetcher: typeof fetch, functionName = 'charge-culqi-card'): Handler {
  let registered: unknown;
  const source = readFileSync(`supabase/functions/${functionName}/index.ts`, 'utf8');
  runInNewContext(ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.None },
  }).outputText, {
    Deno: {
      env: { get: (key: string) => env[key as keyof typeof env] },
      serve: (handler: Handler) => { registered = handler; },
    },
    fetch: fetcher, Response, Request, Headers, URL, crypto: webcrypto,
    TextEncoder, atob, btoa, AbortSignal, Date, console: { error: vi.fn() },
  });
  if (typeof registered !== 'function') throw new Error('Handler no registrado');
  return registered as Handler;
}

function request(): Request {
  return new Request('https://test.supabase.co/functions/v1/charge-culqi-card', {
    method: 'POST',
    headers: { Authorization: 'Bearer customer-jwt', Origin: 'https://suya.example', 'Content-Type': 'application/json' },
    body: JSON.stringify({ attemptId, method: 'card', tokenId: 'tkn_test_example', customerEmail: 'cliente@example.com' }),
  });
}

interface Scenario {
  actorStatus?: number;
  claimStatus?: number;
  chargeStatus?: number;
  providerError?: boolean;
  authorizeStatus?: number;
  authorizeResult?: boolean;
  chargePatch?: Record<string, unknown>;
}
function scenario(options: Scenario = {}) {
  const calls: Array<{ url: string; headers: Headers; body: Record<string, unknown> }> = [];
  const fetcher = vi.fn<typeof fetch>(async (input, init) => {
    const url = String(input);
    calls.push({ url, headers: new Headers(init?.headers), body: JSON.parse(String(init?.body ?? '{}')) });
    const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
    if (url.endsWith('/rpc/check_culqi_payment_actor_secure')) return reply(true, options.actorStatus ?? 200);
    if (url.endsWith('/rpc/claim_culqi_payment_secure')) return reply([{
      attempt_id: attemptId, order_id: orderId, amount: '20.00', claim_token: claimToken,
      order_code: 'SUYA1234', customer_name: 'Cliente Prueba', customer_phone: '999999999',
    }], options.claimStatus ?? 200);
    if (url === 'https://api.culqi.com/v2/charges') {
      if (options.providerError) throw new Error('timeout simulado');
      return reply({
        id: 'chr_test_confirmed', amount: 2000, currency_code: 'PEN', capture: true,
        metadata: { suya_order_id: orderId, suya_payment_attempt_id: attemptId },
        ...options.chargePatch,
      }, options.chargeStatus ?? 200);
    }
    if (url.endsWith('/rpc/authorize_culqi_payment_secure')) return reply(options.authorizeResult ?? true, options.authorizeStatus ?? 200);
    if (url.endsWith('/rpc/fail_culqi_payment_claim_secure')) return reply(true);
    throw new Error(`Llamada inesperada: ${url}`);
  });
  return { handler: loadHandler(fetcher), calls };
}

describe('frontera de confianza Culqi — ejecución real del handler con HTTP controlado', () => {
  it('verifica propietario antes de reservar y usa service_role solo en RPC privilegiadas', async () => {
    const { handler, calls } = scenario();
    const response = await handler(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'authorized', providerReference: 'chr_test_confirmed' });
    expect(calls[0].url).toMatch(/check_culqi_payment_actor_secure$/);
    expect(calls[0].headers.get('authorization')).toBe('Bearer customer-jwt');
    for (const call of calls.filter((call) => /\/(claim_culqi_payment_secure|authorize_culqi_payment_secure)$/.test(call.url))) {
      expect(call.headers.get('authorization')).toBe('Bearer test-server-role');
    }
    expect(calls.find((call) => call.url.endsWith('/v2/charges'))?.body.amount).toBe(2000);
  });

  it('rechaza a un actor ajeno sin llamar al proveedor', async () => {
    const { handler, calls } = scenario({ actorStatus: 403 });
    expect((await handler(request())).status).toBe(403);
    expect(calls).toHaveLength(1);
  });

  it('rechaza reserva concurrente sin emitir un segundo cargo', async () => {
    const { handler, calls } = scenario({ claimStatus: 409 });
    expect((await handler(request())).status).toBe(422);
    expect(calls.some((call) => call.url.includes('api.culqi.com'))).toBe(false);
  });

  it.each([
    ['importe', { amount: 1999 }],
    ['moneda', { currency_code: 'USD' }],
    ['captura', { capture: false }],
    ['pedido', { metadata: { suya_order_id: 'otro', suya_payment_attempt_id: attemptId } }],
    ['intento', { metadata: { suya_order_id: orderId, suya_payment_attempt_id: 'otro' } }],
    ['referencia', { id: 'forged-reference' }],
  ])('no autoriza respuesta con %s inconsistente', async (_label, chargePatch) => {
    const { handler, calls } = scenario({ chargePatch });
    expect((await handler(request())).status).toBe(502);
    expect(calls.some((call) => call.url.endsWith('/rpc/authorize_culqi_payment_secure'))).toBe(false);
  });

  it.each([{ authorizeStatus: 500 }, { authorizeResult: false }])('no declara pagado cuando falla la transacción de BD: %j', async (options) => {
    const { handler, calls } = scenario(options);
    expect((await handler(request())).status).toBe(502);
    expect(calls.some((call) => call.url.includes('/payment_attempts?'))).toBe(false);
  });

  it.each([{ chargeStatus: 500 }, { providerError: true }])('conserva la reserva ante un resultado externo incierto: %j', async (options) => {
    const { handler, calls } = scenario(options);
    expect((await handler(request())).status).toBe(502);
    expect(calls.some((call) => call.url.includes('/rpc/fail_culqi_payment_claim_secure'))).toBe(false);
    expect(calls.some((call) => call.url.includes('/rpc/authorize_culqi_payment_secure'))).toBe(false);
  });

  it('registra rechazo explícito por canal de servidor', async () => {
    const { handler, calls } = scenario({ chargeStatus: 402 });
    expect((await handler(request())).status).toBe(402);
    const failure = calls.find((call) => call.url.endsWith('/rpc/fail_culqi_payment_claim_secure'));
    expect(failure?.headers.get('authorization')).toBe('Bearer test-server-role');
    expect(failure?.body.p_claim_token).toBe(claimToken);
  });
});

function webhookScenario(options: {
  state?: string; status?: string; paidAt?: number; wrongMetadata?: boolean;
  amount?: number; databaseStatus?: number; emptyWrite?: boolean; networkError?: boolean;
} = {}) {
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  const nowSeconds = Math.floor(Date.now() / 1000);
  const fetcher = vi.fn<typeof fetch>(async (input, init) => {
    const url = String(input);
    calls.push({ url, body: JSON.parse(String(init?.body ?? '{}')) });
    if (url.startsWith('https://api.culqi.com/')) {
      if (options.networkError) throw new Error('red no disponible');
      return new Response(JSON.stringify({
        id: 'ord_test_confirmed', amount: options.amount ?? 2000, currency_code: 'PEN', state: options.state ?? 'paid',
        paid_at: options.paidAt ?? nowSeconds,
        metadata: { suya_order_id: options.wrongMetadata ? 'otro-pedido' : orderId, suya_payment_attempt_id: attemptId },
      }));
    }
    if (init?.method === 'PATCH') {
      return new Response(JSON.stringify(options.emptyWrite ? [] : [{ id: attemptId }]), { status: options.databaseStatus ?? 200 });
    }
    return new Response(JSON.stringify([{
      id: attemptId, order_id: orderId, amount: '20.00', status: options.status ?? 'pending',
      expires_at: new Date((nowSeconds + 600) * 1000).toISOString(),
    }]));
  });
  return { handler: loadHandler(fetcher, 'culqi-webhook'), calls };
}
function webhookRequest(authorization = 'Basic d2ViaG9vazpsb2NhbC1maXh0dXJl'): Request {
  return new Request('https://test.supabase.co/functions/v1/culqi-webhook', {
    method: 'POST', headers: { Authorization: authorization, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'order.status.changed', data: { id: 'ord_test_confirmed', state: 'paid', amount: 2000 } }),
  });
}

describe('webhook Culqi — API oficial como autoridad y persistencia comprobada', () => {
  it('rechaza autenticación inválida antes de consultar la API', async () => {
    const { handler, calls } = webhookScenario();
    expect((await handler(webhookRequest('Basic Zm9yZ2VkOmZvcmdlZA=='))).status).toBe(401);
    expect(calls).toHaveLength(0);
  });
  it('autoriza un pago exacto confirmado dentro de plazo', async () => {
    const { handler, calls } = webhookScenario();
    expect((await handler(webhookRequest())).status).toBe(200);
    expect(calls.some((call) => call.body.status === 'authorized')).toBe(true);
  });
  it('ignora la afirmación de pago del evento si la API lo mantiene pendiente', async () => {
    const { handler, calls } = webhookScenario({ state: 'pending' });
    expect((await handler(webhookRequest())).status).toBe(200);
    expect(calls.some((call) => call.body.status === 'authorized')).toBe(false);
  });
  it('un webhook repetido no ejecuta una segunda actualización', async () => {
    const { handler, calls } = webhookScenario({ status: 'authorized' });
    expect((await handler(webhookRequest())).status).toBe(200);
    expect(calls).toHaveLength(2);
  });
  it('registra el vencimiento verificado sin aprobar', async () => {
    const { handler, calls } = webhookScenario({ state: 'expired' });
    expect((await handler(webhookRequest())).status).toBe(200);
    expect(calls.at(-1)?.body.status).toBe('failed');
  });
  it.each([
    { status: 'failed' },
    { paidAt: Math.floor(Date.now() / 1000) + 3600 },
  ])('un pago sobre intento cerrado o tardío queda para conciliación: %j', async (options) => {
    const { handler, calls } = webhookScenario(options);
    const response = await handler(webhookRequest());
    expect(await response.json()).toEqual({ received: true, review_required: true });
    expect(calls.at(-1)?.body.failure_code).toBe('culqi_late_or_closed_payment_review');
    expect(calls.some((call) => call.body.status === 'authorized')).toBe(false);
  });
  it('no cruza pedidos del mismo importe con metadata ajena', async () => {
    const { handler, calls } = webhookScenario({ wrongMetadata: true });
    expect((await handler(webhookRequest())).status).toBe(422);
    expect(calls.some((call) => call.body.status === 'authorized')).toBe(false);
  });
  it('rechaza importe incorrecto aunque el evento declare el esperado', async () => {
    const { handler, calls } = webhookScenario({ amount: 1999 });
    expect((await handler(webhookRequest())).status).toBe(422);
    expect(calls.at(-1)?.body.failure_code).toBe('culqi_amount_mismatch');
  });
  it.each([{ databaseStatus: 503 }, { emptyWrite: true }, { networkError: true }])('solicita reintento ante error o persistencia ausente: %j', async (options) => {
    const { handler } = webhookScenario(options);
    expect((await handler(webhookRequest())).status).toBe(502);
  });
});
