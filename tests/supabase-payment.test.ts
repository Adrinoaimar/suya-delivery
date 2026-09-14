import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { SupabasePaymentService } from '@/lib/services/SupabasePaymentService';
import { SupabaseWalletObserverService } from '@/lib/services/SupabaseWalletObserverService';
import type { PaymentIntent } from '@/types';

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
  provider_reference: null,
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

    expect(client.rpc).toHaveBeenCalledWith('refresh_payment_intent', {
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
      providerReference: null,
    });
  });

  it('envía token Culqi al backend y no maneja datos de tarjeta en Suya', async () => {
    const invoke = vi.fn(async () => ({
      data: { status: 'authorized', providerReference: 'chr_test_12345678' },
      error: null,
    }));
    const client = {
      ...fakeClient({ data: null, error: null }),
      functions: { invoke },
    } as unknown as SupabaseClient;
    const intent: PaymentIntent = {
      attemptId: 'attempt-1',
      orderId: 'order-1',
      method: 'card',
      status: 'pending',
      amount: 30,
      currency: 'PEN',
      checkoutReference: 'SUYA-AB12CD34',
      expiresAt: '2026-09-14T18:30:00.000Z',
      provider: 'culqi',
      providerReference: 'ord_test_12345678',
      qrPayload: null,
    };
    await expect(
      new SupabasePaymentService(client).chargeCard(intent, 'tkn_test_12345678', 'cliente@suya.test'),
    ).resolves.toBe('chr_test_12345678');
    expect(invoke).toHaveBeenCalledWith('charge-culqi-card', {
      body: {
        attemptId: 'attempt-1',
        method: 'card',
        tokenId: 'tkn_test_12345678',
        customerEmail: 'cliente@suya.test',
        guestAccessToken: null,
      },
    });
  });

  it('envía un token Yape Culqi al mismo flujo seguro de cargo', async () => {
    const invoke = vi.fn(async () => ({
      data: { status: 'authorized', providerReference: 'chr_test_yape123' },
      error: null,
    }));
    const client = {
      ...fakeClient({ data: null, error: null }),
      functions: { invoke },
    } as unknown as SupabaseClient;
    const intent: PaymentIntent = {
      attemptId: 'attempt-yape',
      orderId: 'order-yape',
      method: 'yape',
      status: 'pending',
      amount: 30,
      currency: 'PEN',
      checkoutReference: 'SUYA-YAPE123',
      expiresAt: '2026-09-14T18:30:00.000Z',
      provider: 'culqi',
      providerReference: 'ord_test_yape123',
      qrPayload: null,
    };
    await expect(
      new SupabasePaymentService(client).chargeCard(intent, 'ype_test_yape123', 'cliente@suya.test'),
    ).resolves.toBe('chr_test_yape123');
    expect(invoke).toHaveBeenCalledWith('charge-culqi-card', {
      body: {
        attemptId: 'attempt-yape',
        method: 'yape',
        tokenId: 'ype_test_yape123',
        customerEmail: 'cliente@suya.test',
        guestAccessToken: null,
      },
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

  it('vincula el código de constancia usando el token guest de la sesión', async () => {
    const client = fakeClient({ data: true, error: null });
    const service = new SupabasePaymentService(client);
    await expect(service.submitEvidence('order-1', ' 384 ')).resolves.toBe(true);
    expect(client.rpc).toHaveBeenCalledWith('submit_payment_evidence', {
      p_order_id: 'order-1',
      p_code: '384',
      p_guest_access_token: null,
    });
  });

  it('permite completar el código faltante desde backoffice sin exponer el código completo', async () => {
    const client = fakeClient({ data: true, error: null });
    const service = new SupabaseWalletObserverService(client);
    await expect(service.setObservationCode('observation-1', ' 482913 ')).resolves.toBe(true);
    expect(client.rpc).toHaveBeenCalledWith('set_wallet_observation_code', {
      p_observation_id: 'observation-1',
      p_code: '482913',
    });
  });
});
