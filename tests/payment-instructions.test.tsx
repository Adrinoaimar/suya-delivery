import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PaymentInstructions } from '@/components/payment/PaymentInstructions';
import type { Order, PaymentIntent } from '@/types';

const mocks = vi.hoisted(() => ({
  getIntent: vi.fn(),
  createIntent: vi.fn(),
  submitEvidence: vi.fn(),
  notify: vi.fn(),
}));

vi.mock('@/lib/services', () => ({
  paymentService: {
    getIntent: mocks.getIntent,
    createIntent: mocks.createIntent,
    submitEvidence: mocks.submitEvidence,
  },
  notificationService: { notify: mocks.notify },
}));

vi.mock('@/lib/payments/culqiCheckout', () => ({
  openCulqiCheckout: vi.fn(),
}));

const pendingIntent: PaymentIntent = {
  attemptId: 'attempt-1',
  orderId: 'order-1',
  method: 'yape',
  status: 'pending',
  amount: 30,
  currency: 'PEN',
  checkoutReference: 'SUYA-AB12CD34',
  expiresAt: '2099-09-14T18:30:00.000Z',
  provider: 'wallet_observer',
  providerReference: null,
  qrPayload: null,
};

function order(paymentIntent: PaymentIntent): Pick<Order, 'id' | 'code' | 'total' | 'paymentMethod' | 'paymentIntent'> {
  return {
    id: paymentIntent.orderId,
    code: 'SUY-10001',
    total: paymentIntent.amount,
    paymentMethod: paymentIntent.method,
    paymentIntent,
  };
}

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe('PaymentInstructions', () => {
  it('reflects server authorization when the parent order refreshes', () => {
    const { rerender } = render(<PaymentInstructions order={order(pendingIntent)} />);
    expect(screen.getByText('Pendiente de verificación')).toBeInTheDocument();

    rerender(
      <PaymentInstructions
        order={order({ ...pendingIntent, status: 'authorized', providerReference: 'wallet_observation:1' })}
      />,
    );

    expect(screen.getByText('Pago verificado')).toBeInTheDocument();
  });

  it('polls manual wallet intents while they remain pending', async () => {
    vi.useFakeTimers();
    mocks.getIntent.mockResolvedValue({ ...pendingIntent, status: 'authorized' });
    render(<PaymentInstructions order={order(pendingIntent)} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });

    expect(mocks.getIntent).toHaveBeenCalledWith('order-1');
  });
});
