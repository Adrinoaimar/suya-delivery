import { describe, expect, it } from 'vitest';
import { isIzipayGatewayEnabled, parseIzipayPaymentSession } from '@/lib/payments/izipay';

function validResponse() {
  return {
    paymentIntent: {
      attempt_id: 'attempt-1',
      order_id: '10000000-0000-4000-8000-000000000001',
      method: 'yape',
      status: 'pending',
      amount: '28.00',
      currency: 'PEN',
      checkout_reference: 'order:1:izipay:qr',
      expires_at: '2026-09-20T20:00:00.000Z',
      provider: 'izipay',
      provider_reference: 'tx-12345',
    },
    izipaySession: {
      authorization: 'ephemeral-token',
      keyRSA: 'ephemeral-key',
      transactionId: 'tx-12345',
      merchantCode: 'merchant-1',
      orderNumber: 'order:1:izipay:qr',
      urlIPN: 'https://project.supabase.co/functions/v1/izipay-webhook',
      order: {
        orderNumber: 'order:1:izipay:qr',
        currency: 'PEN',
        amount: '28.00',
        processType: 'AT',
        merchantBuyerId: '10000000-0000-4000-8000-000000000001',
        dateTimeTransaction: '20260920200000',
        payMethod: 'QR',
      },
      billing: {
        firstName: 'Ana',
        lastName: 'Torres',
        email: 'ana@example.com',
        phoneNumber: '+51987654321',
        street: 'Av. Principal 123',
        city: 'Sullana',
        state: 'Piura',
        country: 'PE',
        postalCode: '20101',
        documentType: 'DNI',
        document: '00000000',
      },
    },
  };
}

describe('Izipay payment session', () => {
  it('normaliza sesión server-side y conserva monto como número', () => {
    const result = parseIzipayPaymentSession(validResponse());

    expect(result.paymentIntent).toMatchObject({
      amount: 28,
      currency: 'PEN',
      provider: 'izipay',
      method: 'yape',
    });
    expect(result.izipaySession.order.payMethod).toBe('QR');
  });

  it('rechaza respuesta incompleta antes de cargar el SDK', () => {
    expect(() => parseIzipayPaymentSession({ paymentIntent: {} })).toThrow(
      'sesión de pago inválida',
    );
    expect(() =>
      parseIzipayPaymentSession({
        ...validResponse(),
        izipaySession: { ...validResponse().izipaySession, keyRSA: '' },
      }),
    ).toThrow('falta izipaySession.keyRSA');
  });

  it('mantiene gateway desactivado por defecto y permite activación explícita', () => {
    vi.stubEnv('VITE_IZIPAY_GATEWAY_ENABLED', 'false');
    expect(isIzipayGatewayEnabled()).toBe(false);
    vi.stubEnv('VITE_IZIPAY_GATEWAY_ENABLED', 'true');
    expect(isIzipayGatewayEnabled()).toBe(true);
  });
});
