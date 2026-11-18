import { object, PaymentError, penCents, stringValue, timedFetch, uuid, type GatewayAttempt, type GatewayConfig, type GatewayCredentials, type GatewayState, type JsonObject, type PaymentEnvironment, type PaymentProvider, type VerifiedPayment } from './payment-provider.ts';

const API = 'https://api.mercadopago.com';
const CHECKOUT_HOSTS = new Set(['www.mercadopago.com.pe', 'mercadopago.com.pe', 'sandbox.mercadopago.com.pe']);

export function validCheckoutUrl(value: unknown, environment: PaymentEnvironment): value is string {
  if (typeof value !== 'string' || value.length > 4000) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port && CHECKOUT_HOSTS.has(url.hostname) &&
      (environment === 'live' ? url.hostname !== 'sandbox.mercadopago.com.pe' : url.hostname === 'sandbox.mercadopago.com.pe');
  } catch { return false; }
}

export class MercadoPagoProvider implements PaymentProvider {
  readonly name = 'mercadopago';
  private readonly fetcher: typeof fetch;
  constructor(fetcher: typeof fetch = fetch) { this.fetcher = fetcher; }

  private async request(path: string, credentials: GatewayCredentials, body?: JsonObject): Promise<JsonObject> {
    const response = await timedFetch(this.fetcher, `${API}${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { Authorization: `Bearer ${credentials.accessToken}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok) {
      const status = response.status === 401 || response.status === 403 ? 422 : 502;
      throw new PaymentError(status === 422 ? 'Mercado Pago no autorizó estas credenciales o este cobro. Revisa los permisos de tu cuenta.' : 'Mercado Pago no pudo responder. Reintenta la comprobación.', status);
    }
    try { return object(await response.json()); }
    catch { throw new PaymentError('Mercado Pago devolvió una respuesta inválida.', 502); }
  }

  async checkAccount(credentials: GatewayCredentials, environment: PaymentEnvironment): Promise<string> {
    const account = await this.request('/users/me', credentials);
    const id = stringValue(account.id);
    const tags = Array.isArray(account.tags) ? account.tags : [];
    const isTest = tags.includes('test_user') || credentials.accessToken.startsWith('TEST-');
    if (!/^\d+$/.test(id) || account.site_id !== 'MPE' || object(account.status).site_status !== 'active') {
      throw new PaymentError('La cuenta debe estar activa y pertenecer a Mercado Pago Perú.', 422);
    }
    if ((environment === 'test') !== isTest) throw new PaymentError('Las credenciales no corresponden al entorno elegido.', 422);
    return id;
  }

  async probeCheckout(config: GatewayConfig, credentials: GatewayCredentials, customerOrigin: string, notificationUrl?: string): Promise<{ reference: string; url: string }> {
    // Crear una preferencia no debita dinero. La URL live de esta sonda nunca se entrega al cliente.
    const result = await this.request('/checkout/preferences', credentials, {
      items: [{ id: 'suya-connection-check', title: 'SUYA: comprobación de conexión, sin cobro automático', quantity: 1, currency_id: 'PEN', unit_price: 1 }],
      external_reference: `SUYA-CONNECTION-${crypto.randomUUID()}`,
      ...(notificationUrl ? { notification_url: notificationUrl } : {}),
      expires: true,
      expiration_date_to: new Date(Date.now() + 600_000).toISOString(),
      back_urls: { success: customerOrigin, failure: customerOrigin, pending: customerOrigin },
      metadata: { source: 'suya_connection_probe', environment: config.environment },
    });
    const url = config.environment === 'test' ? result.sandbox_init_point : result.init_point;
    if (!validCheckoutUrl(url, config.environment) || !stringValue(result.id)) throw new PaymentError('La cuenta no devolvió un checkout válido para el entorno elegido.', 422);
    return { reference: stringValue(result.id), url };
  }

  async createCheckout(attempt: GatewayAttempt, config: GatewayConfig, credentials: GatewayCredentials, notificationUrl: string, customerOrigin: string): Promise<{ reference: string; url: string }> {
    if (!Number.isSafeInteger(attempt.amount_cents) || attempt.amount_cents <= 0) throw new PaymentError('Importe de pedido inválido.');
    const existing = await this.request(`/checkout/preferences/search?external_reference=${encodeURIComponent(attempt.attempt_id)}&limit=5`, credentials);
    const preferences = Array.isArray(existing.elements) ? existing.elements : [];
    let preference: JsonObject | undefined;
    for (const candidate of preferences) {
      const row = object(candidate);
      if (row.external_reference === attempt.attempt_id && stringValue(row.id)) {
        const detail = await this.request(`/checkout/preferences/${encodeURIComponent(stringValue(row.id))}`, credentials);
        const metadata = object(detail.metadata);
        const items = Array.isArray(detail.items) ? detail.items : [];
        const item = items.length === 1 ? object(items[0]) : {};
        if (metadata.suya_order_id === attempt.order_id && metadata.suya_payment_attempt_id === attempt.attempt_id &&
          Number(metadata.suya_config_version) === config.version && stringValue(detail.collector_id) === config.collector_id &&
          item.currency_id === 'PEN' && Number(item.quantity) === 1 && penCents(item.unit_price) === attempt.amount_cents) {
          preference = detail;
          break;
        }
      }
    }
    if (!preference) {
      const returnUrl = `${customerOrigin}/orders/${encodeURIComponent(attempt.order_id)}`;
      preference = await this.request('/checkout/preferences', credentials, {
        items: [{ id: attempt.attempt_id, title: `Pedido SUYA ${attempt.checkout_reference}`, quantity: 1, currency_id: 'PEN', unit_price: attempt.amount_cents / 100 }],
        external_reference: attempt.attempt_id,
        metadata: { suya_order_id: attempt.order_id, suya_payment_attempt_id: attempt.attempt_id, suya_config_version: config.version },
        notification_url: notificationUrl,
        back_urls: { success: returnUrl, failure: returnUrl, pending: returnUrl },
        auto_return: 'approved',
        expires: true,
        expiration_date_to: attempt.expires_at,
        statement_descriptor: 'SUYA DELIVERY',
      });
    }
    const reference = stringValue(preference.id);
    const checkoutUrl = config.environment === 'test' ? preference.sandbox_init_point : preference.init_point;
    if (!reference || !validCheckoutUrl(checkoutUrl, config.environment) || stringValue(preference.collector_id) !== config.collector_id) {
      throw new PaymentError('Mercado Pago no devolvió un enlace de pago válido para la cuenta receptora.', 502);
    }
    return { reference, url: checkoutUrl };
  }

  getPayment(id: string, _config: GatewayConfig, credentials: GatewayCredentials): Promise<JsonObject> {
    if (!/^\d{1,32}$/.test(id)) throw new PaymentError('Identificador de transacción inválido.');
    return this.request(`/v1/payments/${encodeURIComponent(id)}`, credentials);
  }

  async searchPayments(attemptId: string, credentials: GatewayCredentials): Promise<string[]> {
    if (!uuid(attemptId)) throw new PaymentError('Intento inválido.');
    const result = await this.request(`/v1/payments/search?external_reference=${encodeURIComponent(attemptId)}&sort=date_created&criteria=desc&limit=20`, credentials);
    if (!Array.isArray(result.results)) throw new PaymentError('La conciliación no devolvió una lista válida.', 502);
    return result.results.map((item) => stringValue(object(item).id)).filter((id) => /^\d{1,32}$/.test(id));
  }

  verifyPayment(payment: JsonObject, attempt: GatewayAttempt, config: GatewayConfig): VerifiedPayment {
    const transactionId = stringValue(payment.id);
    const metadata = object(payment.metadata);
    if (!/^\d{1,32}$/.test(transactionId) || payment.external_reference !== attempt.attempt_id ||
      metadata.suya_order_id !== attempt.order_id || metadata.suya_payment_attempt_id !== attempt.attempt_id ||
      Number(metadata.suya_config_version) !== attempt.config_version || attempt.config_version !== config.version ||
      stringValue(payment.collector_id) !== config.collector_id || payment.live_mode !== (config.environment === 'live')) {
      throw new PaymentError('La transacción no pertenece a este pedido, receptor o entorno.', 422);
    }
    if (payment.currency_id !== 'PEN') throw new PaymentError('La moneda de la transacción no coincide con el pedido.', 422);
    const amountCents = penCents(payment.transaction_amount);
    const refundedAmountCents = penCents(payment.transaction_amount_refunded ?? 0);
    if (refundedAmountCents > amountCents || (payment.status === 'refunded' && refundedAmountCents <= 0)) {
      throw new PaymentError('El proveedor devolvió una devolución financiera inconsistente.', 422);
    }
    const states: Record<string, GatewayState> = {
      approved: refundedAmountCents >= amountCents && amountCents > 0 ? 'refunded' : refundedAmountCents > 0 ? 'partial_refund' : 'approved', pending: 'pending', in_process: 'pending', in_mediation: 'disputed', authorized: 'pending', rejected: 'rejected', cancelled: 'cancelled', refunded: 'refunded', charged_back: 'disputed',
    };
    const state = states[stringValue(payment.status)];
    if (!state) throw new PaymentError('Estado de transacción desconocido. Se requiere conciliación.', 422);
    if (state === 'approved' && payment.captured !== true) throw new PaymentError('La transacción todavía no fue capturada.', 422);
    const paidAt = typeof payment.date_approved === 'string' ? payment.date_approved : null;
    const updated = stringValue(payment.date_last_updated);
    if ((state === 'approved' && (!paidAt || !Number.isFinite(Date.parse(paidAt)))) || !Number.isFinite(Date.parse(updated))) {
      throw new PaymentError('La transacción no contiene fechas financieras válidas.', 422);
    }
    return {
      transactionId, attemptId: attempt.attempt_id, orderId: attempt.order_id, amountCents, currency: 'PEN', state, paidAt,
      eventId: `mp:${transactionId}:${updated}:${state}:${refundedAmountCents}`,
      metadata: { collector_id: config.collector_id, live_mode: payment.live_mode, external_reference: attempt.attempt_id, order_id: attempt.order_id, config_version: config.version, refunded_amount_cents: refundedAmountCents, provider_updated_at: updated },
    };
  }
}
