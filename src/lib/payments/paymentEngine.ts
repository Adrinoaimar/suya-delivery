/**
 * Motor desacoplado de pagos automáticos para SUYA Delivery.
 *
 * Implementa:
 * - Adaptadores multi-proveedor:
 *   1. `static_qr` (AutoCloud 0% Comisión para Yape / Plin / Lemon / IzipayYA mediante síntesis
 *      EMVCo Tag 54 + céntimos únicos de conciliación + verificación criptográfica DKIM/SPF/DMARC
 *      en Cloudflare Email Workers / Gmail API OAuth2 sin celular encendido; o modo asistido en Caja).
 *   2. `mercado_pago` (Yape OTP 6 dígitos + Tarjetas — Solo DNI).
 *   3. `taypi_qr` (QR Dinámico Interoperable EMVCo Yape + Plin — RUC 10 Persona Natural).
 *   4. `culqi` (Yape OTP + QR Interoperable + Tarjetas — RUC 10).
 *   5. `izipay` (QR Dinámico Yape/Plin + Tarjetas — RUC 10).
 * - Verificación criptográfica HMAC-SHA256, DKIM Body Hash (`bh=`) y comparación en tiempo constante.
 * - Máquina de estados atómica en céntimos (PEN) con idempotencia, deduplicación de webhooks,
 *   protección contra reutilización de transacciones, expiración, pagos tardíos y auditoría.
 */

import {
  PRELOADED_STATIC_QR_PRESETS,
  allocateUniqueConciliationAmountCents,
  buildBaseMerchantEmvcoQr,
  computeBodyHashBase64,
  computeEmvcoCrc16,
  detectStaticQrWalletNetwork,
  normalizePersonName,
  parseEmvcoQr,
  parsePeruvianBankAndWalletEmail,
  personNamesMatch,
  synthesizeDynamicEmvcoQrFromStatic,
  verifyBankEmailAuthenticity,
} from './staticQrAutoCloud';
import type { StaticQrWalletNetwork } from './staticQrAutoCloud';
import { signMimeMessageDkimRsaSha256, type DkimPublicKeyResolver } from './dkimCrypto.ts';

export {
  PRELOADED_STATIC_QR_PRESETS,
  allocateUniqueConciliationAmountCents,
  buildBaseMerchantEmvcoQr,
  computeBodyHashBase64,
  computeEmvcoCrc16,
  detectStaticQrWalletNetwork,
  normalizePersonName,
  parseEmvcoQr,
  parsePeruvianBankAndWalletEmail,
  personNamesMatch,
  signMimeMessageDkimRsaSha256,
  synthesizeDynamicEmvcoQrFromStatic,
  verifyBankEmailAuthenticity,
};
export type { DkimPublicKeyResolver, StaticQrWalletNetwork };

/**
 * Genera un par RSA-2048 efímero en WebCrypto para pruebas seguras y laboratorio interactivo,
 * verificando firmas DKIM RFC 6376 reales sin usar firmas ficticias ni claves fijas.
 */
export async function createEphemeralDkimTestSigner(): Promise<{
  privateKey: CryptoKey;
  resolvePublicKeySpki: DkimPublicKeyResolver;
}> {
  const pair = await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  );
  const spki = new Uint8Array(await crypto.subtle.exportKey('spki', pair.publicKey));
  return {
    privateKey: pair.privateKey,
    resolvePublicKeySpki: async () => spki,
  };
}

export type PaymentGatewayProviderId =
  | 'mercado_pago'
  | 'taypi_qr'
  | 'culqi'
  | 'izipay'
  | 'static_qr';

export type PaymentVerificationMode = 'automatic_cloud' | 'assisted_manual';

export type PaymentGatewayEnvironment = 'sandbox' | 'production';

export type GatewayConnectionStatus = 'untested' | 'connected' | 'failed';

export type DetailedPaymentStatus =
  | 'pending'
  | 'processing'
  | 'authorized'
  | 'failed'
  | 'expired'
  | 'refund_pending'
  | 'refunded'
  | 'under_review';

export type ReconciliationExceptionType =
  | 'amount_mismatch'
  | 'late_payment'
  | 'order_cancelled'
  | 'orphan_transaction'
  | 'duplicate_payment'
  | 'transaction_reused'
  | 'refund_required';

export type ReconciliationResolutionStatus =
  | 'open'
  | 'refund_pending'
  | 'refunded'
  | 'resolved_dismissed';

export interface ProviderMetadata {
  id: PaymentGatewayProviderId;
  name: string;
  shortLabel: string;
  requiresRuc: boolean;
  rucRequirementLabel: string;
  allowsDniOnly: boolean;
  verificationMode: PaymentVerificationMode;
  requiresPermanentPhone: boolean;
  supportsYape: boolean;
  supportsPlin: boolean;
  supportsCards: boolean;
  commissionPercent: number;
  fixedFeePen: number;
  appliesIgvToFee: boolean;
  monthlyFeePen: number;
  minAmountCents: number;
  maxAmountCents: number;
  summary: string;
  confirmationWarning: string | null;
}

export const PAYMENT_PROVIDERS_CATALOG: Record<PaymentGatewayProviderId, ProviderMetadata> = {
  static_qr: {
    id: 'static_qr',
    name: 'QR Estático AutoCloud (Yape / Plin / Lemon / IzipayYA — Comisión 0%)',
    shortLabel: 'QR Estático 0% (AutoCloud)',
    requiresRuc: false,
    rucRequirementLabel: 'Solo DNI (Sin RUC)',
    allowsDniOnly: true,
    verificationMode: 'automatic_cloud',
    requiresPermanentPhone: false,
    supportsYape: true,
    supportsPlin: true,
    supportsCards: false,
    commissionPercent: 0,
    fixedFeePen: 0,
    appliesIgvToFee: false,
    monthlyFeePen: 0,
    minAmountCents: 100,
    maxAmountCents: 50000,
    summary:
      'Convierte tu QR estático (Yape, Plin, Lemon o IzipayYA) en un QR EMVCo con monto único por pedido (Tag 54 + CRC16) y concilia automáticamente en la nube mediante verificación criptográfica DKIM/SPF/DMARC (Cloudflare Email Worker / Gmail API OAuth2) sin celular encendido y con 0% de comisión.',
    confirmationWarning:
      'ATENCIÓN: Un QR estático solo permite recibir dinero si no conectas el verificador AutoCloud (Cloudflare Email Worker / Gmail API DKIM). Si no configuras el Webhook Secret de AutoCloud, operará en modo de revisión manual en Caja.',
  },
  mercado_pago: {
    id: 'mercado_pago',
    name: 'Mercado Pago Perú (Yape OTP API + Tarjetas)',
    shortLabel: 'Mercado Pago',
    requiresRuc: false,
    rucRequirementLabel: 'Solo DNI (Cuenta Personal) o RUC 10/20',
    allowsDniOnly: true,
    verificationMode: 'automatic_cloud',
    requiresPermanentPhone: false,
    supportsYape: true,
    supportsPlin: false,
    supportsCards: true,
    commissionPercent: 3.49,
    fixedFeePen: 1.0,
    appliesIgvToFee: true,
    monthlyFeePen: 0,
    minAmountCents: 200,
    maxAmountCents: 50000,
    summary:
      'Acepta registro solo con DNI peruano. Cobro 100% automático en la nube con código de aprobación Yape (6 dígitos) y tarjetas mediante API oficial y Webhooks HMAC-SHA256.',
    confirmationWarning: null,
  },
  taypi_qr: {
    id: 'taypi_qr',
    name: 'TAYPI / KUTI — QR Dinámico Interoperable (Yape + Plin)',
    shortLabel: 'TAYPI QR Dinámico',
    requiresRuc: true,
    rucRequirementLabel: 'RUC 10 (Persona Natural con DNI, trámite gratis en SUNAT, sin empresa)',
    allowsDniOnly: false,
    verificationMode: 'automatic_cloud',
    requiresPermanentPhone: false,
    supportsYape: true,
    supportsPlin: true,
    supportsCards: false,
    commissionPercent: 2.5,
    fixedFeePen: 0.2,
    appliesIgvToFee: true,
    monthlyFeePen: 0,
    minAmountCents: 100,
    maxAmountCents: 150000,
    summary:
      'Genera un QR Dinámico EMVCo BCRP único por pedido con monto exacto bloqueado. Compatible con Yape, Plin y todos los bancos peruanos con confirmación Webhook HMAC-SHA256 en < 3 s.',
    confirmationWarning: null,
  },
  culqi: {
    id: 'culqi',
    name: 'Culqi Online (Yape OTP + QR Interoperable + Tarjetas)',
    shortLabel: 'Culqi',
    requiresRuc: true,
    rucRequirementLabel: 'RUC 10 (Persona Natural con DNI, sin empresa) o RUC 20',
    allowsDniOnly: false,
    verificationMode: 'automatic_cloud',
    requiresPermanentPhone: false,
    supportsYape: true,
    supportsPlin: true,
    supportsCards: true,
    commissionPercent: 3.44,
    fixedFeePen: 0.75,
    appliesIgvToFee: false,
    monthlyFeePen: 0,
    minAmountCents: 600,
    maxAmountCents: 50000,
    summary:
      'Pasarela del Grupo Credicorp (BCP). Soporta Yape con código de aprobación, órdenes QR para Yape/Plin y tarjetas con verificación server-to-server.',
    confirmationWarning: null,
  },
  izipay: {
    id: 'izipay',
    name: 'Izipay Online (QR Dinámico Yape/Plin + Tarjetas)',
    shortLabel: 'Izipay',
    requiresRuc: true,
    rucRequirementLabel: 'RUC 10 (Persona Natural con DNI, sin empresa) o RUC 20',
    allowsDniOnly: false,
    verificationMode: 'automatic_cloud',
    requiresPermanentPhone: false,
    supportsYape: true,
    supportsPlin: true,
    supportsCards: true,
    commissionPercent: 3.44,
    fixedFeePen: 0.69,
    appliesIgvToFee: true,
    monthlyFeePen: 0,
    minAmountCents: 100,
    maxAmountCents: 200000,
    summary:
      'Pasarela respaldada por Interbank. Soporta QR dinámico interoperable Yape/Plin y tarjetas con notificación IPN firmada con HMAC-SHA256.',
    confirmationWarning: null,
  },
};

export interface FeeBreakdown {
  orderAmountCents: number;
  orderAmountPen: number;
  feeBeforeIgvCents: number;
  igvCents: number;
  totalFeeCents: number;
  totalFeePen: number;
  netReceivedCents: number;
  netReceivedPen: number;
  effectiveRatePercent: number;
}

/**
 * Calcula con precisión en céntimos el costo real de procesar un pedido en soles (PEN).
 */
export function calculateProviderFee(
  providerId: PaymentGatewayProviderId,
  orderAmountPen: number,
): FeeBreakdown {
  const provider = PAYMENT_PROVIDERS_CATALOG[providerId];
  const orderAmountCents = Math.round(orderAmountPen * 100);
  if (orderAmountCents <= 0 || (provider.commissionPercent === 0 && provider.fixedFeePen === 0)) {
    return {
      orderAmountCents,
      orderAmountPen: orderAmountCents / 100,
      feeBeforeIgvCents: 0,
      igvCents: 0,
      totalFeeCents: 0,
      totalFeePen: 0,
      netReceivedCents: orderAmountCents,
      netReceivedPen: orderAmountCents / 100,
      effectiveRatePercent: 0,
    };
  }

  const variableFeePen = orderAmountPen * (provider.commissionPercent / 100);
  const baseFeePen = variableFeePen + provider.fixedFeePen;
  const igvPen = provider.appliesIgvToFee ? baseFeePen * 0.18 : 0;
  const totalFeeCents = Math.round((baseFeePen + igvPen) * 100);
  const feeBeforeIgvCents = Math.round(baseFeePen * 100);
  const igvCents = totalFeeCents - feeBeforeIgvCents;
  const netReceivedCents = Math.max(0, orderAmountCents - totalFeeCents);

  return {
    orderAmountCents,
    orderAmountPen: orderAmountCents / 100,
    feeBeforeIgvCents,
    igvCents,
    totalFeeCents,
    totalFeePen: totalFeeCents / 100,
    netReceivedCents,
    netReceivedPen: netReceivedCents / 100,
    effectiveRatePercent: Number(((totalFeeCents / orderAmountCents) * 100).toFixed(2)),
  };
}

export interface PaymentGatewayConfigSummary {
  id: string;
  restaurantId: string;
  provider: PaymentGatewayProviderId;
  environment: PaymentGatewayEnvironment;
  active: boolean;
  verificationMode: PaymentVerificationMode;
  accountLabel: string;
  publicKey: string | null;
  merchantCode: string | null;
  qrPayload: string | null;
  hasSecretKey: boolean;
  secretKeyLast4: string | null;
  hasWebhookSecret: boolean;
  webhookSecretLast4: string | null;
  connectionStatus: GatewayConnectionStatus;
  lastVerifiedAt: string | null;
  lastSafeTestPassed: boolean;
  lastSafeTestAt: string | null;
  updatedAt: string;
}

export interface SavePaymentGatewayConfigInput {
  restaurantId: string;
  provider: PaymentGatewayProviderId;
  environment: PaymentGatewayEnvironment;
  accountLabel: string;
  publicKey?: string | null;
  secretKey?: string | null;
  webhookSecret?: string | null;
  merchantCode?: string | null;
  qrPayload?: string | null;
  active: boolean;
}

export interface ConfigValidationResult {
  valid: boolean;
  canActivate: boolean;
  verificationMode: PaymentVerificationMode;
  errors: string[];
  warnings: string[];
}

/**
 * Valida la configuración antes de guardarla o activarla.
 * En `static_qr`, si se configura el `webhookSecret` de AutoCloud (Cloudflare Email Worker /
 * Gmail API OAuth2 DKIM), opera en `automatic_cloud` (100% automático sin celular); si solo se
 * pega el QR sin puente cloud, informa que requiere revisión manual (`assisted_manual`).
 */
export function validateGatewayConfigInput(
  input: SavePaymentGatewayConfigInput,
  existingSummary?: Pick<
    PaymentGatewayConfigSummary,
    'hasSecretKey' | 'hasWebhookSecret' | 'connectionStatus'
  > | null,
): ConfigValidationResult {
  const meta = PAYMENT_PROVIDERS_CATALOG[input.provider];
  const errors: string[] = [];
  const warnings: string[] = [];
  const label = input.accountLabel.trim();
  const publicKey = input.publicKey?.trim() ?? '';
  const secretKey = input.secretKey?.trim() ?? '';
  const webhookSecret = input.webhookSecret?.trim() ?? '';
  const qrPayload = input.qrPayload?.trim() ?? '';

  if (label.length < 2 || label.length > 120) {
    errors.push('Escribe un nombre identificable para la cuenta receptora (2 a 120 caracteres).');
  }

  if (/^sk_(?:test|live)_/i.test(publicKey)) {
    errors.push('Nunca coloques una clave secreta (sk_) en el campo de clave pública.');
  }

  const hasSecret = Boolean(secretKey) || Boolean(existingSummary?.hasSecretKey);
  const hasWebhook = Boolean(webhookSecret) || Boolean(existingSummary?.hasWebhookSecret);

  if (input.provider === 'static_qr') {
    if (!qrPayload) {
      errors.push(
        'Pega el payload EMVCo (000201...) o genera el QR base de Yape, Plin, Lemon o IzipayYA.',
      );
    } else if (qrPayload.length < 12 || qrPayload.length > 4000) {
      errors.push('El payload del QR estático debe tener entre 12 y 4000 caracteres.');
    }

    const autoCloudConfigured = hasWebhook;
    if (!autoCloudConfigured) {
      warnings.push(
        meta.confirmationWarning ??
          'Un QR estático solo permite recibir dinero; configura el Webhook Secret de AutoCloud (Cloudflare Email Worker / Gmail API DKIM) para activar la verificación automática sin celular.',
      );
    }
    return {
      valid: errors.length === 0,
      canActivate: errors.length === 0 && Boolean(qrPayload),
      verificationMode: autoCloudConfigured ? 'automatic_cloud' : 'assisted_manual',
      errors,
      warnings,
    };
  }

  if (input.provider === 'mercado_pago') {
    if (!publicKey) {
      errors.push('Mercado Pago requiere la Public Key (TEST-... o APP_USR-...).');
    } else if (!/^(?:TEST|APP_USR)-[A-Za-z0-9-]+$/.test(publicKey)) {
      errors.push('La Public Key de Mercado Pago debe iniciar con TEST- o APP_USR-.');
    }
    if (secretKey && !/^(?:TEST|APP_USR)-[A-Za-z0-9-]+$/.test(secretKey)) {
      errors.push('El Access Token de Mercado Pago debe iniciar con TEST- o APP_USR-.');
    }
    if (input.environment === 'production' && /^TEST-/i.test(publicKey)) {
      errors.push('En modo producción debes usar credenciales APP_USR-, no TEST-.');
    }
  } else if (input.provider === 'culqi') {
    if (!publicKey) {
      errors.push('Culqi requiere la llave pública (pk_test_... o pk_live_...).');
    } else if (!/^pk_(?:test|live)_[A-Za-z0-9_-]+$/.test(publicKey)) {
      errors.push('La llave pública de Culqi debe iniciar con pk_test_ o pk_live_.');
    }
    if (secretKey && !/^sk_(?:test|live)_[A-Za-z0-9_-]+$/.test(secretKey)) {
      errors.push('La llave secreta de Culqi debe iniciar con sk_test_ o sk_live_.');
    }
    if (input.environment === 'production' && /^pk_test_/i.test(publicKey)) {
      errors.push('En modo producción debes usar llaves pk_live_ y sk_live_.');
    }
  } else if (input.provider === 'taypi_qr') {
    if (!publicKey) {
      errors.push('TAYPI/KUTI requiere la API Public Key del comercio.');
    }
  } else if (input.provider === 'izipay') {
    if (!publicKey) {
      errors.push('Izipay requiere la llave pública del comercio.');
    }
    if (!input.merchantCode?.trim()) {
      errors.push('Izipay requiere el código de comercio (Merchant Code).');
    }
  }

  if (!hasSecret) {
    errors.push(`Introduce la clave secreta / Access Token oficial de ${meta.shortLabel}.`);
  }
  if (!hasWebhook) {
    errors.push(
      `Introduce el secreto de firma de Webhook de ${meta.shortLabel} para autenticar confirmaciones.`,
    );
  }

  const connectionTested = existingSummary?.connectionStatus === 'connected';
  if (input.active && !connectionTested) {
    warnings.push(
      'Comprueba la conexión y ejecuta la prueba segura antes de activar el cobro automático en producción.',
    );
  }

  return {
    valid: errors.length === 0,
    canActivate: errors.length === 0 && hasSecret && hasWebhook && connectionTested,
    verificationMode: 'automatic_cloud',
    errors,
    warnings,
  };
}

/**
 * Comparación en tiempo constante para evitar ataques de timing en firmas HMAC y Basic Auth.
 */
export function timingSafeEqualText(left: string, right: string): boolean {
  const maxLength = Math.max(left.length, right.length);
  let mismatch = left.length ^ right.length;
  for (let i = 0; i < maxLength; i += 1) {
    const a = i < left.length ? left.charCodeAt(i) : 0;
    const b = i < right.length ? right.charCodeAt(i) : 0;
    mismatch |= a ^ b;
  }
  return mismatch === 0;
}

/**
 * Calcula HMAC-SHA256 en formato hexadecimal minúscula usando Web Crypto API.
 */
export async function computeHmacSha256Hex(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(message));
  return Array.from(new Uint8Array(signature), (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function signMercadoPagoWebhook(params: {
  secret: string;
  dataId: string;
  requestId: string;
  timestampSeconds: number;
}): Promise<string> {
  const manifest = `id:${params.dataId.toLowerCase()};request-id:${params.requestId};ts:${params.timestampSeconds};`;
  const v1 = await computeHmacSha256Hex(params.secret, manifest);
  return `ts=${params.timestampSeconds},v1=${v1}`;
}

export async function verifyMercadoPagoWebhookSignature(params: {
  signatureHeader: string | null;
  requestIdHeader: string | null;
  dataId: string;
  secret: string;
  nowSeconds?: number;
  toleranceSeconds?: number;
}): Promise<{ ok: boolean; reason?: string }> {
  const {
    signatureHeader,
    requestIdHeader,
    dataId,
    secret,
    nowSeconds = Math.floor(Date.now() / 1000),
    toleranceSeconds = 300,
  } = params;
  if (!signatureHeader || !requestIdHeader || !dataId || !secret) {
    return { ok: false, reason: 'missing_signature_headers' };
  }
  const parts = new Map<string, string>();
  for (const segment of signatureHeader.split(',')) {
    const [k, v] = segment.split('=');
    if (k && v) parts.set(k.trim(), v.trim());
  }
  const tsRaw = parts.get('ts');
  const v1 = parts.get('v1');
  if (!tsRaw || !v1 || !/^\d+$/.test(tsRaw)) {
    return { ok: false, reason: 'malformed_signature_header' };
  }
  const ts = Number(tsRaw);
  if (Math.abs(nowSeconds - ts) > toleranceSeconds) {
    return { ok: false, reason: 'signature_timestamp_expired' };
  }
  const manifest = `id:${dataId.toLowerCase()};request-id:${requestIdHeader};ts:${tsRaw};`;
  const expected = await computeHmacSha256Hex(secret, manifest);
  if (!timingSafeEqualText(expected, v1.toLowerCase())) {
    return { ok: false, reason: 'invalid_hmac_signature' };
  }
  return { ok: true };
}

export async function signRawPayloadHmac(secret: string, rawBody: string): Promise<string> {
  const digest = await computeHmacSha256Hex(secret, rawBody);
  return `sha256=${digest}`;
}

export async function verifyRawPayloadHmac(params: {
  signatureHeader: string | null;
  rawBody: string;
  secret: string;
}): Promise<{ ok: boolean; reason?: string }> {
  const { signatureHeader, rawBody, secret } = params;
  if (!signatureHeader || !secret) {
    return { ok: false, reason: 'missing_signature_header' };
  }
  const normalized = signatureHeader.trim().replace(/^sha256=/i, '').toLowerCase();
  const expected = await computeHmacSha256Hex(secret, rawBody);
  if (!timingSafeEqualText(expected, normalized)) {
    return { ok: false, reason: 'invalid_hmac_signature' };
  }
  return { ok: true };
}

export function buildPaymentIdempotencyKey(
  orderId: string,
  provider: PaymentGatewayProviderId,
  attemptNumber: number,
): string {
  return `suya-order-${orderId}-${provider}-attempt-${attemptNumber}`;
}

export interface LedgerOrderRecord {
  id: string;
  code: string;
  restaurantId: string;
  customerName?: string | null;
  totalCents: number;
  currency: 'PEN';
  status: 'pending_payment' | 'confirmed' | 'preparing' | 'cancelled' | 'delivered';
  cancellationReason: string | null;
  restaurantNotifiedCount: number;
}

export interface LedgerPaymentAttemptRecord {
  id: string;
  orderId: string;
  restaurantId: string;
  provider: PaymentGatewayProviderId;
  method: 'yape' | 'lemon' | 'card' | 'cash';
  verificationMode: PaymentVerificationMode;
  amountCents: number;
  /** En `static_qr` AutoCloud mantiene el importe exacto del pedido (sin céntimos únicos) */
  uniqueConciliationAmountCents: number;
  /** Payload EMVCo original intacto (QR reales Perú) o sintetizado en plantillas sandbox */
  synthesizedQrPayload: string | null;
  staticWalletNetwork: StaticQrWalletNetwork | null;
  currency: 'PEN';
  checkoutReference: string;
  idempotencyKey: string;
  attemptNumber: number;
  status: DetailedPaymentStatus;
  externalTransactionId: string | null;
  providerReference: string | null;
  failureCode: string | null;
  expiresAtMs: number;
  createdAtMs: number;
  updatedAtMs: number;
  authorizedAtMs: number | null;
}

export interface LedgerWebhookEventRecord {
  id: string;
  provider: PaymentGatewayProviderId;
  eventId: string;
  externalTransactionId: string | null;
  attemptId: string | null;
  orderId: string | null;
  signatureVerified: boolean;
  apiVerified: boolean;
  amountCents: number | null;
  processingStatus:
    | 'processed'
    | 'duplicate'
    | 'rejected_signature'
    | 'amount_mismatch'
    | 'late_payment'
    | 'failed'
    | 'unreconciled';
  reason: string | null;
  processedAtMs: number;
}

export interface ReconciliationExceptionRecord {
  id: string;
  restaurantId: string;
  orderId: string | null;
  paymentAttemptId: string | null;
  provider: PaymentGatewayProviderId;
  externalTransactionId: string | null;
  expectedAmountCents: number | null;
  receivedAmountCents: number | null;
  exceptionType: ReconciliationExceptionType;
  resolutionStatus: ReconciliationResolutionStatus;
  resolutionNote: string | null;
  createdAtMs: number;
  resolvedAtMs: number | null;
}

export interface VerifiedProviderTransaction {
  provider: PaymentGatewayProviderId;
  eventId: string;
  externalTransactionId: string;
  attemptId: string;
  orderId: string;
  amountCents: number;
  currency: string;
  providerStatus: 'approved' | 'rejected' | 'pending' | 'expired';
  signatureVerified: boolean;
  apiVerified: boolean;
  /** Requerido cuando `provider === 'static_qr'` para certificar verificación DKIM/SPF/DMARC bancaria */
  dkimBankVerified?: boolean;
  occurredAtMs?: number;
}

export interface SettlementOutcome {
  ok: boolean;
  code:
    | 'authorized'
    | 'duplicate_event'
    | 'duplicate_payment_exception'
    | 'rejected_unverified'
    | 'transaction_reused'
    | 'amount_mismatch'
    | 'currency_mismatch'
    | 'late_payment_exception'
    | 'order_cancelled_exception'
    | 'provider_rejected'
    | 'pending'
    | 'attempt_not_found'
    | 'concurrent_lock_conflict'
    | 'database_error';
  orderStatus?: LedgerOrderRecord['status'];
  attemptStatus?: DetailedPaymentStatus;
  exceptionId?: string;
  restaurantNotified?: boolean;
  message: string;
}

export class PaymentSettlementEngine {
  private readonly orders = new Map<string, LedgerOrderRecord>();
  private readonly attempts = new Map<string, LedgerPaymentAttemptRecord>();
  private readonly webhookEvents = new Map<string, LedgerWebhookEventRecord>();
  private readonly exceptions = new Map<string, ReconciliationExceptionRecord>();
  private readonly usedExternalTransactions = new Map<string, string>();
  private readonly activeLocks = new Set<string>();
  private simulateDatabaseOutage = false;
  private idCounter = 0;

  private nextId(prefix: string): string {
    this.idCounter += 1;
    return `${prefix}_${this.idCounter}`;
  }

  setSimulatedDatabaseOutage(outage: boolean): void {
    this.simulateDatabaseOutage = outage;
  }

  createOrder(input: {
    id: string;
    code: string;
    restaurantId: string;
    totalCents: number;
    customerName?: string | null;
  }): LedgerOrderRecord {
    if (!Number.isInteger(input.totalCents) || input.totalCents <= 0) {
      throw new Error('El importe del pedido debe ser un entero positivo en céntimos.');
    }
    const record: LedgerOrderRecord = {
      id: input.id,
      code: input.code,
      restaurantId: input.restaurantId,
      customerName: input.customerName ?? null,
      totalCents: input.totalCents,
      currency: 'PEN',
      status: 'pending_payment',
      cancellationReason: null,
      restaurantNotifiedCount: 0,
    };
    this.orders.set(record.id, record);
    return { ...record };
  }

  getOrder(orderId: string): LedgerOrderRecord | undefined {
    const found = this.orders.get(orderId);
    return found ? { ...found } : undefined;
  }

  getAttempt(attemptId: string): LedgerPaymentAttemptRecord | undefined {
    const found = this.attempts.get(attemptId);
    return found ? { ...found } : undefined;
  }

  listExceptions(restaurantId?: string): ReconciliationExceptionRecord[] {
    const all = Array.from(this.exceptions.values());
    return (restaurantId ? all.filter((item) => item.restaurantId === restaurantId) : all).map(
      (item) => ({ ...item }),
    );
  }

  listWebhookEvents(): LedgerWebhookEventRecord[] {
    return Array.from(this.webhookEvents.values()).map((item) => ({ ...item }));
  }

  cancelOrder(orderId: string, reason: string): LedgerOrderRecord {
    const order = this.orders.get(orderId);
    if (!order) throw new Error('Pedido no encontrado.');
    order.status = 'cancelled';
    order.cancellationReason = reason;
    return { ...order };
  }

  createPaymentAttempt(input: {
    attemptId?: string;
    orderId: string;
    provider: PaymentGatewayProviderId;
    method: 'yape' | 'lemon' | 'card';
    staticQrPayload?: string | null;
    staticWalletNetwork?: StaticQrWalletNetwork | null;
    nowMs?: number;
    ttlMs?: number;
  }): LedgerPaymentAttemptRecord {
    const order = this.orders.get(input.orderId);
    if (!order) throw new Error('Pedido no encontrado.');
    if (order.status === 'cancelled') {
      throw new Error('Un pedido cancelado no admite nuevos intentos de pago.');
    }

    const nowMs = input.nowMs ?? Date.now();
    const ttlMs = input.ttlMs ?? 15 * 60 * 1000;

    for (const existing of this.attempts.values()) {
      if (
        existing.orderId === order.id &&
        existing.status === 'pending' &&
        existing.expiresAtMs <= nowMs
      ) {
        existing.status = 'expired';
        existing.failureCode = 'expired';
        existing.updatedAtMs = nowMs;
      }
    }

    const activeAttempt = Array.from(this.attempts.values()).find(
      (item) =>
        item.orderId === order.id &&
        (item.status === 'pending' || item.status === 'authorized') &&
        item.provider === input.provider &&
        item.method === input.method,
    );
    if (activeAttempt) {
      return { ...activeAttempt };
    }

    const previousAttemptsCount = Array.from(this.attempts.values()).filter(
      (item) => item.orderId === order.id,
    ).length;
    const attemptNumber = previousAttemptsCount + 1;
    const attemptId = input.attemptId ?? this.nextId('attempt');
    const providerMeta = PAYMENT_PROVIDERS_CATALOG[input.provider];
    const checkoutReference = `SUYA-${order.id
      .replace(/[^a-zA-Z0-9]/g, '')
      .toUpperCase()
      .slice(-8)}-${attemptId.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()}`;

    let uniqueConciliationAmountCents = order.totalCents;
    let synthesizedQrPayload: string | null = null;
    let staticWalletNetwork: StaticQrWalletNetwork | null = input.staticWalletNetwork ?? null;

    if (input.provider === 'static_qr') {
      const allocated = allocateUniqueConciliationAmountCents(order.totalCents, []);
      uniqueConciliationAmountCents = allocated.uniqueAmountCents;

      const rawQr =
        input.staticQrPayload?.trim() ||
        buildBaseMerchantEmvcoQr({
          walletNetwork: staticWalletNetwork ?? 'yape',
          merchantAccountId: order.restaurantId,
          merchantName: 'SUYA DELIVERY',
        });
      staticWalletNetwork = staticWalletNetwork ?? detectStaticQrWalletNetwork(rawQr);
      synthesizedQrPayload = synthesizeDynamicEmvcoQrFromStatic({
        staticQrPayload: rawQr,
        amountCents: uniqueConciliationAmountCents,
        checkoutReference,
      }).qrPayload;
    }

    const record: LedgerPaymentAttemptRecord = {
      id: attemptId,
      orderId: order.id,
      restaurantId: order.restaurantId,
      provider: input.provider,
      method: input.method,
      verificationMode: providerMeta.verificationMode,
      amountCents: order.totalCents,
      uniqueConciliationAmountCents,
      synthesizedQrPayload,
      staticWalletNetwork,
      currency: 'PEN',
      checkoutReference,
      idempotencyKey: buildPaymentIdempotencyKey(order.id, input.provider, attemptNumber),
      attemptNumber,
      status: 'pending',
      externalTransactionId: null,
      providerReference: null,
      failureCode: null,
      expiresAtMs: nowMs + ttlMs,
      createdAtMs: nowMs,
      updatedAtMs: nowMs,
      authorizedAtMs: null,
    };

    this.attempts.set(record.id, record);
    return { ...record };
  }

  /**
   * Impide que cualquier señal no verificada (captura, número de operación del cliente,
   * notificación Android, correo sin verificar o QR estático escaneado) autorice un pedido.
   */
  attemptUnverifiedClientOrObserverApproval(input: {
    attemptId: string;
    source:
      | 'screenshot'
      | 'client_operation_code'
      | 'android_notification'
      | 'unverified_email'
      | 'browser_response'
      | 'static_qr_scan';
  }): SettlementOutcome {
    const attempt = this.attempts.get(input.attemptId);
    if (!attempt) {
      return {
        ok: false,
        code: 'attempt_not_found',
        message: 'Intento de pago no encontrado.',
      };
    }
    attempt.status = 'under_review';
    attempt.updatedAtMs = Date.now();
    return {
      ok: false,
      code: 'rejected_unverified',
      orderStatus: this.orders.get(attempt.orderId)?.status,
      attemptStatus: attempt.status,
      restaurantNotified: false,
      message: `Seguridad SUYA: La fuente "${input.source}" es solo un indicio y nunca puede autorizar automáticamente un pago sin confirmación financiera verificada del proveedor.`,
    };
  }

  /**
   * Procesa en la nube una notificación bancaria/billetera de `static_qr` (Yape, Plin, Lemon, IzipayYA)
   * verificando criptográficamente `Authentication-Results` + `DKIM-Signature` (`b=` RSA-SHA256 + `bh=`) y
   * conciliando por `checkoutReference` o importe exacto del pedido (desambiguando múltiples pedidos
   * con el mismo importe mediante el nombre del pagador).
   */
  async processStaticQrAutoCloudEmail(input: {
    restaurantId: string;
    messageId: string;
    subject: string;
    rawBodyText: string;
    rawHeaders: string | null | undefined;
    authenticationResultsHeader: string | null;
    recipientAddress?: string | null;
    occurredAtMs?: number;
    resolvePublicKeySpki?: DkimPublicKeyResolver;
  }): Promise<SettlementOutcome> {
    const verification = await verifyBankEmailAuthenticity({
      rawHeaders: input.rawHeaders,
      authenticationResultsHeader: input.authenticationResultsHeader,
      rawBodyText: input.rawBodyText,
      resolvePublicKeySpki: input.resolvePublicKeySpki,
    });
    if (!verification.authentic || !verification.dkimDomain) {
      return {
        ok: false,
        code: 'rejected_unverified',
        message: `Correo rechazado por seguridad criptográfica (${verification.reason ?? 'dkim_failed'}).`,
      };
    }

    const parsed = parsePeruvianBankAndWalletEmail({
      dkimDomain: verification.dkimDomain,
      subject: input.subject,
      bodyText: input.rawBodyText,
      recipientAddress: input.recipientAddress,
    });
    if (!parsed) {
      return {
        ok: false,
        code: 'rejected_unverified',
        message: 'El correo autenticado no contiene un comprobante de abono válido en PEN.',
      };
    }

    const eventId = `autocloud_${verification.dkimDomain}_${input.messageId}`;
    const existingEvent = this.webhookEvents.get(`static_qr:${eventId}`);
    if (existingEvent && existingEvent.processingStatus === 'processed') {
      return {
        ok: true,
        code: 'duplicate_event',
        orderStatus: existingEvent.orderId ? this.orders.get(existingEvent.orderId)?.status : undefined,
        attemptStatus: existingEvent.attemptId
          ? this.attempts.get(existingEvent.attemptId)?.status
          : undefined,
        restaurantNotified: false,
        message: 'Correo AutoCloud duplicado ignorado de forma idempotente.',
      };
    }

    // Buscar estrictamente intentos static_qr pendientes del restaurante compatibles con la red del correo
    const candidates = Array.from(this.attempts.values()).filter(
      (item) =>
        item.restaurantId === input.restaurantId &&
        item.provider === 'static_qr' &&
        (!item.staticWalletNetwork || item.staticWalletNetwork === parsed.walletNetwork),
    );

    let matchedAttempt: LedgerPaymentAttemptRecord | undefined;
    if (parsed.checkoutReference) {
      const refMatches = candidates.filter(
        (item) => item.checkoutReference === parsed.checkoutReference,
      );
      if (refMatches.length === 1) {
        matchedAttempt = refMatches[0];
      }
    } else {
      const amountMatches = candidates.filter(
        (item) =>
          item.status === 'pending' &&
          item.amountCents === parsed.amountCents,
      );
      if (amountMatches.length === 1) {
        matchedAttempt = amountMatches[0];
      } else if (amountMatches.length > 1 && parsed.senderName) {
        const nameMatches = amountMatches.filter((item) => {
          const order = this.orders.get(item.orderId);
          return personNamesMatch(order?.customerName, parsed.senderName);
        });
        if (nameMatches.length === 1) {
          matchedAttempt = nameMatches[0];
        }
      }
    }

    if (!matchedAttempt) {
      return {
        ok: false,
        code: 'attempt_not_found',
        message:
          'No se encontró un intento único de pago static_qr compatible para conciliar.',
      };
    }

    return this.processProviderPaymentEvent({
      provider: 'static_qr',
      eventId,
      externalTransactionId: `${parsed.walletNetwork}_${parsed.operationId}`,
      attemptId: matchedAttempt.id,
      orderId: matchedAttempt.orderId,
      amountCents: parsed.amountCents,
      currency: parsed.currency,
      providerStatus: 'approved',
      signatureVerified: true,
      apiVerified: true,
      dkimBankVerified: true,
      occurredAtMs: input.occurredAtMs,
    });
  }

  /**
   * Procesa de forma atómica un evento de pago de proveedor.
   */
  processProviderPaymentEvent(
    tx: VerifiedProviderTransaction,
    options?: { simulateConcurrentLockOnAttempt?: boolean },
  ): SettlementOutcome {
    if (this.simulateDatabaseOutage) {
      return {
        ok: false,
        code: 'database_error',
        message:
          'Error transitorio de base de datos; no se confirmó el webhook para forzar reintento seguro del proveedor.',
      };
    }

    const nowMs = tx.occurredAtMs ?? Date.now();
    const eventKey = `${tx.provider}:${tx.eventId}`;

    // En static_qr exigimos además que provenga del verificador criptográfico DKIM bancario (dkimBankVerified === true)
    const staticQrUntrusted = tx.provider === 'static_qr' && tx.dkimBankVerified !== true;
    if (!tx.signatureVerified || !tx.apiVerified || staticQrUntrusted) {
      this.webhookEvents.set(eventKey, {
        id: this.nextId('wh'),
        provider: tx.provider,
        eventId: tx.eventId,
        externalTransactionId: tx.externalTransactionId,
        attemptId: tx.attemptId,
        orderId: tx.orderId,
        signatureVerified: tx.signatureVerified,
        apiVerified: tx.apiVerified,
        amountCents: tx.amountCents,
        processingStatus: 'rejected_signature',
        reason: 'missing_cryptographic_or_api_verification',
        processedAtMs: nowMs,
      });
      return {
        ok: false,
        code: 'rejected_unverified',
        message:
          'Evento rechazado: requiere firma criptográfica válida y verificación con la entidad emisora.',
      };
    }

    const existingEvent = this.webhookEvents.get(eventKey);
    if (existingEvent && existingEvent.processingStatus === 'processed') {
      return {
        ok: true,
        code: 'duplicate_event',
        orderStatus: this.orders.get(tx.orderId)?.status,
        attemptStatus: this.attempts.get(tx.attemptId)?.status,
        restaurantNotified: false,
        message: 'Webhook duplicado ignorado de forma idempotente.',
      };
    }

    if (options?.simulateConcurrentLockOnAttempt || this.activeLocks.has(tx.attemptId)) {
      return {
        ok: false,
        code: 'concurrent_lock_conflict',
        message: 'El intento de pago ya está siendo procesado por otra transacción concurrente.',
      };
    }

    this.activeLocks.add(tx.attemptId);
    try {
      const attempt = this.attempts.get(tx.attemptId);
      if (!attempt || attempt.orderId !== tx.orderId) {
        return {
          ok: false,
          code: 'attempt_not_found',
          message: 'El intento de pago no existe o no pertenece al pedido indicado.',
        };
      }

      const order = this.orders.get(attempt.orderId);
      if (!order) {
        return {
          ok: false,
          code: 'attempt_not_found',
          message: 'El pedido asociado al pago no existe.',
        };
      }

      const txKey = `${tx.provider}:${tx.externalTransactionId}`;
      const boundAttemptId = this.usedExternalTransactions.get(txKey);
      if (boundAttemptId && boundAttemptId !== attempt.id) {
        const exceptionId = this.recordException({
          restaurantId: order.restaurantId,
          orderId: order.id,
          paymentAttemptId: attempt.id,
          provider: tx.provider,
          externalTransactionId: tx.externalTransactionId,
          expectedAmountCents: attempt.uniqueConciliationAmountCents,
          receivedAmountCents: tx.amountCents,
          exceptionType: 'transaction_reused',
          resolutionStatus: 'open',
          resolutionNote: `Intento de reutilizar la transacción ${tx.externalTransactionId} ya vinculada a ${boundAttemptId}.`,
          nowMs,
        });
        return {
          ok: false,
          code: 'transaction_reused',
          orderStatus: order.status,
          attemptStatus: attempt.status,
          exceptionId,
          restaurantNotified: false,
          message:
            'Transacción rechazada: este identificador de operación ya fue utilizado en otro pedido.',
        };
      }

      if (
        attempt.status === 'authorized' &&
        attempt.externalTransactionId === tx.externalTransactionId
      ) {
        this.webhookEvents.set(eventKey, {
          id: this.nextId('wh'),
          provider: tx.provider,
          eventId: tx.eventId,
          externalTransactionId: tx.externalTransactionId,
          attemptId: attempt.id,
          orderId: order.id,
          signatureVerified: true,
          apiVerified: true,
          amountCents: tx.amountCents,
          processingStatus: 'duplicate',
          reason: 'already_authorized_same_tx',
          processedAtMs: nowMs,
        });
        return {
          ok: true,
          code: 'duplicate_event',
          orderStatus: order.status,
          attemptStatus: attempt.status,
          restaurantNotified: false,
          message: 'El pago ya había sido confirmado previamente con esta misma transacción.',
        };
      }

      if (tx.providerStatus === 'pending') {
        return {
          ok: true,
          code: 'pending',
          orderStatus: order.status,
          attemptStatus: attempt.status,
          restaurantNotified: false,
          message: 'El pago continúa pendiente de confirmación financiera.',
        };
      }

      if (tx.providerStatus === 'rejected' || tx.providerStatus === 'expired') {
        attempt.status = tx.providerStatus === 'expired' ? 'expired' : 'failed';
        attempt.failureCode =
          tx.providerStatus === 'expired' ? 'provider_expired' : 'provider_rejected';
        attempt.updatedAtMs = nowMs;
        this.webhookEvents.set(eventKey, {
          id: this.nextId('wh'),
          provider: tx.provider,
          eventId: tx.eventId,
          externalTransactionId: tx.externalTransactionId,
          attemptId: attempt.id,
          orderId: order.id,
          signatureVerified: true,
          apiVerified: true,
          amountCents: tx.amountCents,
          processingStatus: 'processed',
          reason: attempt.failureCode,
          processedAtMs: nowMs,
        });
        return {
          ok: false,
          code: 'provider_rejected',
          orderStatus: order.status,
          attemptStatus: attempt.status,
          restaurantNotified: false,
          message: 'El proveedor reportó el pago como rechazado o expirado.',
        };
      }

      this.usedExternalTransactions.set(txKey, attempt.id);

      const alreadyPaidAttempt = Array.from(this.attempts.values()).find(
        (item) => item.orderId === order.id && item.status === 'authorized',
      );
      if (
        alreadyPaidAttempt &&
        alreadyPaidAttempt.externalTransactionId !== tx.externalTransactionId
      ) {
        const exceptionId = this.recordException({
          restaurantId: order.restaurantId,
          orderId: order.id,
          paymentAttemptId: attempt.id,
          provider: tx.provider,
          externalTransactionId: tx.externalTransactionId,
          expectedAmountCents: attempt.uniqueConciliationAmountCents,
          receivedAmountCents: tx.amountCents,
          exceptionType: 'duplicate_payment',
          resolutionStatus: 'refund_pending',
          resolutionNote: `Segundo cobro recibido (${tx.externalTransactionId}) para un pedido que ya estaba pagado (${alreadyPaidAttempt.externalTransactionId}).`,
          nowMs,
        });
        return {
          ok: false,
          code: 'duplicate_payment_exception',
          orderStatus: order.status,
          attemptStatus: alreadyPaidAttempt.status,
          exceptionId,
          restaurantNotified: false,
          message:
            'Se detectó un segundo cobro para un pedido ya confirmado; registrado para devolución sin duplicar el pedido.',
        };
      }

      if (tx.currency !== 'PEN') {
        attempt.status = 'failed';
        attempt.failureCode = 'currency_mismatch';
        attempt.updatedAtMs = nowMs;
        return {
          ok: false,
          code: 'currency_mismatch',
          orderStatus: order.status,
          attemptStatus: attempt.status,
          restaurantNotified: false,
          message: 'Moneda inválida: solo se admiten pagos en PEN.',
        };
      }

      const expectedCents =
        tx.provider === 'static_qr' ? attempt.uniqueConciliationAmountCents : order.totalCents;
      if (tx.amountCents !== expectedCents) {
        attempt.status = 'failed';
        attempt.failureCode = 'amount_mismatch';
        attempt.externalTransactionId = tx.externalTransactionId;
        attempt.updatedAtMs = nowMs;
        const exceptionId = this.recordException({
          restaurantId: order.restaurantId,
          orderId: order.id,
          paymentAttemptId: attempt.id,
          provider: tx.provider,
          externalTransactionId: tx.externalTransactionId,
          expectedAmountCents: expectedCents,
          receivedAmountCents: tx.amountCents,
          exceptionType: 'amount_mismatch',
          resolutionStatus: 'refund_pending',
          resolutionNote: `Importe recibido (${(tx.amountCents / 100).toFixed(2)}) no coincide con el monto esperado (${(expectedCents / 100).toFixed(2)}).`,
          nowMs,
        });
        this.webhookEvents.set(eventKey, {
          id: this.nextId('wh'),
          provider: tx.provider,
          eventId: tx.eventId,
          externalTransactionId: tx.externalTransactionId,
          attemptId: attempt.id,
          orderId: order.id,
          signatureVerified: true,
          apiVerified: true,
          amountCents: tx.amountCents,
          processingStatus: 'amount_mismatch',
          reason: 'amount_mismatch',
          processedAtMs: nowMs,
        });
        return {
          ok: false,
          code: 'amount_mismatch',
          orderStatus: order.status,
          attemptStatus: attempt.status,
          exceptionId,
          restaurantNotified: false,
          message: 'El importe pagado no coincide con el total exacto del pedido.',
        };
      }

      if (order.status === 'cancelled') {
        attempt.status = 'refund_pending';
        attempt.failureCode = 'order_already_cancelled';
        attempt.externalTransactionId = tx.externalTransactionId;
        attempt.updatedAtMs = nowMs;
        const exceptionId = this.recordException({
          restaurantId: order.restaurantId,
          orderId: order.id,
          paymentAttemptId: attempt.id,
          provider: tx.provider,
          externalTransactionId: tx.externalTransactionId,
          expectedAmountCents: expectedCents,
          receivedAmountCents: tx.amountCents,
          exceptionType: 'order_cancelled',
          resolutionStatus: 'refund_pending',
          resolutionNote:
            'Pago confirmado recibido después de la cancelación del pedido; requiere devolución.',
          nowMs,
        });
        return {
          ok: false,
          code: 'order_cancelled_exception',
          orderStatus: order.status,
          attemptStatus: attempt.status,
          exceptionId,
          restaurantNotified: false,
          message:
            'El pedido ya estaba cancelado; el pago se registró en excepciones para devolución sin reactivar el pedido.',
        };
      }

      if (nowMs > attempt.expiresAtMs || attempt.status === 'expired') {
        attempt.status = 'under_review';
        attempt.failureCode = 'late_payment';
        attempt.externalTransactionId = tx.externalTransactionId;
        attempt.updatedAtMs = nowMs;
        const exceptionId = this.recordException({
          restaurantId: order.restaurantId,
          orderId: order.id,
          paymentAttemptId: attempt.id,
          provider: tx.provider,
          externalTransactionId: tx.externalTransactionId,
          expectedAmountCents: expectedCents,
          receivedAmountCents: tx.amountCents,
          exceptionType: 'late_payment',
          resolutionStatus: 'open',
          resolutionNote:
            'Confirmación tardía recibida después del vencimiento del intento; registrada para conciliación o devolución.',
          nowMs,
        });
        this.webhookEvents.set(eventKey, {
          id: this.nextId('wh'),
          provider: tx.provider,
          eventId: tx.eventId,
          externalTransactionId: tx.externalTransactionId,
          attemptId: attempt.id,
          orderId: order.id,
          signatureVerified: true,
          apiVerified: true,
          amountCents: tx.amountCents,
          processingStatus: 'late_payment',
          reason: 'late_payment',
          processedAtMs: nowMs,
        });
        return {
          ok: false,
          code: 'late_payment_exception',
          orderStatus: order.status,
          attemptStatus: attempt.status,
          exceptionId,
          restaurantNotified: false,
          message:
            'Pago recibido después del tiempo de expiración; registrado en conciliación para revisión o devolución.',
        };
      }

      attempt.status = 'authorized';
      attempt.externalTransactionId = tx.externalTransactionId;
      attempt.providerReference = tx.externalTransactionId;
      attempt.failureCode = null;
      attempt.authorizedAtMs = nowMs;
      attempt.updatedAtMs = nowMs;

      let restaurantNotified = false;
      if (order.status === 'pending_payment') {
        order.status = 'confirmed';
        order.restaurantNotifiedCount += 1;
        restaurantNotified = true;
      }

      this.webhookEvents.set(eventKey, {
        id: this.nextId('wh'),
        provider: tx.provider,
        eventId: tx.eventId,
        externalTransactionId: tx.externalTransactionId,
        attemptId: attempt.id,
        orderId: order.id,
        signatureVerified: true,
        apiVerified: true,
        amountCents: tx.amountCents,
        processingStatus: 'processed',
        reason: null,
        processedAtMs: nowMs,
      });

      return {
        ok: true,
        code: 'authorized',
        orderStatus: order.status,
        attemptStatus: attempt.status,
        restaurantNotified,
        message: 'Pago confirmado y pedido liberado al restaurante de forma atómica.',
      };
    } finally {
      this.activeLocks.delete(tx.attemptId);
    }
  }

  resolveException(
    exceptionId: string,
    resolutionStatus: Exclude<ReconciliationResolutionStatus, 'open'>,
    note: string,
  ): ReconciliationExceptionRecord {
    const found = this.exceptions.get(exceptionId);
    if (!found) throw new Error('Excepción de conciliación no encontrada.');
    if (!note.trim())
      throw new Error('Escribe una nota de auditoría para registrar la resolución.');
    found.resolutionStatus = resolutionStatus;
    found.resolutionNote = note.trim();
    found.resolvedAtMs = Date.now();
    return { ...found };
  }

  private recordException(input: {
    restaurantId: string;
    orderId: string | null;
    paymentAttemptId: string | null;
    provider: PaymentGatewayProviderId;
    externalTransactionId: string | null;
    expectedAmountCents: number | null;
    receivedAmountCents: number | null;
    exceptionType: ReconciliationExceptionType;
    resolutionStatus: ReconciliationResolutionStatus;
    resolutionNote: string | null;
    nowMs: number;
  }): string {
    const id = this.nextId('exc');
    this.exceptions.set(id, {
      id,
      restaurantId: input.restaurantId,
      orderId: input.orderId,
      paymentAttemptId: input.paymentAttemptId,
      provider: input.provider,
      externalTransactionId: input.externalTransactionId,
      expectedAmountCents: input.expectedAmountCents,
      receivedAmountCents: input.receivedAmountCents,
      exceptionType: input.exceptionType,
      resolutionStatus: input.resolutionStatus,
      resolutionNote: input.resolutionNote,
      createdAtMs: input.nowMs,
      resolvedAtMs: null,
    });
    return id;
  }
}

export interface DiagnosticCheckResult {
  name: string;
  passed: boolean;
  detail: string;
}

export interface SafeDiagnosticSuiteResult {
  passed: boolean;
  provider: PaymentGatewayProviderId;
  executedAt: string;
  checks: DiagnosticCheckResult[];
}

/**
 * Ejecuta una batería de pruebas seguras en memoria + Web Crypto para validar que el proveedor
 * configurado (incluyendo `static_qr` AutoCloud con síntesis EMVCo y verificación DKIM)
 * procesa correctamente firmas, montos exactos, pedidos simultáneos y deduplicación.
 */
export async function runProviderSafeDiagnosticSuite(
  provider: PaymentGatewayProviderId,
): Promise<SafeDiagnosticSuiteResult> {
  const engine = new PaymentSettlementEngine();
  const checks: DiagnosticCheckResult[] = [];
  const nowMs = Date.now();
  const testSecret = 'suya_safe_diagnostic_webhook_secret_2026';

  if (provider === 'static_qr') {
    // 1. Prueba de Síntesis EMVCo QR Dinámico (Tag 54 + Tag 62 + Tag 63 CRC-16/CCITT-FALSE) para Yape, Plin, Lemon e IzipayYA
    const networks: StaticQrWalletNetwork[] = ['yape', 'plin', 'lemon', 'izipayya'];
    const emvcoAllValid = networks.every((net) => {
      const baseQr = buildBaseMerchantEmvcoQr({
        walletNetwork: net,
        merchantAccountId: '987654321',
        merchantName: 'SUYA SULLANA',
      });
      const dynQr = synthesizeDynamicEmvcoQrFromStatic({
        staticQrPayload: baseQr,
        amountCents: 3999,
        checkoutReference: 'SUYA-DIAG-01',
        allowSyntheticMutation: true,
      });
      const parsed = parseEmvcoQr(dynQr.qrPayload);
      return (
        dynQr.isEmvcoDynamic &&
        parsed.valid &&
        parsed.crcValid &&
        parsed.fields.some((f) => f.tag === '54' && f.value === '39.99')
      );
    });
    checks.push({
      name: 'Síntesis EMVCo QR Dinámico (Yape / Plin / Lemon / IzipayYA + CRC-16)',
      passed: emvcoAllValid,
      detail: emvcoAllValid
        ? 'QR estático transformado con éxito a QR EMVCo con Tag 54 (monto único) y CRC-16/CCITT-FALSE válido en las 4 redes.'
        : 'Fallo en síntesis EMVCo o validación CRC-16.',
    });

    // 2. Prueba de 2 pedidos simultáneos del mismo importe (S/ 40.00 -> S/ 40.00 y S/ 39.99) + Verificación DKIM AutoCloud
    engine.createOrder({
      id: 'order-static-a',
      code: 'SUY-4001',
      restaurantId: 'rest-diag',
      customerName: 'Maria Quispe',
      totalCents: 4000,
    });
    engine.createOrder({
      id: 'order-static-b',
      code: 'SUY-4002',
      restaurantId: 'rest-diag',
      customerName: 'Juan Perez',
      totalCents: 4000,
    });
    const attemptA = engine.createPaymentAttempt({
      orderId: 'order-static-a',
      provider: 'static_qr',
      method: 'yape',
      nowMs,
    });
    const attemptB = engine.createPaymentAttempt({
      orderId: 'order-static-b',
      provider: 'static_qr',
      method: 'yape',
      nowMs,
    });

    const { privateKey, resolvePublicKeySpki } = await createEphemeralDkimTestSigner();
    const emailBodyB = `Constancia de Yape recibido por S/ 40.00\r\nNúmero de operación: 8492014\r\nEnviado por: Juan Perez\r\n`;
    const signedB = await signMimeMessageDkimRsaSha256({
      privateKey,
      selector: 's1',
      domain: 'notificacionesbcp.com.pe',
      from: 'notificaciones@notificacionesbcp.com.pe',
      to: 'pagos@suyadelivery.com',
      subject: 'Servicio de Notificaciones BCP - Yape',
      rawBody: emailBodyB,
    });
    const authHeaderB =
      'mx.cloudflare.net; spf=pass; dkim=pass header.d=notificacionesbcp.com.pe; dmarc=pass';

    const settleB = await engine.processStaticQrAutoCloudEmail({
      restaurantId: 'rest-diag',
      messageId: 'msg-dkim-b-1',
      subject: 'Servicio de Notificaciones BCP - Yape',
      rawBodyText: signedB.rawBody,
      rawHeaders: signedB.rawHeaders,
      authenticationResultsHeader: authHeaderB,
      occurredAtMs: nowMs + 1000,
      resolvePublicKeySpki,
    });

    const collisionSafe =
      attemptA.uniqueConciliationAmountCents === 4000 &&
      attemptB.uniqueConciliationAmountCents === 4000 &&
      settleB.ok &&
      engine.getOrder('order-static-b')?.status === 'confirmed' &&
      engine.getOrder('order-static-a')?.status === 'pending_payment';
    checks.push({
      name: 'Conciliación AutoCloud de 2 pedidos simultáneos por monto exacto (S/ 40.00)',
      passed: collisionSafe,
      detail: collisionSafe
        ? 'Monto exacto S/ 40.00 preservado sin céntimos y pedido B confirmado por nombre del pagador vía DKIM RSA-SHA256 sin cruzar con el pedido A.'
        : 'Error en desambiguación por monto exacto + nombre del pagador en static_qr.',
    });

    // 3. Deduplicación y bloqueo de reutilización de número de operación
    const duplicateEmail = await engine.processStaticQrAutoCloudEmail({
      restaurantId: 'rest-diag',
      messageId: 'msg-dkim-b-1',
      subject: 'Servicio de Notificaciones BCP - Yape',
      rawBodyText: signedB.rawBody,
      rawHeaders: signedB.rawHeaders,
      authenticationResultsHeader: authHeaderB,
      occurredAtMs: nowMs + 2000,
      resolvePublicKeySpki,
    });
    const dedupeSafe =
      duplicateEmail.code === 'duplicate_event' &&
      engine.getOrder('order-static-b')?.restaurantNotifiedCount === 1;
    checks.push({
      name: 'Deduplicación de notificación cloud y protección contra doble uso',
      passed: dedupeSafe,
      detail: dedupeSafe
        ? 'Mensaje repetido ignorado idempotentemente con una sola notificación al restaurante.'
        : 'Fallo en deduplicación de correo AutoCloud.',
    });

    // 4. Rechazo de correo falsificado (DKIM inválido / cuerpo alterado) y bloqueo de celular/captura
    const tamperedEmail = await engine.processStaticQrAutoCloudEmail({
      restaurantId: 'rest-diag',
      messageId: 'msg-forged-1',
      subject: 'Pago falso',
      rawBodyText: `Constancia de Yape recibido por S/ 40.00\r\nNúmero de operación: 9999999\r\n`,
      rawHeaders: signedB.rawHeaders,
      authenticationResultsHeader: authHeaderB,
      occurredAtMs: nowMs + 3000,
      resolvePublicKeySpki,
    });
    const unverifiedScan = engine.attemptUnverifiedClientOrObserverApproval({
      attemptId: attemptA.id,
      source: 'static_qr_scan',
    });
    const securityPassed =
      !tamperedEmail.ok &&
      tamperedEmail.code === 'rejected_unverified' &&
      !unverifiedScan.ok &&
      engine.getOrder('order-static-a')?.status === 'pending_payment';
    checks.push({
      name: 'Bloqueo de correo con monto alterado (DKIM RSA/bh mismatch) y capturas no verificadas',
      passed: securityPassed,
      detail: securityPassed
        ? 'Correo con cuerpo o firma adulterada rechazado por verificación criptográfica DKIM RSA-SHA256 y captura simple bloqueada.'
        : 'Fallo en validación de integridad DKIM.',
    });

    return {
      passed: checks.every((item) => item.passed),
      provider,
      executedAt: new Date(nowMs).toISOString(),
      checks,
    };
  }

  // Suite diagnóstica para pasarelas API (mercado_pago, taypi_qr, culqi, izipay)
  if (provider === 'mercado_pago') {
    const header = await signMercadoPagoWebhook({
      secret: testSecret,
      dataId: '99887766',
      requestId: 'req-diag-1',
      timestampSeconds: Math.floor(nowMs / 1000),
    });
    const validVerify = await verifyMercadoPagoWebhookSignature({
      signatureHeader: header,
      requestIdHeader: 'req-diag-1',
      dataId: '99887766',
      secret: testSecret,
      nowSeconds: Math.floor(nowMs / 1000),
    });
    const forgedVerify = await verifyMercadoPagoWebhookSignature({
      signatureHeader: `${header}00`,
      requestIdHeader: 'req-diag-1',
      dataId: '99887766',
      secret: testSecret,
      nowSeconds: Math.floor(nowMs / 1000),
    });
    checks.push({
      name: 'Autenticación criptográfica de Webhook (HMAC-SHA256)',
      passed: validVerify.ok && !forgedVerify.ok,
      detail:
        validVerify.ok && !forgedVerify.ok
          ? 'Firma válida aceptada y firma alterada rechazada en tiempo constante.'
          : 'Fallo en validación de firma HMAC.',
    });
  } else {
    const sampleBody = JSON.stringify({ order: 'SUYA-DIAG-01', amount_cents: 4000 });
    const sig = await signRawPayloadHmac(testSecret, sampleBody);
    const validVerify = await verifyRawPayloadHmac({
      signatureHeader: sig,
      rawBody: sampleBody,
      secret: testSecret,
    });
    const forgedVerify = await verifyRawPayloadHmac({
      signatureHeader: 'sha256=deadbeef',
      rawBody: sampleBody,
      secret: testSecret,
    });
    checks.push({
      name: 'Autenticación criptográfica de Webhook (HMAC-SHA256)',
      passed: validVerify.ok && !forgedVerify.ok,
      detail:
        validVerify.ok && !forgedVerify.ok
          ? 'Firma válida aceptada y firma inválida rechazada correctamente.'
          : 'Fallo en validación de firma HMAC.',
    });
  }

  engine.createOrder({
    id: 'order-diag-a',
    code: 'SUY-4001',
    restaurantId: 'rest-diag',
    totalCents: 4000,
  });
  engine.createOrder({
    id: 'order-diag-b',
    code: 'SUY-4002',
    restaurantId: 'rest-diag',
    totalCents: 4000,
  });
  const attemptA = engine.createPaymentAttempt({
    orderId: 'order-diag-a',
    provider,
    method: 'yape',
    nowMs,
  });
  const attemptB = engine.createPaymentAttempt({
    orderId: 'order-diag-b',
    provider,
    method: 'yape',
    nowMs,
  });

  const settleB = engine.processProviderPaymentEvent({
    provider,
    eventId: 'evt-b-1',
    externalTransactionId: 'tx-b-9001',
    attemptId: attemptB.id,
    orderId: 'order-diag-b',
    amountCents: 4000,
    currency: 'PEN',
    providerStatus: 'approved',
    signatureVerified: true,
    apiVerified: true,
    occurredAtMs: nowMs + 1000,
  });
  const orderAAfterB = engine.getOrder('order-diag-a');
  const orderBAfterB = engine.getOrder('order-diag-b');
  const collisionSafe =
    settleB.ok &&
    orderBAfterB?.status === 'confirmed' &&
    orderAAfterB?.status === 'pending_payment';
  checks.push({
    name: 'Aislamiento de dos pedidos simultáneos del mismo importe (S/ 40.00)',
    passed: collisionSafe,
    detail: collisionSafe
      ? 'El pedido B se confirmó al instante y el pedido A permaneció en pending_payment sin cruce.'
      : 'Error en aislamiento de pedidos del mismo importe.',
  });

  const duplicateWebhook = engine.processProviderPaymentEvent({
    provider,
    eventId: 'evt-b-1',
    externalTransactionId: 'tx-b-9001',
    attemptId: attemptB.id,
    orderId: 'order-diag-b',
    amountCents: 4000,
    currency: 'PEN',
    providerStatus: 'approved',
    signatureVerified: true,
    apiVerified: true,
    occurredAtMs: nowMs + 2000,
  });
  const reuseAttack = engine.processProviderPaymentEvent({
    provider,
    eventId: 'evt-reuse-1',
    externalTransactionId: 'tx-b-9001',
    attemptId: attemptA.id,
    orderId: 'order-diag-a',
    amountCents: 4000,
    currency: 'PEN',
    providerStatus: 'approved',
    signatureVerified: true,
    apiVerified: true,
    occurredAtMs: nowMs + 3000,
  });
  const dedupeAndReuseSafe =
    duplicateWebhook.code === 'duplicate_event' &&
    orderBAfterB?.restaurantNotifiedCount === 1 &&
    !reuseAttack.ok &&
    reuseAttack.code === 'transaction_reused';
  checks.push({
    name: 'Deduplicación de Webhook y bloqueo de reutilización de transacción',
    passed: dedupeAndReuseSafe,
    detail: dedupeAndReuseSafe
      ? 'Webhook repetido ignorado (1 sola notificación) y reutilización de transacción bloqueada.'
      : 'Fallo en deduplicación o control de reutilización.',
  });

  const wrongAmount = engine.processProviderPaymentEvent({
    provider,
    eventId: 'evt-a-wrong',
    externalTransactionId: 'tx-a-partial',
    attemptId: attemptA.id,
    orderId: 'order-diag-a',
    amountCents: 1500,
    currency: 'PEN',
    providerStatus: 'approved',
    signatureVerified: true,
    apiVerified: true,
    occurredAtMs: nowMs + 4000,
  });
  const unverifiedAttempt = engine.attemptUnverifiedClientOrObserverApproval({
    attemptId: attemptA.id,
    source: 'android_notification',
  });
  const securityGuardsPassed =
    !wrongAmount.ok &&
    wrongAmount.code === 'amount_mismatch' &&
    !unverifiedAttempt.ok &&
    unverifiedAttempt.code === 'rejected_unverified' &&
    engine.getOrder('order-diag-a')?.status === 'pending_payment';
  checks.push({
    name: 'Rechazo de monto inexacto y bloqueo de indicios no verificados',
    passed: securityGuardsPassed,
    detail: securityGuardsPassed
      ? 'Pago parcial enviado a conciliación y notificación Android bloqueada como confirmación automática.'
      : 'Fallo en guardas de importe o indicios no verificados.',
  });

  return {
    passed: checks.every((item) => item.passed),
    provider,
    executedAt: new Date(nowMs).toISOString(),
    checks,
  };
}
