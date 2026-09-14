import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { SupabasePaymentService } from '@/lib/services/SupabasePaymentService';

function fakeClient(response: { data: unknown; error: { message: string } | null }) {
  return {
    rpc: vi.fn(async () => response),
  } as unknown as SupabaseClient & { rpc: ReturnType<typeof vi.fn> };
}

const intentRow = {
  attempt_id: 'attempt-1',
  order_id: 'order-1',
  method: 'yape',
  status: 'pending',
  amount: '30.00',
  currency: 'PEN',
  checkout_reference: 'SUYA-AB12CD34',
  expires_at: '2026-09-14T18:30:00.000Z',
  provider: 'wallet_observer',
  qr_payload: 'yape://public-business-qr',
};

describe('SupabasePaymentService', () => {
  it('envía el token guest y mapea el importe server-side', async () => {
    const client = fakeClient({ data: [intentRow], error: null });
    const intent = await new SupabasePaymentService(client).createIntent(
      'order-1',
      'yape',
      'guest-token',
    );

    expect(client.rpc).toHaveBeenCalledWith('create_payment_intent', {
      p_order_id: 'order-1',
      p_method: 'yape',
      p_guest_access_token: 'guest-token',
    });
    expect(intent).toMatchObject({
      orderId: 'order-1',
      method: 'yape',
      amount: 30,
      checkoutReference: 'SUYA-AB12CD34',
      qrPayload: 'yape://public-business-qr',
    });
  });

  it('no oculta errores del RPC ni acepta una respuesta incompleta', async () => {
    const failed = fakeClient({ data: null, error: { message: 'payment provider unavailable' } });
    await expect(
      new SupabasePaymentService(failed).createIntent('order-1', 'lemon'),
    ).rejects.toThrow('payment provider unavailable');

    const incomplete = fakeClient({
      data: [{ ...intentRow, checkout_reference: null }],
      error: null,
    });
    await expect(
      new SupabasePaymentService(incomplete).createIntent('order-1', 'yape'),
    ).rejects.toThrow('datos completos');
  });
});
