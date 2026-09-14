import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/client';
import type { PaymentIntent, PaymentIntentStatus, PaymentMethod } from '@/types';
import type { PaymentResult, PaymentService } from './types';

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
  qr_payload?: unknown;
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
    qrPayload: typeof row.qr_payload === 'string' ? row.qr_payload : null,
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

export class SupabasePaymentService implements PaymentService {
  private readonly client: SupabaseClient;

  constructor(client: SupabaseClient = requireClient()) {
    this.client = client;
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
  ): Promise<PaymentIntent> {
    if (!orderId) throw new Error('No pudimos identificar el pedido para iniciar el pago.');
    if (method === 'cash') throw new Error('El efectivo no requiere intento digital.');
    const { data, error } = await this.client.rpc('create_payment_intent', {
      p_order_id: orderId,
      p_method: method,
      p_guest_access_token: guestAccessToken ?? null,
    });
    if (error) throw new Error(error.message);
    const row = firstRow(data);
    if (!row) throw new Error('Supabase no devolvió el intento de pago.');
    return mapIntent(row);
  }

  async getIntent(
    orderId: string,
    guestAccessToken?: string | null,
  ): Promise<PaymentIntent | null> {
    if (!orderId) return null;
    const token =
      guestAccessToken ??
      (() => {
        try {
          return sessionStorage.getItem(`suya.guest-order-token:${orderId}`);
        } catch {
          return null;
        }
      })();
    const { data, error } = await this.client.rpc('get_payment_intent', {
      p_order_id: orderId,
      p_guest_access_token: token,
    });
    if (error) throw new Error(error.message);
    const row = firstRow(data);
    return row ? mapIntent(row) : null;
  }
}
