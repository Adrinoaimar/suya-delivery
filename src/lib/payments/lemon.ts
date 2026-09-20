import { supabase } from '@/lib/supabase/client';

export interface LemonPaymentIntent {
  attemptId: string;
  orderId: string;
  provider: 'lemon';
  method: 'lemon';
  status: 'pending' | 'authorized' | 'failed' | 'refunded';
  amount: number;
  currency: 'PEN';
  providerReference: string;
  checkoutReference: string;
  expiresAt: string;
}

export function lemonQrImage(): string | null {
  const value = import.meta.env.VITE_LEMON_QR_IMAGE?.trim();
  return value || null;
}

export function isLemonPaymentEnabled(): boolean {
  return Boolean(lemonQrImage());
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Respuesta Lemon incompleta: falta ${field}.`);
  }
  return value;
}

function amount(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0)
    throw new Error('Respuesta Lemon devolvió un monto inválido.');
  return parsed;
}

function status(value: unknown): LemonPaymentIntent['status'] {
  if (value === 'pending' || value === 'authorized' || value === 'failed' || value === 'refunded') {
    return value;
  }
  throw new Error('Respuesta Lemon devolvió un estado inválido.');
}

export function parseLemonPaymentIntent(value: unknown): LemonPaymentIntent {
  const row = record(Array.isArray(value) ? value[0] : value);
  if (!row) throw new Error('Lemon devolvió un intento de pago inválido.');
  return {
    attemptId: text(row.attempt_id, 'attempt_id'),
    orderId: text(row.order_id, 'order_id'),
    provider: 'lemon',
    method: 'lemon',
    status: status(row.status),
    amount: amount(row.amount),
    currency: 'PEN',
    providerReference: text(row.provider_reference, 'provider_reference'),
    checkoutReference: text(row.checkout_reference, 'checkout_reference'),
    expiresAt: text(row.expires_at, 'expires_at'),
  };
}

export async function createLemonPaymentIntent(input: {
  orderId: string;
  guestAccessToken?: string;
}): Promise<LemonPaymentIntent> {
  if (!supabase) throw new Error('Supabase no está configurado para pagos Lemon.');
  const { data, error } = await supabase.rpc('create_lemon_payment_intent', {
    p_order_id: input.orderId,
    p_guest_access_token: input.guestAccessToken ?? null,
  });
  if (error) throw new Error(error.message || 'No pudimos registrar el pago Lemon.');
  return parseLemonPaymentIntent(data);
}
