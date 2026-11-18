import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/client';
import type { PaymentIntent, PaymentIntentStatus, PaymentMethod } from '@/types';
import type {
  PaymentDeclaration,
  PaymentResult,
  PaymentService,
  RoutedYapeVerification,
  WalletPaymentConfirmation,
  WalletPaymentConfirmationStatus,
} from './types';
import { readGuestOrderToken } from './guestOrderAccess';

interface PaymentIntentRow {
  attempt_id?: unknown;
  order_id?: unknown;
  method?: unknown;
  status?: unknown;
  amount?: unknown;
  currency?: unknown;
  checkout_reference?: unknown;
  expires_at?: unknown;
  provider?: unknown;
  provider_reference?: unknown;
  qr_payload?: unknown;
  observer_routed?: unknown;
  checkout_url?: unknown;
  gateway_state?: unknown;
  environment?: unknown;
}

interface PaymentReceiverLabelRow {
  account_label?: unknown;
}

interface PaymentDeclarationRow {
  declared_at?: unknown;
  payer_display_name?: unknown;
}

interface WalletPaymentConfirmationRow {
  confirmation_status?: unknown;
  payment_attempt_id?: unknown;
  observation_id?: unknown;
  observed_at?: unknown;
  payer_display_name?: unknown;
  observed_amount_cents?: unknown;
}

function requireClient(): SupabaseClient {
  if (!supabase) throw new Error('Supabase no está configurado para pagos.');
  return supabase;
}

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : value == null ? fallback : String(value);
}

function paymentStatus(value: unknown): PaymentIntentStatus {
  if (value === 'authorized' || value === 'failed' || value === 'refunded') return value;
  return 'pending';
}

function paymentMethod(value: unknown): PaymentMethod {
  if (value === 'yape' || value === 'lemon' || value === 'card') return value;
  return 'cash';
}

function numberValue(value: unknown): number {
  const result = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(result)) throw new Error('Supabase devolvió un importe inválido.');
  return result;
}

function mapIntent(row: PaymentIntentRow): PaymentIntent {
  const intent: PaymentIntent = {
    attemptId: text(row.attempt_id),
    orderId: text(row.order_id),
    method: paymentMethod(row.method),
    status: paymentStatus(row.status),
    amount: numberValue(row.amount),
    currency: 'PEN',
    checkoutReference: text(row.checkout_reference),
    expiresAt: text(row.expires_at),
    provider: text(row.provider, 'wallet_observer'),
    providerReference: typeof row.provider_reference === 'string' ? row.provider_reference : null,
    qrPayload: typeof row.qr_payload === 'string' ? row.qr_payload : null,
    ...(row.observer_routed === true ? { observerRouted: true } : {}),
    checkoutUrl: typeof row.checkout_url === 'string' ? row.checkout_url : null,
    gatewayState: typeof row.gateway_state === 'string' ? row.gateway_state : null,
    ...(row.environment === 'test' || row.environment === 'live' ? { environment: row.environment } : {}),
  };
  if (!intent.attemptId || !intent.orderId || !intent.checkoutReference) {
    throw new Error('Supabase no devolvió los datos completos del pago.');
  }
  return intent;
}

function firstRow(data: unknown): PaymentIntentRow | null {
  if (Array.isArray(data)) return (data[0] as PaymentIntentRow | undefined) ?? null;
  return data && typeof data === 'object' ? (data as PaymentIntentRow) : null;
}

function firstReceiverLabel(data: unknown): PaymentReceiverLabelRow | null {
  if (Array.isArray(data)) return (data[0] as PaymentReceiverLabelRow | undefined) ?? null;
  return data && typeof data === 'object' ? (data as PaymentReceiverLabelRow) : null;
}

function guestToken(orderId: string, supplied?: string | null): string | null {
  return supplied === undefined ? readGuestOrderToken(orderId) : supplied;
}

export class SupabasePaymentService implements PaymentService {
  private readonly client: SupabaseClient;

  constructor(client: SupabaseClient = requireClient()) {
    this.client = client;
  }

  private async withReceiverLabel(
    intent: PaymentIntent,
    suppliedGuestAccessToken?: string | null,
  ): Promise<PaymentIntent> {
    if (intent.method === 'card' || intent.provider === 'culqi' || intent.provider === 'mercadopago') return intent;
    const args = {
      p_order_id: intent.orderId,
      p_guest_access_token: guestToken(intent.orderId, suppliedGuestAccessToken),
    };
    const [{ data, error }, phone] = await Promise.all([
      this.client.rpc('get_payment_receiver_label', args),
      intent.method === 'yape' && intent.observerRouted && intent.status === 'pending'
        ? this.client.rpc('get_payment_receiver_phone', args).abortSignal(AbortSignal.timeout(4000))
        : null,
    ]);
    if (error) throw new Error(error.message);
    const label = text(firstReceiverLabel(data)?.account_label).trim();
    const receiverPhone = typeof phone?.data === 'string' && /^9\d{8}$/.test(phone.data) ? phone.data : null;
    return { ...intent, receiverLabel: label || null, ...(receiverPhone ? { receiverPhone } : {}) };
  }

  async authorize(method: PaymentMethod, amount: number): Promise<PaymentResult> {
    if (method === 'cash') {
      return {
        ok: true,
        reference: `server_${crypto.randomUUID()}`,
        message: `Pago contra entrega por ${amount.toFixed(2)} soles.`,
      };
    }
    return {
      ok: false,
      reference: '',
      message:
        'El pago digital se confirma después de crear el pedido y verificar la operación en el servidor.',
    };
  }

  async createIntent(
    orderId: string,
    method: PaymentMethod,
    guestAccessToken?: string | null,
    customerEmail?: string | null,
  ): Promise<PaymentIntent> {
    if (!orderId) throw new Error('No pudimos identificar el pedido para iniciar el pago.');
    if (method === 'cash') throw new Error('El efectivo no requiere intento digital.');
    const token = guestToken(orderId, guestAccessToken);
    if (method === 'card' || method === 'yape') {
      // El servidor decide el proveedor por restaurante; ningún flag de build activa cobros.
      const { data: current } = await this.client.rpc('get_payment_intent', {
        p_order_id: orderId, p_guest_access_token: token,
      });
      const existing = firstRow(current);
      if (existing?.observer_routed === true) return this.withReceiverLabel(mapIntent(existing), token);
      if (existing?.provider === 'mercadopago') {
        const { data, error } = await this.client.functions.invoke('payment-gateway', {
          body: { action: 'create', orderId, method, guestAccessToken: token },
        });
        if (error || data?.error) throw new Error('No pudimos abrir el cobro. Reintenta con el mismo pedido.');
        const row = firstRow(data?.paymentIntent);
        if (!row) throw new Error('El proveedor no devolvió la solicitud de cobro.');
        return mapIntent(row);
      }
    }
    const gatewayEnabled = import.meta.env.VITE_CULQI_GATEWAY_ENABLED === 'true';
    if (gatewayEnabled && (method === 'card' || method === 'yape')) {
      const { data, error } = await this.client.functions.invoke('create-culqi-order', {
        body: {
          orderId,
          method,
          guestAccessToken: token,
          customerEmail: customerEmail?.trim() || null,
        },
      });
      if (error) throw new Error(error.message);
      const row = firstRow(
        data && typeof data === 'object' && 'paymentIntent' in data ? data.paymentIntent : data,
      );
      if (!row) throw new Error('La pasarela no devolvió el intento de pago.');
      return this.withReceiverLabel(mapIntent(row), token);
    }
    const { data, error } = await this.client.rpc('refresh_payment_intent', {
      p_order_id: orderId,
      p_method: method,
      p_guest_access_token: token,
    });
    if (error) throw new Error(error.message);
    const row = firstRow(data);
    if (!row) throw new Error('Supabase no devolvió el intento de pago.');
    return this.withReceiverLabel(mapIntent(row), token);
  }

  async getCheckoutPaymentOptions(restaurantId: string) {
    if (!restaurantId) return null;
    try {
      const { data, error } = await this.client.rpc('get_public_checkout_payment_options', {
        p_restaurant_id: restaurantId,
      });
      if (error) return null;
      const row = firstRow(data) as Record<string, unknown> | null;
      if (!row) return null;
      return {
        activeProvider: text(row.active_provider, 'wallet_observer'),
        verificationMode:
          row.verification_mode === 'automatic_cloud'
            ? ('automatic_cloud' as const)
            : ('assisted_manual' as const),
        accountLabel: typeof row.account_label === 'string' ? row.account_label : null,
        supportsYape: Boolean(row.supports_yape),
        supportsLemon: Boolean(row.supports_lemon),
        supportsCard: Boolean(row.supports_card),
      };
    } catch {
      return null;
    }
  }

  async createDynamicQr(
    intent: PaymentIntent,
    suppliedGuestAccessToken?: string | null,
  ): Promise<string | null> {
    const { data, error } = await this.client.functions.invoke('payment-gateway', {
      body: {
        action: 'create_dynamic_qr',
        attemptId: intent.attemptId,
        orderId: intent.orderId,
        guestAccessToken: guestToken(intent.orderId, suppliedGuestAccessToken),
      },
    });
    if (error) throw new Error(error.message);
    if (data && typeof data === 'object' && 'qrPayload' in data && typeof data.qrPayload === 'string') {
      return data.qrPayload;
    }
    return null;
  }

  async chargeCard(
    intent: PaymentIntent,
    tokenId: string,
    customerEmail?: string | null,
    suppliedGuestAccessToken?: string | null,
  ): Promise<string> {
    if (intent.provider !== 'culqi' || (intent.method !== 'card' && intent.method !== 'yape')) {
      throw new Error('Este intento no corresponde a un token Culqi compatible.');
    }
    const tokenPattern =
      intent.method === 'card'
        ? /^tkn_(?:test|live)_[A-Za-z0-9_-]+$/
        : /^ype_(?:test|live)_[A-Za-z0-9_-]+$/;
    if (!tokenPattern.test(tokenId))
      throw new Error('El token Culqi no corresponde al método elegido.');
    const { data, error } = await this.client.functions.invoke('charge-culqi-card', {
      body: {
        attemptId: intent.attemptId,
        method: intent.method,
        tokenId,
        customerEmail: customerEmail?.trim() || null,
        guestAccessToken: guestToken(intent.orderId, suppliedGuestAccessToken),
      },
    });
    if (error) throw new Error(error.message);
    const reference =
      data && typeof data === 'object' && typeof data.providerReference === 'string'
        ? data.providerReference
        : '';
    if (!reference) throw new Error('Culqi no devolvió la referencia del cargo.');
    return reference;
  }

  async chargeYapeOtp(
    intent: PaymentIntent,
    phoneNumber: string,
    otp: string,
    customerEmail?: string | null,
    suppliedGuestAccessToken?: string | null,
  ): Promise<string> {
    const cleanPhone = phoneNumber.replace(/\D/g, '');
    const cleanOtp = otp.replace(/\D/g, '');
    if (!/^9\d{8}$/.test(cleanPhone)) {
      throw new Error('Escribe un número de celular Yape válido de 9 dígitos.');
    }
    if (!/^\d{6}$/.test(cleanOtp)) {
      throw new Error('Escribe el código de aprobación de 6 dígitos de la app Yape.');
    }
    const { data, error } = await this.client.functions.invoke('payment-gateway', {
      body: {
        action: 'charge_yape_otp',
        attemptId: intent.attemptId,
        orderId: intent.orderId,
        phoneNumber: cleanPhone,
        otp: cleanOtp,
        customerEmail: customerEmail?.trim() || null,
        guestAccessToken: guestToken(intent.orderId, suppliedGuestAccessToken),
      },
    });
    if (error) throw new Error(error.message);
    if (data && typeof data === 'object' && 'error' in data && typeof data.error === 'string') {
      throw new Error(data.error);
    }
    const reference =
      data && typeof data === 'object' && typeof data.providerReference === 'string'
        ? data.providerReference
        : '';
    if (!reference) throw new Error('La pasarela no devolvió la referencia del cobro Yape.');
    return reference;
  }

  async submitEvidence(
    orderId: string,
    code: string,
    suppliedGuestAccessToken?: string | null,
  ): Promise<boolean> {
    if (!orderId) throw new Error('No pudimos identificar el pedido.');
    if (!/^[a-z0-9-]{3,64}$/iu.test(code.trim())) {
      throw new Error('Escribe un código de operación válido.');
    }
    const { data, error } = await this.client.rpc('submit_payment_evidence', {
      p_order_id: orderId,
      p_code: code.trim(),
      p_guest_access_token: guestToken(orderId, suppliedGuestAccessToken),
    });
    if (error) throw new Error(error.message);
    return data === true;
  }

  async declarePayment(
    orderId: string,
    code?: string | null,
    payerDisplayName?: string | null,
    suppliedGuestAccessToken?: string | null,
  ): Promise<boolean> {
    if (!orderId) throw new Error('No pudimos identificar el pedido.');
    const normalizedCode = code?.trim() || null;
    if (normalizedCode && !/^[a-z0-9-]{3,64}$/iu.test(normalizedCode)) {
      throw new Error('Escribe un código de operación válido.');
    }
    const normalizedPayer = payerDisplayName?.trim() || null;
    if (normalizedPayer && (normalizedPayer.length < 2 || normalizedPayer.length > 120)) {
      throw new Error('El nombre del pagador debe tener entre 2 y 120 caracteres.');
    }
    const { data, error } = await this.client.rpc('declare_manual_payment', {
      p_order_id: orderId,
      p_code: normalizedCode,
      p_payer_display_name: normalizedPayer,
      p_guest_access_token: guestToken(orderId, suppliedGuestAccessToken),
    });
    if (error) throw new Error(error.message);
    return data === true;
  }

  async confirmWalletPayment(
    orderId: string,
    payerDisplayName: string,
    suppliedGuestAccessToken?: string | null,
  ): Promise<WalletPaymentConfirmation> {
    if (!orderId) throw new Error('No pudimos identificar el pedido.');
    const normalizedPayer = payerDisplayName.trim();
    if (normalizedPayer.length < 2 || normalizedPayer.length > 120) {
      throw new Error('Escribe el nombre que aparece en la billetera.');
    }
    const { data, error } = await this.client.rpc('confirm_manual_wallet_payment', {
      p_order_id: orderId,
      p_payer_name: normalizedPayer,
      p_guest_access_token: guestToken(orderId, suppliedGuestAccessToken),
    });
    if (error) throw new Error(error.message);
    const row = firstRow(data) as WalletPaymentConfirmationRow | null;
    const status = text(row?.confirmation_status) as WalletPaymentConfirmationStatus;
    if (!['pending', 'authorized', 'ambiguous'].includes(status)) {
      throw new Error('Supabase devolvió un estado de confirmación inválido.');
    }
    const attemptId = text(row?.payment_attempt_id);
    if (!attemptId) throw new Error('Supabase no devolvió el intento de pago.');
    return {
      status,
      attemptId,
      observationId: typeof row?.observation_id === 'string' ? row.observation_id : null,
      observedAt: typeof row?.observed_at === 'string' ? row.observed_at : null,
      payerDisplayName: typeof row?.payer_display_name === 'string' ? row.payer_display_name : null,
      observedAmountCents: null,
    };
  }

  async confirmWalletPaymentByCode(
    orderId: string,
    confirmationCode: string,
    suppliedGuestAccessToken?: string | null,
  ): Promise<WalletPaymentConfirmation> {
    if (!orderId) throw new Error('No pudimos identificar el pedido.');
    const normalizedCode = confirmationCode.trim();
    if (!/^\d{3}$/.test(normalizedCode)) {
      throw new Error('Escribe el código Yape de 3 dígitos.');
    }
    const { data, error } = await this.client.rpc('confirm_manual_wallet_payment_by_code_v2', {
      p_order_id: orderId,
      p_confirmation_code: normalizedCode,
      p_guest_access_token: guestToken(orderId, suppliedGuestAccessToken),
    });
    if (error) throw new Error(error.message);
    const row = firstRow(data) as WalletPaymentConfirmationRow | null;
    const status = text(row?.confirmation_status) as WalletPaymentConfirmationStatus;
    if (
      !['pending', 'authorized', 'ambiguous', 'code_mismatch', 'amount_mismatch'].includes(status)
    ) {
      throw new Error('Supabase devolvió un estado de confirmación inválido.');
    }
    const attemptId = text(row?.payment_attempt_id);
    if (!attemptId) throw new Error('Supabase no devolvió el intento de pago.');
    return {
      status,
      attemptId,
      observationId: typeof row?.observation_id === 'string' ? row.observation_id : null,
      observedAt: typeof row?.observed_at === 'string' ? row.observed_at : null,
      payerDisplayName: typeof row?.payer_display_name === 'string' ? row.payer_display_name : null,
      observedAmountCents:
        row?.observed_amount_cents == null ? null : numberValue(row.observed_amount_cents),
    };
  }

  async getPaymentDeclaration(
    orderId: string,
    suppliedGuestAccessToken?: string | null,
  ): Promise<PaymentDeclaration | null> {
    if (!orderId) return null;
    const { data, error } = await this.client.rpc('get_payment_declaration', {
      p_order_id: orderId,
      p_guest_access_token: guestToken(orderId, suppliedGuestAccessToken),
    });
    if (error) throw new Error(error.message);
    const row = firstRow(data) as PaymentDeclarationRow | null;
    const declaredAt = text(row?.declared_at);
    if (!declaredAt) return null;
    return {
      declaredAt,
      payerDisplayName: typeof row?.payer_display_name === 'string' ? row.payer_display_name : null,
    };
  }

  async getExpiredWalletClaim(orderId: string, attemptId: string): Promise<string | null> {
    const { data, error } = await this.client.rpc('get_expired_wallet_qr_claim', {
      p_order_id: orderId, p_payment_attempt_id: attemptId, p_guest_access_token: guestToken(orderId),
    }).abortSignal(AbortSignal.timeout(8000));
    if (error) throw new Error(error.message);
    return typeof data === 'string' ? data : null;
  }

  async reportExpiredWalletClaim(orderId: string, attemptId: string, payerName: string, receiptReference: string | null): Promise<string> {
    const { data, error } = await this.client.rpc('report_expired_wallet_qr', {
      p_order_id: orderId, p_payment_attempt_id: attemptId, p_payer_name: payerName,
      p_receipt_reference: receiptReference, p_guest_access_token: guestToken(orderId),
    }).abortSignal(AbortSignal.timeout(10000));
    if (error || typeof data !== 'string') throw new Error('No se pudo guardar el reclamo.');
    return data;
  }

  async verifyRoutedYapeCode(orderId: string, code: string, payerDisplayName: string | null): Promise<RoutedYapeVerification> {
    const { data, error } = await this.client.rpc('verify_routed_yape_code', {
      p_order_id: orderId,
      p_code: code,
      p_payer_display_name: payerDisplayName,
      p_guest_access_token: guestToken(orderId),
    }).abortSignal(AbortSignal.timeout(10_000));
    if (error) throw new Error(error.message);
    if (data === 'authorized' || data === 'code_mismatch' || data === 'unobserved' ||
      data === 'name_required' || data === 'review' || data === 'retry_limit' || data === 'expired') return data;
    throw new Error('Respuesta de verificación inválida.');
  }

  async retryRoutedPayment(orderId: string, suppliedGuestAccessToken?: string | null): Promise<void> {
    const { error } = await this.client.rpc('retry_routed_wallet_payment', {
      p_order_id: orderId,
      p_guest_access_token: guestToken(orderId, suppliedGuestAccessToken),
    });
    if (error) throw new Error(error.message);
  }

  async syncAutoCloudForOrder(orderId: string, guestAccessToken?: string | null): Promise<void> {
    if (!orderId) return;
    await this.client.functions
      .invoke('payment-gateway', {
        body: {
          action: 'sync_gmail_autocloud',
          orderId,
          guestAccessToken: guestToken(orderId, guestAccessToken),
        },
      })
      .catch(() => undefined);
  }

  async getIntent(
    orderId: string,
    guestAccessToken?: string | null,
  ): Promise<PaymentIntent | null> {
    if (!orderId) return null;
    const token = guestToken(orderId, guestAccessToken);
    const { data, error } = await this.client.rpc('get_payment_intent', {
      p_order_id: orderId,
      p_guest_access_token: token,
    });
    if (error) throw new Error(error.message);
    const row = firstRow(data);
    if (row?.provider === 'mercadopago') {
      const { data: gateway, error: gatewayError } = await this.client.rpc('get_gateway_payment_intent', {
        p_order_id: orderId, p_guest_access_token: token,
      });
      if (gatewayError) throw new Error('No pudimos consultar el estado del cobro.');
      const gatewayRow = firstRow(gateway);
      return gatewayRow ? mapIntent(gatewayRow) : null;
    }
    return row ? this.withReceiverLabel(mapIntent(row), token) : null;
  }
}
