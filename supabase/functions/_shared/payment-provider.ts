/** Contrato independiente del proveedor. Los importes internos siempre son céntimos PEN. */
export type JsonObject = Record<string, unknown>;
export type PaymentEnvironment = 'test' | 'live';
export type GatewayState = 'approved' | 'pending' | 'rejected' | 'cancelled' | 'refunded' | 'partial_refund' | 'disputed';

export interface GatewayCredentials {
  accessToken: string;
  webhookSecret: string;
}

export interface GatewayConfig {
  restaurant_id: string;
  provider: string;
  environment: PaymentEnvironment;
  enabled: boolean;
  verified_at: string | null;
  webhook_verified_at: string | null;
  collector_id: string | null;
  credentials_encrypted: string;
  version: number;
  production_permissions_confirmed: boolean;
}

export interface GatewayAttempt extends JsonObject {
  attempt_id: string;
  order_id: string;
  restaurant_id: string;
  method: string;
  status: string;
  amount: number;
  amount_cents: number;
  currency: string;
  expires_at: string;
  checkout_reference: string;
  provider_reference: string | null;
  checkout_url: string | null;
  config_version: number;
  claim_token?: string | null;
}

export interface VerifiedPayment {
  transactionId: string;
  attemptId: string;
  orderId: string;
  amountCents: number;
  currency: string;
  state: GatewayState;
  paidAt: string | null;
  eventId: string;
  metadata: JsonObject;
}

export interface PaymentProvider {
  readonly name: string;
  checkAccount(credentials: GatewayCredentials, environment: PaymentEnvironment): Promise<string>;
  createCheckout(attempt: GatewayAttempt, config: GatewayConfig, credentials: GatewayCredentials, notificationUrl: string, customerOrigin: string): Promise<{ reference: string; url: string }>;
  getPayment(id: string, config: GatewayConfig, credentials: GatewayCredentials): Promise<JsonObject>;
  searchPayments(attemptId: string, credentials: GatewayCredentials): Promise<string[]>;
  verifyPayment(payment: JsonObject, attempt: GatewayAttempt, config: GatewayConfig): VerifiedPayment;
}

export class PaymentError extends Error {
  readonly status: number;
  constructor(message: string, status = 422) {
    super(message);
    this.name = 'PaymentError';
    this.status = status;
  }
}

export function object(value: unknown): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new PaymentError('Respuesta de pagos inválida.', 502);
  return value as JsonObject;
}

export function firstObject(value: unknown): JsonObject {
  return object(Array.isArray(value) ? value[0] : value);
}

export function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
}

export function uuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

/** Rechaza redondeos ambiguos: 10.001 no puede convertirse silenciosamente en S/10.00. */
export function penCents(value: unknown): number {
  const input = typeof value === 'number' && Number.isFinite(value) ? value.toString() : value;
  if (typeof input !== 'string' || !/^\d+(?:\.\d{1,2})?$/.test(input)) throw new PaymentError('El proveedor devolvió un importe inválido.', 422);
  const [whole, decimal = ''] = input.split('.');
  const cents = Number(whole) * 100 + Number(decimal.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents) || cents < 0) throw new PaymentError('El importe está fuera del rango permitido.', 422);
  return cents;
}

export function readAttempt(value: unknown): GatewayAttempt {
  const row = firstObject(value);
  if (!uuid(row.attempt_id) || !uuid(row.order_id) || !uuid(row.restaurant_id)) throw new PaymentError('No se pudo identificar el intento de pago.', 502);
  const amountCents = Number(row.amount_cents ?? penCents(row.amount));
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0 || row.currency !== 'PEN') throw new PaymentError('El pedido contiene un importe inválido.', 422);
  return { ...row, amount_cents: amountCents } as GatewayAttempt;
}

export function readConfig(value: unknown): GatewayConfig {
  const row = firstObject(value);
  if (!uuid(row.restaurant_id) || row.provider !== 'mercadopago' || !['test', 'live'].includes(stringValue(row.environment)) || !Number.isSafeInteger(row.version)) {
    throw new PaymentError('La cuenta receptora no está configurada.', 503);
  }
  if (typeof row.credentials_encrypted !== 'string' || !row.credentials_encrypted) throw new PaymentError('Faltan las credenciales de la cuenta receptora.', 503);
  return row as unknown as GatewayConfig;
}

export async function timedFetch(fetcher: typeof fetch, input: string | URL, init: RequestInit = {}): Promise<Response> {
  try {
    return await fetcher(input, { ...init, redirect: 'error', signal: AbortSignal.timeout(8_000) });
  } catch {
    throw new PaymentError('No pudimos conectar con el servicio de pagos. Puedes reintentar sin crear otro pedido.', 503);
  }
}
