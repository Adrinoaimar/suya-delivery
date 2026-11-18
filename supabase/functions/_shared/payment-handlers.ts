import { decryptCredentials, encryptCredentials, verifyMercadoPagoSignature } from './payment-crypto.ts';
import { MercadoPagoProvider, validCheckoutUrl } from './payment-mercadopago.ts';
import { firstObject, object, PaymentError, readAttempt, readConfig, stringValue, timedFetch, uuid, type GatewayAttempt, type GatewayConfig, type GatewayCredentials, type JsonObject } from './payment-provider.ts';

export interface PaymentRuntime {
  supabaseUrl: string;
  anonKey: string;
  serviceRoleKey: string;
  credentialsKey: string;
  allowedOrigins: string[];
  customerOrigin: string;
  reconcileToken?: string;
  fetcher?: typeof fetch;
}

class Database {
  private readonly runtime: PaymentRuntime;
  private readonly fetcher: typeof fetch;
  constructor(runtime: PaymentRuntime) { this.runtime = runtime; this.fetcher = runtime.fetcher ?? fetch; }
  async rpc(name: string, body: JsonObject, authorization?: string): Promise<unknown> {
    const response = await timedFetch(this.fetcher, `${this.runtime.supabaseUrl}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: {
        apikey: authorization ? this.runtime.anonKey : this.runtime.serviceRoleKey,
        Authorization: authorization ?? `Bearer ${this.runtime.serviceRoleKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new PaymentError(name === 'require_gateway_admin' ? 'No tienes permiso para configurar los cobros de este restaurante.' : 'No se pudo guardar o consultar el pago. Reintenta; conserva el mismo pedido.', response.status >= 500 ? 503 : 403);
    try { return await response.json(); }
    catch { throw new PaymentError('La base de pagos devolvió una respuesta inválida.', 502); }
  }
  async config(restaurantId: string, version?: number): Promise<GatewayConfig> {
    return readConfig(await this.rpc('get_gateway_config_secret', { p_restaurant_id: restaurantId, p_version: version ?? null }));
  }
}

function json(body: JsonObject, status = 200, origin?: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json', 'Cache-Control': 'no-store',
      ...(origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' } : {}),
    },
  });
}
function failure(error: unknown, origin?: string | null): Response {
  return error instanceof PaymentError ? json({ error: error.message }, error.status, origin) : json({ error: 'No se pudo completar la operación de pagos. Reintenta de forma segura.' }, 500, origin);
}
async function bodyObject(request: Request): Promise<JsonObject> {
  const text = await request.text();
  if (text.length > 16_384) throw new PaymentError('La solicitud de pagos es demasiado grande.', 413);
  try { return object(JSON.parse(text)); }
  catch { throw new PaymentError('La solicitud de pagos no contiene datos válidos.', 400); }
}
function ready(runtime: PaymentRuntime): void {
  if (!runtime.supabaseUrl || !runtime.anonKey || !runtime.serviceRoleKey || !runtime.credentialsKey) throw new PaymentError('El servidor de cobros todavía no está configurado.', 503);
  const origin = new URL(runtime.customerOrigin);
  if (origin.protocol !== 'https:' || origin.origin !== runtime.customerOrigin) throw new PaymentError('El origen de retorno de pagos no está configurado correctamente.', 503);
}
function actorAuthorization(request: Request, runtime: PaymentRuntime): string {
  const incoming = request.headers.get('authorization');
  return incoming?.startsWith('Bearer ') ? incoming : `Bearer ${runtime.anonKey}`;
}
function redactedConfig(config: GatewayConfig, runtime: PaymentRuntime): JsonObject {
  return {
    restaurant_id: config.restaurant_id, provider: config.provider, environment: config.environment,
    enabled: config.enabled, verified_at: config.verified_at, collector_id: config.collector_id,
    version: config.version, production_permissions_confirmed: config.production_permissions_confirmed,
    has_credentials: true, automatic: true, webhook_verified_at: config.webhook_verified_at,
    webhook_url: `${runtime.supabaseUrl}/functions/v1/payment-webhook?restaurant_id=${encodeURIComponent(config.restaurant_id)}&version=${config.version}`,
  };
}
function publicIntent(row: JsonObject): JsonObject {
  const fields = ['attempt_id', 'order_id', 'method', 'status', 'amount', 'amount_cents', 'currency', 'checkout_reference', 'expires_at', 'provider', 'provider_reference', 'checkout_url', 'qr_payload', 'gateway_state', 'environment'];
  return Object.fromEntries(fields.filter((field) => field in row).map((field) => [field, row[field]]));
}
async function credentials(config: GatewayConfig, runtime: PaymentRuntime): Promise<GatewayCredentials> {
  return decryptCredentials(config.credentials_encrypted, runtime.credentialsKey, `${config.restaurant_id}:${config.environment}`);
}
function expectedVersion(body: JsonObject): number | null {
  if (body.expectedVersion == null) return null;
  if (!Number.isSafeInteger(body.expectedVersion) || Number(body.expectedVersion) < 1) throw new PaymentError('Actualiza la configuración antes de guardarla.', 409);
  return Number(body.expectedVersion);
}
async function saveConfig(db: Database, config: GatewayConfig, verified: boolean, enabled: boolean, permissions: boolean, version: number | null): Promise<GatewayConfig> {
  return readConfig(await db.rpc('save_gateway_config', {
    p_restaurant_id: config.restaurant_id, p_environment: config.environment,
    p_credentials_encrypted: config.credentials_encrypted, p_collector_id: config.collector_id,
    p_verified: verified, p_enabled: enabled,
    p_production_permissions_confirmed: permissions, p_expected_version: version,
  }));
}
async function applyPayment(db: Database, provider: MercadoPagoProvider, config: GatewayConfig, attempt: GatewayAttempt, secrets: GatewayCredentials, transactionId: string): Promise<unknown> {
  const raw = await provider.getPayment(transactionId, config, secrets);
  const payment = provider.verifyPayment(raw, attempt, config);
  return db.rpc('apply_gateway_payment', {
    p_provider: provider.name, p_event_id: payment.eventId, p_attempt_id: payment.attemptId,
    p_transaction_id: payment.transactionId, p_amount_cents: payment.amountCents, p_currency: payment.currency,
    p_state: payment.state, p_paid_at: payment.paidAt, p_metadata: payment.metadata,
  });
}
async function reconcileAttempt(db: Database, provider: MercadoPagoProvider, runtime: PaymentRuntime, attempt: GatewayAttempt, transactionId?: string, deadline = Date.now() + 45_000): Promise<unknown[]> {
  const config = await db.config(attempt.restaurant_id, attempt.config_version);
  const secrets = await credentials(config, runtime);
  const ids = transactionId ? [transactionId] : await provider.searchPayments(attempt.attempt_id, secrets);
  const results: unknown[] = [];
  for (const id of ids) {
    if (Date.now() > deadline) throw new PaymentError('La conciliación continuará en el siguiente ciclo.', 503);
    results.push(await applyPayment(db, provider, config, attempt, secrets, id));
  }
  return results;
}

/** Factories con dependencias explícitas: las mismas funciones se ejecutan en Edge y en pruebas locales. */
export function createGatewayHandler(runtime: PaymentRuntime): (request: Request) => Promise<Response> {
  const db = new Database(runtime);
  const provider = new MercadoPagoProvider(runtime.fetcher ?? fetch);
  const publicConfig = (config: GatewayConfig) => redactedConfig(config, runtime);
  return async (request) => {
    const origin = request.headers.get('origin');
    if (origin && !runtime.allowedOrigins.includes(origin)) return json({ error: 'Origen no permitido.' }, 403);
    if (request.method === 'OPTIONS') return json({}, 200, origin);
    if (request.method !== 'POST') return json({ error: 'Método no permitido.' }, 405, origin);
    try {
      ready(runtime);
      const body = await bodyObject(request);
      const action = stringValue(body.action);
      const authorization = actorAuthorization(request, runtime);
      if (action === 'availability') {
        if (!uuid(body.restaurantId)) throw new PaymentError('Restaurante inválido.', 400);
        return json({ availability: await db.rpc('gateway_config_public', { p_restaurant_id: body.restaurantId }, authorization) }, 200, origin);
      }
      if (action === 'create') {
        if (!uuid(body.orderId) || !['card', 'yape'].includes(stringValue(body.method))) throw new PaymentError('Pedido o método de pago inválido.', 400);
        const intent = readAttempt(await db.rpc('prepare_gateway_payment', {
          p_order_id: body.orderId, p_method: body.method,
          p_guest_access_token: typeof body.guestAccessToken === 'string' ? body.guestAccessToken : null,
        }, authorization));
        const config = await db.config(intent.restaurant_id, intent.config_version);
        // El acceso sandbox se decide en prepare_gateway_payment con el JWT del actor:
        // exige platform_admin y propiedad del pedido. Nunca habilita cobros de clientes.
        if (!config.verified_at || (config.environment === 'live' &&
          (!config.enabled || !config.webhook_verified_at || !config.production_permissions_confirmed))) {
          throw new PaymentError(config.environment === 'test'
            ? 'Comprueba primero las credenciales de prueba de la cuenta receptora.'
            : 'Esta cuenta todavía no está habilitada para cobros reales.', 503);
        }
        if (intent.status === 'authorized' || (intent.provider_reference && validCheckoutUrl(intent.checkout_url, config.environment))) return json({ paymentIntent: publicIntent(intent) }, 200, origin);
        if (!intent.claim_token) throw new PaymentError('Ya se está preparando este cobro. Reintenta en unos segundos.', 409);
        const notification = new URL(`${runtime.supabaseUrl}/functions/v1/payment-webhook`);
        notification.searchParams.set('restaurant_id', intent.restaurant_id);
        notification.searchParams.set('version', String(config.version));
        const checkout = await provider.createCheckout(intent, config, await credentials(config, runtime), notification.toString(), runtime.customerOrigin);
        const bound = firstObject(await db.rpc('bind_gateway_checkout', { p_attempt_id: intent.attempt_id, p_claim_token: intent.claim_token, p_provider_reference: checkout.reference, p_checkout_url: checkout.url }));
        return json({ paymentIntent: publicIntent(bound) }, 200, origin);
      }
      if (action === 'status') {
        if (!uuid(body.orderId)) throw new PaymentError('Pedido inválido.', 400);
        const status = await db.rpc('get_gateway_payment_intent', { p_order_id: body.orderId, p_guest_access_token: typeof body.guestAccessToken === 'string' ? body.guestAccessToken : null }, authorization);
        return json({ paymentIntent: status == null || (Array.isArray(status) && !status.length) ? null : publicIntent(firstObject(status)) }, 200, origin);
      }
      if (action === 'reconcile') {
        const token = runtime.reconcileToken;
        if (!token || token.length < 32 || request.headers.get('authorization') !== `Bearer ${token}`) throw new PaymentError('No autorizado.', 401);
        const batch = await db.rpc('list_gateway_reconciliation_batch', {});
        if (!Array.isArray(batch)) throw new PaymentError('La cola de conciliación no está disponible.', 502);
        let processed = 0;
        let failed = 0;
        let deferred = 0;
        const deadline = Date.now() + 45_000;
        const picked = batch.slice(0, 20);
        for (let index = 0; index < picked.length; index++) {
          if (Date.now() > deadline) { deferred = picked.length - index; break; }
          try { await reconcileAttempt(db, provider, runtime, readAttempt(picked[index]), undefined, deadline); processed++; }
          catch { failed++; }
        }
        return json({ processed, failed, deferred }, failed || deferred ? 207 : 200, origin);
      }
      if (!action.startsWith('admin-') || !uuid(body.restaurantId)) throw new PaymentError('Acción o restaurante inválido.', 400);
      await db.rpc('require_gateway_admin', { p_restaurant_id: body.restaurantId }, authorization);
      if (action === 'admin-read') {
        const raw = await db.rpc('get_gateway_config_secret', { p_restaurant_id: body.restaurantId, p_version: null });
        const config = raw == null || (Array.isArray(raw) && !raw.length) ? null : readConfig(raw);
        const payments = await db.rpc('list_gateway_payments', { p_restaurant_id: body.restaurantId }, authorization);
        return json({ config: config ? publicConfig(config) : null, payments }, 200, origin);
      }
      if (action === 'admin-save') {
        if (!['test', 'live'].includes(stringValue(body.environment)) || typeof body.accessToken !== 'string' || typeof body.webhookSecret !== 'string' ||
          !/^(?:APP_USR-|TEST-)[A-Za-z0-9_-]{12,500}$/.test(body.accessToken.trim()) || !/^[A-Za-z0-9_-]{16,500}$/.test(body.webhookSecret.trim())) {
          throw new PaymentError('Introduce el Access Token y la firma secreta Webhook oficiales para el entorno elegido.', 400);
        }
        const encrypted = await encryptCredentials({ accessToken: body.accessToken.trim(), webhookSecret: body.webhookSecret.trim() }, runtime.credentialsKey, `${body.restaurantId}:${body.environment}`);
        const config = await saveConfig(db, {
          restaurant_id: body.restaurantId, provider: 'mercadopago', environment: body.environment as 'test' | 'live', enabled: false,
          verified_at: null, webhook_verified_at: null, collector_id: null, credentials_encrypted: encrypted, version: 1, production_permissions_confirmed: false,
        }, false, false, false, expectedVersion(body));
        return json({ config: publicConfig(config) }, 200, origin);
      }
      const config = await db.config(body.restaurantId);
      if (expectedVersion(body) !== config.version) throw new PaymentError('La configuración cambió. Actualiza antes de continuar.', 409);
      if (action === 'admin-check' || action === 'admin-safe-test') {
        if (action === 'admin-safe-test' && config.environment !== 'test') throw new PaymentError('La prueba segura requiere credenciales y cuentas de prueba. No se generan cobros reales desde este botón.', 422);
        const secrets = await credentials(config, runtime);
        const collectorId = await provider.checkAccount(secrets, config.environment);
        const notificationUrl = `${runtime.supabaseUrl}/functions/v1/payment-webhook?restaurant_id=${encodeURIComponent(config.restaurant_id)}&version=${config.version}`;
        const probe = await provider.probeCheckout({ ...config, collector_id: collectorId }, secrets, runtime.customerOrigin, action === 'admin-safe-test' ? notificationUrl : undefined);
        const saved = await saveConfig(db, { ...config, collector_id: collectorId }, true, false, false, config.version);
        return json({ config: publicConfig(saved), connection: 'verified', proof: 'account_and_checkout_creation_only',
          ...(action === 'admin-safe-test' ? { sandboxCheckoutUrl: probe.url, sandboxPreferenceId: probe.reference } : {}),
        }, 200, origin);
      }
      if (action === 'admin-activate') {
        if (typeof body.enabled !== 'boolean') throw new PaymentError('Selecciona si deseas activar o desactivar los cobros.', 400);
        if (!body.enabled) return json({ config: publicConfig(await saveConfig(db, config, Boolean(config.verified_at), false, config.production_permissions_confirmed, config.version)) }, 200, origin);
        if (config.environment !== 'live' || !config.verified_at || !config.webhook_verified_at || body.productionPermissionsConfirmed !== true) throw new PaymentError('Comprueba la cuenta de producción, valida una notificación firmada oficial y confirma que el titular está habilitado para cobrar las ventas de este restaurante.', 422);
        const secrets = await credentials(config, runtime);
        const collectorId = await provider.checkAccount(secrets, 'live');
        await provider.probeCheckout({ ...config, collector_id: collectorId }, secrets, runtime.customerOrigin);
        return json({ config: publicConfig(await saveConfig(db, { ...config, collector_id: collectorId }, true, true, true, config.version)) }, 200, origin);
      }
      if (action === 'admin-reconcile') {
        if (!uuid(body.attemptId) || (body.transactionId != null && !/^\d{1,32}$/.test(stringValue(body.transactionId)))) throw new PaymentError('Identificador de cobro inválido.', 400);
        const attempt = readAttempt(await db.rpc('get_gateway_attempt', { p_attempt_id: body.attemptId }));
        if (attempt.restaurant_id !== body.restaurantId) throw new PaymentError('Este cobro pertenece a otro restaurante.', 403);
        return json({ results: await reconcileAttempt(db, provider, runtime, attempt, body.transactionId == null ? undefined : stringValue(body.transactionId)) }, 200, origin);
      }
      throw new PaymentError('Acción de cobros no disponible.', 400);
    } catch (error) { return failure(error, origin); }
  };
}

export function createWebhookHandler(runtime: PaymentRuntime): (request: Request) => Promise<Response> {
  const db = new Database(runtime);
  const provider = new MercadoPagoProvider(runtime.fetcher ?? fetch);
  return async (request) => {
    if (request.method !== 'POST') return json({ error: 'Método no permitido.' }, 405);
    try {
      ready(runtime);
      const url = new URL(request.url);
      const restaurantId = url.searchParams.get('restaurant_id');
      const version = Number(url.searchParams.get('version'));
      if (!uuid(restaurantId) || !Number.isSafeInteger(version) || version < 1 || url.searchParams.getAll('restaurant_id').length !== 1 || url.searchParams.getAll('version').length !== 1) throw new PaymentError('Receptor inválido.', 400);
      const config = await db.config(restaurantId, version);
      const secrets = await credentials(config, runtime);
      if (!await verifyMercadoPagoSignature(request, secrets.webhookSecret)) throw new PaymentError('Firma Webhook inválida.', 401);
      await db.rpc('mark_gateway_webhook_verified', { p_restaurant_id: restaurantId, p_version: version });
      const event = await bodyObject(request);
      if (event.type !== 'payment') return json({ received: true });
      const transactionId = url.searchParams.get('data.id') ?? '';
      if (stringValue(object(event.data).id) !== transactionId) throw new PaymentError('La notificación contiene identificadores distintos.', 400);
      // Solo el GET autenticado al proveedor decide el estado financiero; nunca el body.
      const payment = await provider.getPayment(transactionId, config, secrets);
      if (!uuid(payment.external_reference)) return json({ received: true, ignored: 'unrelated_reference' });
      const attempt = readAttempt(await db.rpc('get_gateway_attempt', { p_attempt_id: payment.external_reference }));
      if (attempt.restaurant_id !== restaurantId || attempt.config_version !== version) throw new PaymentError('La transacción no pertenece al receptor configurado.', 422);
      const verified = provider.verifyPayment(payment, attempt, config);
      const result = await db.rpc('apply_gateway_payment', {
        p_provider: provider.name, p_event_id: verified.eventId, p_attempt_id: verified.attemptId,
        p_transaction_id: verified.transactionId, p_amount_cents: verified.amountCents, p_currency: verified.currency,
        p_state: verified.state, p_paid_at: verified.paidAt, p_metadata: verified.metadata,
      });
      return json({ received: true, result });
    } catch (error) { return failure(error); }
  };
}
