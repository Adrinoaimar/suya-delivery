import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openCulqiCheckout } from '@/lib/payments/culqiCheckout';
import type { PaymentIntent } from '@/types';

class FakeCulqiCheckout {
  static instances: FakeCulqiCheckout[] = [];
  publicKey: string;
  config: Record<string, unknown>;
  token: { id?: string } | undefined;
  order: { id?: string } | undefined;
  error: { user_message?: string; merchant_message?: string } | undefined;
  culqi: (() => void) | undefined;
  openCalls = 0;
  closeCalls = 0;

  constructor(
    publicKey: string,
    config: Record<string, unknown>,
  ) {
    this.publicKey = publicKey;
    this.config = config;
    FakeCulqiCheckout.instances.push(this);
  }

  open() {
    this.openCalls += 1;
  }

  close() {
    this.closeCalls += 1;
  }
}

let lastCheckout: FakeCulqiCheckout | undefined;

const intent: PaymentIntent = {
  attemptId: 'attempt-1',
  orderId: 'order-1',
  method: 'yape',
  status: 'pending',
  amount: 30,
  currency: 'PEN',
  checkoutReference: 'SUYA-AB12CD34',
  expiresAt: '2099-09-14T18:30:00.000Z',
  provider: 'culqi',
  providerReference: 'ord_test_suya_123',
  qrPayload: null,
};

beforeEach(() => {
  vi.stubEnv('VITE_CULQI_PUBLIC_KEY', 'pk_test_suya');
  window.CulqiCheckout = FakeCulqiCheckout as never;
  FakeCulqiCheckout.instances = [];
  lastCheckout = undefined;
});

afterEach(() => {
  delete window.CulqiCheckout;
  vi.unstubAllEnvs();
});

describe('openCulqiCheckout', () => {
  it('configura Custom Checkout con orden, monto exacto y solo Yape', async () => {
    const onToken = vi.fn().mockResolvedValue(undefined);

    await openCulqiCheckout({
      intent,
      method: 'yape',
      customerEmail: 'cliente@example.com',
      onToken,
      onOrder: vi.fn(),
      onError: vi.fn(),
    });

    lastCheckout = FakeCulqiCheckout.instances.at(-1);

    expect(lastCheckout?.publicKey).toBe('pk_test_suya');
    expect(lastCheckout?.openCalls).toBe(1);
    expect(lastCheckout?.config).toMatchObject({
      settings: {
        amount: 3000,
        currency: 'PEN',
        order: 'ord_test_suya_123',
      },
      client: { email: 'cliente@example.com' },
      options: {
        modal: true,
        paymentMethods: { tarjeta: false, yape: true },
        paymentMethodsSort: ['yape'],
      },
    });

    lastCheckout!.token = { id: 'ype_test_suya_123' };
    lastCheckout!.culqi?.();

    expect(lastCheckout?.closeCalls).toBe(1);
    expect(onToken).toHaveBeenCalledWith('ype_test_suya_123');
  });

  it('limita Custom Checkout a tarjeta cuando el pedido usa tarjeta', async () => {
    await openCulqiCheckout({
      intent: { ...intent, method: 'card' },
      method: 'card',
      onToken: vi.fn().mockResolvedValue(undefined),
      onOrder: vi.fn(),
      onError: vi.fn(),
    });

    lastCheckout = FakeCulqiCheckout.instances.at(-1);

    expect(lastCheckout?.config).toMatchObject({
      options: {
        paymentMethods: { tarjeta: true, yape: false },
        paymentMethodsSort: ['tarjeta'],
      },
    });
  });
});
