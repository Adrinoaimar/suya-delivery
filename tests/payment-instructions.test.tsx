import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PaymentInstructions } from '@/components/payment/PaymentInstructions';
import type { Order, PaymentIntent } from '@/types';

const mocks = vi.hoisted(() => ({
  getIntent: vi.fn(),
  createIntent: vi.fn(),
  submitEvidence: vi.fn(),
  notify: vi.fn(),
  openCulqiCheckout: vi.fn(),
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
  openCulqiCheckout: mocks.openCulqiCheckout,
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
  sessionStorage.clear();
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

  it('bloquea reintentos del QR mientras espera el webhook de Culqi', async () => {
    const gatewayIntent: PaymentIntent = {
      ...pendingIntent,
      provider: 'culqi',
      providerReference: 'ord_test_suya_123',
    };
    mocks.openCulqiCheckout.mockImplementationOnce(async (options: { onOrder: () => void }) => {
      options.onOrder();
    });
    sessionStorage.setItem('suya.payment-email:order-1', 'cliente@example.com');
    render(<PaymentInstructions order={order(gatewayIntent)} />);

    const button = screen.getByRole('button', { name: 'Abrir QR Yape' });
    await act(async () => {
      button.click();
    });

    expect(screen.getByRole('button', { name: 'Esperando confirmación…' })).toBeDisabled();
    expect(mocks.notify).toHaveBeenCalledWith(
      'Pago enviado. Culqi confirmará el monto mediante webhook; esta pantalla se actualizará sola.',
      'success',
    );
  });

  it('no deja el botón bloqueado si el usuario cierra el checkout sin completar el pago', async () => {
    const gatewayIntent: PaymentIntent = {
      ...pendingIntent,
      provider: 'culqi',
      providerReference: 'ord_test_suya_cancel',
    };
    mocks.openCulqiCheckout.mockResolvedValueOnce(undefined);
    sessionStorage.setItem('suya.payment-email:order-1', 'cliente@example.com');
    render(<PaymentInstructions order={order(gatewayIntent)} />);

    const button = screen.getByRole('button', { name: 'Abrir QR Yape' });
    await act(async () => {
      button.click();
    });

    expect(screen.getByRole('button', { name: 'Abrir QR Yape' })).not.toBeDisabled();
  });
});
