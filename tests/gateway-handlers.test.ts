import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { encryptCredentials, decryptCredentials, verifyMercadoPagoSignature } from '../supabase/functions/_shared/payment-crypto';
import { createGatewayHandler, createWebhookHandler, type PaymentRuntime } from '../supabase/functions/_shared/payment-handlers';
import { MercadoPagoProvider, validCheckoutUrl } from '../supabase/functions/_shared/payment-mercadopago';
import { penCents, type GatewayAttempt, type GatewayConfig, type JsonObject } from '../supabase/functions/_shared/payment-provider';

const restaurantId = 'e52cab6f-f94e-42bb-b71b-bd2b79adc656';
const orderId = '07951274-1757-489c-8d17-6bfcf8536adb';
const attemptId = '24e9bf3c-e91a-4f16-9d4f-de52f989c1f8';
const key = btoa('01234567890123456789012345678901');
const secrets = { accessToken: 'APP_USR-local-test-no-real-credential', webhookSecret: 'local_test_webhook_secret_only' };
const attempt: GatewayAttempt = {
  attempt_id: attemptId, order_id: orderId, restaurant_id: restaurantId, method: 'card', status: 'pending',
  amount: 20, amount_cents: 2000, currency: 'PEN', expires_at: '2026-12-01T00:00:00.000Z',
  checkout_reference: 'SUYA-LOCALTEST', provider_reference: null, checkout_url: null, config_version: 3, claim_token: 'local-claim',
};
let config: GatewayConfig;
function payment(patch: JsonObject = {}): JsonObject {
  return {
    id: 12345678, collector_id: 999, external_reference: attemptId, live_mode: true, currency_id: 'PEN',
    transaction_amount: 20, transaction_amount_refunded: 0, status: 'approved', captured: true,
    date_approved: '2026-11-16T12:01:00.000Z', date_last_updated: '2026-11-16T12:01:00.000Z',
    metadata: { suya_order_id: orderId, suya_payment_attempt_id: attemptId, suya_config_version: 3 }, ...patch,
  };
}
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

async function signedRequest(overrides: { id?: string; secret?: string; body?: unknown; version?: string; timestamp?: string } = {}): Promise<Request> {
  const id = overrides.id ?? '12345678';
  const ts = overrides.timestamp ?? String(Date.now());
  const requestId = 'local-request-id';
  const hmacKey = await crypto.subtle.importKey('raw', new TextEncoder().encode(overrides.secret ?? secrets.webhookSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', hmacKey, new TextEncoder().encode(`id:${id};request-id:${requestId};ts:${ts};`));
  const hash = Array.from(new Uint8Array(mac), (byte) => byte.toString(16).padStart(2, '0')).join('');
  return new Request(`https://project.supabase.co/functions/v1/payment-webhook?restaurant_id=${restaurantId}&version=${overrides.version ?? 3}&data.id=${id}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-request-id': requestId, 'x-signature': `ts=${ts},v1=${hash}` },
    body: JSON.stringify(overrides.body ?? { type: 'payment', data: { id }, status: 'approved' }),
  });
}

interface HarnessOptions { financial?: JsonObject; databaseFailure?: boolean; connectionFailure?: boolean; adminAllowed?: boolean; attemptRow?: GatewayAttempt; account?: JsonObject; prepareAllowed?: boolean; }
function harness(options: HarnessOptions = {}) {
  const calls: Array<{ path: string; body: JsonObject; authorization: string }> = [];
  const applications: JsonObject[] = [];
  const rpcResult: JsonObject = { applied: true, gateway_state: 'confirmed' };
  const fetcher = vi.fn<typeof fetch>(async (input, init) => {
    const url = new URL(String(input));
    const body = init?.body ? JSON.parse(String(init.body)) as JsonObject : {};
    const authorization = new Headers(init?.headers).get('authorization') ?? '';
    calls.push({ path: `${url.origin}${url.pathname}`, body, authorization });
    if (url.origin === 'https://api.mercadopago.com') {
      if (options.connectionFailure) throw new TypeError('network unavailable');
      if (url.pathname === '/users/me') return response(options.account ?? { id: 999, site_id: 'MPE', status: { site_status: 'active' }, tags: [] });
      if (url.pathname === '/checkout/preferences/search') return response({ elements: [] });
      if (url.pathname === '/checkout/preferences') return response({ id: 'local-preference', collector_id: 999, init_point: 'https://www.mercadopago.com.pe/checkout/v1/redirect?pref_id=local', sandbox_init_point: 'https://sandbox.mercadopago.com.pe/checkout/v1/redirect?pref_id=local' });
      if (url.pathname === '/v1/payments/search') return response({ results: [{ id: 12345678 }] });
      return response(options.financial ?? payment());
    }
    const name = url.pathname.split('/').pop();
    if (name === 'require_gateway_admin') return response(options.adminAllowed !== false, options.adminAllowed === false ? 403 : 200);
    if (name === 'get_gateway_config_secret') return response(config);
    if (name === 'prepare_gateway_payment' && options.prepareAllowed === false) return response({ error: 'platform admin sandbox access required' }, 403);
    if (name === 'prepare_gateway_payment' || name === 'get_gateway_attempt') return response(options.attemptRow ?? attempt);
    if (name === 'mark_gateway_webhook_verified') return response(true);
    if (name === 'gateway_config_public') return response({ provider: 'mercadopago', available: false, environment: 'test' });
    if (name === 'get_gateway_payment_intent') return response([options.attemptRow ?? attempt]);
    if (name === 'list_gateway_payments') return response([]);
    if (name === 'list_gateway_reconciliation_batch') return response([attempt]);
    if (name === 'save_gateway_config') return response({ ...config, credentials_encrypted: body.p_credentials_encrypted, enabled: body.p_enabled, verified_at: body.p_verified ? '2026-11-16T12:00:00Z' : null, environment: body.p_environment, collector_id: body.p_collector_id, version: 4, production_permissions_confirmed: body.p_production_permissions_confirmed });
    if (name === 'bind_gateway_checkout') return response({ ...(options.attemptRow ?? attempt), provider: 'mercadopago', provider_reference: body.p_provider_reference, checkout_url: body.p_checkout_url });
    if (name === 'apply_gateway_payment') {
      if (options.databaseFailure) return response({ error: 'database unavailable' }, 503);
      applications.push(body);
      return response(rpcResult);
    }
    return response({ error: 'unhandled test route' }, 404);
  });
  const runtime: PaymentRuntime = {
    supabaseUrl: 'https://project.supabase.co', anonKey: 'local-anon-key', serviceRoleKey: 'local-service-role-key', credentialsKey: key,
    allowedOrigins: ['https://panel.suyadelivery.com'], customerOrigin: 'https://suyadelivery.com', reconcileToken: 'local_reconcile_token_32_characters_minimum', fetcher,
  };
  return { calls, applications, runtime, gateway: createGatewayHandler(runtime), webhook: createWebhookHandler(runtime), fetcher };
}
function gatewayRequest(body: JsonObject, origin = 'https://panel.suyadelivery.com'): Request {
  return new Request('https://project.supabase.co/functions/v1/payment-gateway', { method: 'POST', headers: { Authorization: 'Bearer local-user-jwt', 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify(body) });
}

beforeEach(async () => {
  vi.stubGlobal('crypto', webcrypto);
  config = { restaurant_id: restaurantId, provider: 'mercadopago', environment: 'live', enabled: true, verified_at: '2026-11-16T12:00:00.000Z', webhook_verified_at: '2026-11-16T12:00:00.000Z', collector_id: '999', credentials_encrypted: await encryptCredentials(secrets, key, `${restaurantId}:live`), version: 3, production_permissions_confirmed: true };
});
afterEach(() => vi.unstubAllGlobals());

describe('credenciales y firmas oficiales (pruebas locales, sin cuentas externas)', () => {
  it('cifra credenciales con autenticación del restaurante y entorno', async () => {
    expect(config.credentials_encrypted).not.toContain(secrets.accessToken);
    expect(await decryptCredentials(config.credentials_encrypted, key, `${restaurantId}:live`)).toEqual(secrets);
    await expect(decryptCredentials(config.credentials_encrypted, key, `${restaurantId}:test`)).rejects.toThrow();
  });
  it('rechaza ciphertext manipulado y clave maestra inválida', async () => {
    const envelope = JSON.parse(config.credentials_encrypted) as { ciphertext: string };
    envelope.ciphertext = `${envelope.ciphertext.slice(0, -6)}AAAAAA`;
    await expect(decryptCredentials(JSON.stringify(envelope), key, `${restaurantId}:live`)).rejects.toThrow();
    await expect(encryptCredentials(secrets, btoa('too-short'), `${restaurantId}:live`)).rejects.toThrow();
  });
  it('acepta firma oficial válida y reintento antiguo autentico', async () => {
    expect(await verifyMercadoPagoSignature(await signedRequest(), secrets.webhookSecret)).toBe(true);
    expect(await verifyMercadoPagoSignature(await signedRequest({ timestamp: '1700000000' }), secrets.webhookSecret)).toBe(true);
  });
  it('rechaza firma inválida, timestamp futuro e IDs de URL repetidos', async () => {
    expect(await verifyMercadoPagoSignature(await signedRequest({ secret: 'attacker' }), secrets.webhookSecret)).toBe(false);
    expect(await verifyMercadoPagoSignature(await signedRequest({ timestamp: String(Date.now() + 600_000) }), secrets.webhookSecret)).toBe(false);
    const request = await signedRequest();
    expect(await verifyMercadoPagoSignature(new Request(`${request.url}&data.id=2`, request), secrets.webhookSecret)).toBe(false);
  });
  it('solo admite céntimos PEN exactos', () => {
    expect(penCents(20)).toBe(2000);
    expect(penCents('10.01')).toBe(1001);
    expect(() => penCents(10.001)).toThrow();
    expect(() => penCents('-1')).toThrow();
  });
  it('restringe enlaces de checkout a Mercado Pago Perú y entorno', () => {
    expect(validCheckoutUrl('https://www.mercadopago.com.pe/checkout', 'live')).toBe(true);
    expect(validCheckoutUrl('https://www.mercadopago.com.pe.attacker.test/checkout', 'live')).toBe(false);
    expect(validCheckoutUrl('https://sandbox.mercadopago.com.pe/checkout', 'live')).toBe(false);
    expect(validCheckoutUrl('javascript:alert(1)', 'live')).toBe(false);
  });
});

describe('webhook ejecutado con API y persistencia controladas', () => {
  it('verifica firma y GET oficial antes de solicitar autorización atómica', async () => {
    const h = harness();
    const result = await h.webhook(await signedRequest());
    expect(result.status).toBe(200);
    expect(h.applications).toHaveLength(1);
    expect(h.applications[0]).toMatchObject({ p_attempt_id: attemptId, p_transaction_id: '12345678', p_amount_cents: 2000, p_currency: 'PEN', p_state: 'approved' });
    const application = h.calls.find((call) => call.path.endsWith('/apply_gateway_payment'));
    expect(application?.authorization).toBe('Bearer local-service-role-key');
    expect(h.calls.some((call) => call.path === 'https://api.mercadopago.com/v1/payments/12345678')).toBe(true);
    expect(h.calls.some((call) => call.path.endsWith('/mark_gateway_webhook_verified'))).toBe(true);
    expect(JSON.stringify(await result.json())).not.toContain(secrets.accessToken);
  });
  it('no consulta el proveedor ni autoriza con firma inválida', async () => {
    const h = harness();
    expect((await h.webhook(await signedRequest({ secret: 'forged' }))).status).toBe(401);
    expect(h.applications).toHaveLength(0);
    expect(h.calls.some((call) => call.path.startsWith('https://api.mercadopago.com'))).toBe(false);
  });
  it.each([
    ['otro pedido', { metadata: { suya_order_id: restaurantId, suya_payment_attempt_id: attemptId, suya_config_version: 3 } }],
    ['otra referencia', { external_reference: orderId }],
    ['otro receptor', { collector_id: 123 }],
    ['otra moneda', { currency_id: 'USD' }],
    ['entorno test', { live_mode: false }],
    ['sin captura', { captured: false }],
    ['sin fecha bancaria', { date_approved: null }],
  ])('rechaza %s aunque el importe coincida', async (_label, patch) => {
    const h = harness({ financial: payment(patch) });
    expect((await h.webhook(await signedRequest())).status).toBe(422);
    expect(h.applications).toHaveLength(0);
  });
  it('registra importe incorrecto para revisión en la RPC, sin corregirlo al importe esperado', async () => {
    const h = harness({ financial: payment({ transaction_amount: 19.99 }) });
    expect((await h.webhook(await signedRequest())).status).toBe(200);
    expect(h.applications[0].p_amount_cents).toBe(1999);
  });
  it.each([['pending', 'pending'], ['rejected', 'rejected'], ['cancelled', 'cancelled'], ['refunded', 'refunded'], ['charged_back', 'disputed'], ['in_mediation', 'disputed']])('propaga estado oficial %s sin convertirlo en aprobado', async (providerState, expectedState) => {
    const h = harness({ financial: payment({ status: providerState, transaction_amount_refunded: providerState === 'refunded' ? 20 : 0, date_approved: null, captured: false }) });
    expect((await h.webhook(await signedRequest())).status).toBe(200);
    expect(h.applications[0].p_state).toBe(expectedState);
  });
  it('una devolución parcial invalida el estado approved para su revisión financiera', async () => {
    const h = harness({ financial: payment({ transaction_amount_refunded: 2 }) });
    await h.webhook(await signedRequest());
    expect(h.applications[0].p_state).toBe('partial_refund');
    expect(h.applications[0].p_metadata).toMatchObject({ refunded_amount_cents: 200 });
  });
  it('rechaza devoluciones superiores al cobro o sin importe financiero devuelto', async () => {
    for (const patch of [{ transaction_amount_refunded: 21 }, { status: 'refunded', transaction_amount_refunded: 0 }]) {
      const h = harness({ financial: payment(patch) });
      expect((await h.webhook(await signedRequest())).status).toBe(422);
      expect(h.applications).toHaveLength(0);
    }
  });
  it('ignora el approved manipulable del body si la API confirma pending', async () => {
    const h = harness({ financial: payment({ status: 'pending', date_approved: null }) });
    await h.webhook(await signedRequest());
    expect(h.applications[0].p_state).toBe('pending');
  });
  it('responde error reintentable si falla DB o la conexión oficial', async () => {
    const db = harness({ databaseFailure: true });
    expect((await db.webhook(await signedRequest())).status).toBe(503);
    const network = harness({ connectionFailure: true });
    expect((await network.webhook(await signedRequest())).status).toBe(503);
    expect(network.applications).toHaveLength(0);
  });
  it('el reintento conserva la clave de idempotencia derivada del recurso financiero', async () => {
    const h = harness();
    await h.webhook(await signedRequest());
    await h.webhook(await signedRequest({ body: { type: 'payment', id: 'manipulated-body-event-id', data: { id: 12345678 } } }));
    expect(h.applications[0].p_event_id).toBe(h.applications[1].p_event_id);
  });
  it('envíos simultáneos llegan a la misma operación atómica y clave financiera', async () => {
    const h = harness();
    const results = await Promise.all(Array.from({ length: 12 }, async () => h.webhook(await signedRequest())));
    expect(results.every((result) => result.status === 200)).toBe(true);
    expect(new Set(h.applications.map((application) => application.p_event_id)).size).toBe(1);
  });
  it('rechaza ID distinto en URL y body firmado', async () => {
    const h = harness();
    expect((await h.webhook(await signedRequest({ body: { type: 'payment', data: { id: 2 } } }))).status).toBe(400);
    expect(h.applications).toHaveLength(0);
  });
});

describe('configuración y creación server-to-server', () => {
  it('guarda cifrado y desactiva credenciales nuevas sin exponerlas en respuesta', async () => {
    const h = harness();
    const result = await h.gateway(gatewayRequest({ action: 'admin-save', restaurantId, environment: 'live', ...secrets, expectedVersion: 3 }));
    expect(result.status).toBe(200);
    const save = h.calls.find((call) => call.path.endsWith('/save_gateway_config'));
    expect(save?.body).toMatchObject({ p_enabled: false, p_verified: false, p_expected_version: 3 });
    expect(save?.body.p_credentials_encrypted).not.toContain(secrets.accessToken);
    const text = await result.text();
    expect(text).not.toContain(secrets.accessToken);
    expect(text).not.toContain('credentials_encrypted');
  });
  it('deniega administrador ajeno antes de leer secretos', async () => {
    const h = harness({ adminAllowed: false });
    const result = await h.gateway(gatewayRequest({ action: 'admin-read', restaurantId }));
    expect(result.status).toBe(403);
    expect(h.calls).toHaveLength(1);
  });
  it('no activa test ni cuenta sin declaración contractual', async () => {
    const h = harness();
    expect((await h.gateway(gatewayRequest({ action: 'admin-activate', restaurantId, expectedVersion: 3, enabled: true }))).status).toBe(422);
    config.environment = 'test';
    expect((await h.gateway(gatewayRequest({ action: 'admin-activate', restaurantId, expectedVersion: 3, enabled: true, productionPermissionsConfirmed: true }))).status).toBe(422);
  });
  it('no activa credenciales cuyo webhook aún no fue autenticado', async () => {
    config.webhook_verified_at = null;
    const h = harness();
    expect((await h.gateway(gatewayRequest({ action: 'admin-activate', restaurantId, expectedVersion: 3, enabled: true, productionPermissionsConfirmed: true }))).status).toBe(422);
    expect(h.calls.some((call) => call.path.startsWith('https://api.mercadopago.com'))).toBe(false);
  });
  it('prueba segura rechaza credenciales live antes de generar enlace', async () => {
    const h = harness();
    expect((await h.gateway(gatewayRequest({ action: 'admin-safe-test', restaurantId, expectedVersion: 3 }))).status).toBe(422);
    expect(h.calls.some((call) => call.path.startsWith('https://api.mercadopago.com'))).toBe(false);
  });
  it('prueba segura genera solo sandbox y registra la URL de notificación oficial', async () => {
    config.environment = 'test';
    config.credentials_encrypted = await encryptCredentials(secrets, key, `${restaurantId}:test`);
    const h = harness({ account: { id: 999, site_id: 'MPE', status: { site_status: 'active' }, tags: ['test_user'] } });
    const result = await h.gateway(gatewayRequest({ action: 'admin-safe-test', restaurantId, expectedVersion: 3 }));
    expect(result.status).toBe(200);
    const payload = await result.json() as { sandboxCheckoutUrl: string };
    expect(payload.sandboxCheckoutUrl).toMatch(/^https:\/\/sandbox\.mercadopago\.com\.pe\//);
    const creation = h.calls.find((call) => call.path.endsWith('/checkout/preferences'));
    expect(creation?.body.notification_url).toContain(`restaurant_id=${restaurantId}&version=3`);
  });
  it('comprobar conexión crea una preferencia sin cobro y nunca publica su URL live', async () => {
    const h = harness();
    const result = await h.gateway(gatewayRequest({ action: 'admin-check', restaurantId, expectedVersion: 3 }));
    expect(result.status).toBe(200);
    const payload = await result.text();
    expect(payload).not.toContain('pref_id');
    expect(payload).toContain('account_and_checkout_creation_only');
    expect(h.calls.some((call) => call.path.endsWith('/v1/payments'))).toBe(false);
  });
  it('crea checkout con total del servidor y referencia del intento, no del navegador', async () => {
    const h = harness();
    const result = await h.gateway(gatewayRequest({ action: 'create', orderId, method: 'card', amount: 1, restaurantId: orderId }));
    expect(result.status).toBe(200);
    const creation = h.calls.find((call) => call.path === 'https://api.mercadopago.com/checkout/preferences');
    expect(creation?.body.external_reference).toBe(attemptId);
    expect(creation?.body.items).toEqual([{ id: attemptId, title: 'Pedido SUYA SUYA-LOCALTEST', quantity: 1, currency_id: 'PEN', unit_price: 20 }]);
    const payload = await result.text();
    expect(payload).not.toContain('claim_token');
    expect(payload).not.toContain('credentials_encrypted');
  });
  it('crea un checkout sandbox ligado al pedido con cuenta test verificada, sin activar producción', async () => {
    config.environment = 'test';
    config.enabled = false;
    config.production_permissions_confirmed = false;
    config.webhook_verified_at = null;
    config.credentials_encrypted = await encryptCredentials(secrets, key, `${restaurantId}:test`);
    const h = harness({ attemptRow: { ...attempt, environment: 'test' } });
    const result = await h.gateway(gatewayRequest({ action: 'create', orderId, method: 'card' }));
    expect(result.status).toBe(200);
    const payload = await result.json() as { paymentIntent: JsonObject };
    expect(payload.paymentIntent.checkout_url).toMatch(/^https:\/\/sandbox\.mercadopago\.com\.pe\//);
    const prepare = h.calls.find((call) => call.path.endsWith('/prepare_gateway_payment'));
    expect(prepare?.authorization).toBe('Bearer local-user-jwt');
    const creation = h.calls.find((call) => call.path === 'https://api.mercadopago.com/checkout/preferences');
    expect(creation?.body.external_reference).toBe(attemptId);
    expect(creation?.body.metadata).toMatchObject({ suya_order_id: orderId, suya_payment_attempt_id: attemptId });
  });
  it('respeta la denegación SQL de sandbox a un actor ordinario antes de leer credenciales', async () => {
    config.environment = 'test';
    const h = harness({ prepareAllowed: false });
    const result = await h.gateway(gatewayRequest({ action: 'create', orderId, method: 'card' }));
    expect(result.status).toBe(403);
    expect(h.calls).toHaveLength(1);
    expect(h.calls[0].path).toContain('/prepare_gateway_payment');
    expect(h.calls[0].authorization).toBe('Bearer local-user-jwt');
  });
  it('bloquea sandbox sin credenciales comprobadas', async () => {
    config.environment = 'test';
    config.verified_at = null;
    const h = harness({ attemptRow: { ...attempt, environment: 'test' } });
    expect((await h.gateway(gatewayRequest({ action: 'create', orderId, method: 'card' }))).status).toBe(503);
    expect(h.calls.some((call) => call.path.startsWith('https://api.mercadopago.com'))).toBe(false);
  });
  it('reutiliza checkout existente sin crear otra preferencia', async () => {
    const h = harness({ attemptRow: { ...attempt, provider_reference: 'existing', checkout_url: 'https://www.mercadopago.com.pe/checkout?pref_id=existing' } });
    expect((await h.gateway(gatewayRequest({ action: 'create', orderId, method: 'card' }))).status).toBe(200);
    expect(h.calls.some((call) => call.path.startsWith('https://api.mercadopago.com'))).toBe(false);
  });
  it('bloquea checkout mientras cuenta está desactivada', async () => {
    config.enabled = false;
    const h = harness();
    expect((await h.gateway(gatewayRequest({ action: 'create', orderId, method: 'card' }))).status).toBe(503);
    expect(h.calls.some((call) => call.path.startsWith('https://api.mercadopago.com'))).toBe(false);
  });
  it('la conciliación vuelve a consultar la transacción oficial y no acepta un estado del administrador', async () => {
    const h = harness({ financial: payment({ status: 'pending', date_approved: null }) });
    const result = await h.gateway(gatewayRequest({ action: 'admin-reconcile', restaurantId, attemptId, transactionId: '12345678', expectedVersion: 3, status: 'approved' }));
    expect(result.status).toBe(200);
    expect(h.applications[0].p_state).toBe('pending');
  });
  it('rechaza CORS ajeno y conciliación programada sin secreto', async () => {
    const h = harness();
    expect((await h.gateway(gatewayRequest({ action: 'admin-read', restaurantId }, 'https://attacker.test'))).status).toBe(403);
    expect((await h.gateway(gatewayRequest({ action: 'reconcile' }))).status).toBe(401);
  });
  it('no usa credenciales de otro país ni entorno', async () => {
    const provider = new MercadoPagoProvider(vi.fn<typeof fetch>(async () => response({ id: 999, site_id: 'MLA', tags: [], status: { site_status: 'active' } })));
    await expect(provider.checkAccount(secrets, 'live')).rejects.toThrow();
  });
});
