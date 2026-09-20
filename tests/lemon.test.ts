import { describe, expect, it, vi } from 'vitest';
import { isLemonPaymentEnabled, lemonQrImage, parseLemonPaymentIntent } from '@/lib/payments/lemon';

describe('pago Lemon', () => {
  it('habilita QR solo cuando existe configuración', () => {
    vi.stubEnv('VITE_LEMON_QR_IMAGE', '  data:image/jpeg;base64,AA==  ');
    expect(lemonQrImage()).toBe('data:image/jpeg;base64,AA==');
    expect(isLemonPaymentEnabled()).toBe(true);

    vi.stubEnv('VITE_LEMON_QR_IMAGE', '');
    expect(lemonQrImage()).toBeNull();
    expect(isLemonPaymentEnabled()).toBe(false);
  });

  it('valida respuesta del intento y normaliza monto', () => {
    expect(
      parseLemonPaymentIntent([
        {
          attempt_id: 'attempt-1',
          order_id: 'order-1',
          status: 'pending',
          amount: '28.50',
          provider_reference: 'lemon:order-1',
          checkout_reference: 'order:SUY-10001:lemon',
          expires_at: '2026-09-20T20:00:00.000Z',
        },
      ]),
    ).toMatchObject({
      attemptId: 'attempt-1',
      orderId: 'order-1',
      provider: 'lemon',
      method: 'lemon',
      amount: 28.5,
      currency: 'PEN',
    });
  });

  it('rechaza respuestas incompletas', () => {
    expect(() => parseLemonPaymentIntent({ status: 'pending' })).toThrow(
      'Respuesta Lemon incompleta',
    );
  });
});
