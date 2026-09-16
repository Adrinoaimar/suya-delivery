import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PaymentInstructions } from '@/components/payment/PaymentInstructions';
import type { Order, PaymentIntent } from '@/types';

const mocks = vi.hoisted(() => ({
  getIntent: vi.fn(),
  createIntent: vi.fn(),
  chargeCard: vi.fn(),
  submitEvidence: vi.fn(),
  declarePayment: vi.fn(),
  getPaymentDeclaration: vi.fn(),
  notify: vi.fn(),
  openCulqiCheckout: vi.fn(),
}));

vi.mock('@/lib/services', () => ({
  paymentService: {
    getIntent: mocks.getIntent,
    createIntent: mocks.createIntent,
    chargeCard: mocks.chargeCard,
    submitEvidence: mocks.submitEvidence,
    declarePayment: mocks.declarePayment,
    getPaymentDeclaration: mocks.getPaymentDeclaration,
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

beforeEach(() => {
  mocks.getPaymentDeclaration.mockResolvedValue(null);
  mocks.declarePayment.mockResolvedValue(true);
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

  it('limpia la constancia al cambiar el intento del mismo pedido', async () => {
    mocks.declarePayment.mockResolvedValueOnce(true);
    const { rerender } = render(<PaymentInstructions order={order(pendingIntent)} />);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Ya pagué' })).toBeEnabled());
    await act(async () => screen.getByRole('button', { name: 'Ya pagué' }).click());
    fireEvent.change(screen.getByLabelText('Código de constancia'), { target: { value: '384' } });
    await act(async () => {
      screen.getByRole('button', { name: 'Vincular código' }).click();
    });
    expect(await screen.findByRole('button', { name: 'Cambiar código' })).toBeInTheDocument();

    rerender(
      <PaymentInstructions
        order={order({
          ...pendingIntent,
          attemptId: 'attempt-2',
          checkoutReference: 'SUYA-EF56GH78',
        })}
      />,
    );

    await waitFor(() => expect(screen.getByRole('button', { name: 'Ya pagué' })).toBeEnabled());
    await act(async () => screen.getByRole('button', { name: 'Ya pagué' }).click());
    await waitFor(() => expect(screen.getByLabelText('Código de constancia')).toHaveValue(''));
    expect(screen.getByRole('button', { name: 'Guardar pagador' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Cambiar código' })).not.toBeInTheDocument();
    expect(screen.getByText('SUYA-EF56GH78')).toBeInTheDocument();
  });

  it('permite corregir el código de la constancia mientras sigue pendiente', async () => {
    mocks.declarePayment.mockResolvedValueOnce(true);
    render(<PaymentInstructions order={order(pendingIntent)} />);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Ya pagué' })).toBeEnabled());
    await act(async () => screen.getByRole('button', { name: 'Ya pagué' }).click());
    const input = screen.getByLabelText('Código de constancia');
    expect(input).toHaveAttribute('inputmode', 'numeric');
    fireEvent.change(input, { target: { value: '384' } });
    await act(async () => {
      screen.getByRole('button', { name: 'Vincular código' }).click();
    });

    expect(await screen.findByRole('button', { name: 'Cambiar código' })).toBeInTheDocument();
    await act(async () => {
      screen.getByRole('button', { name: 'Cambiar código' }).click();
    });
    expect(screen.getByLabelText('Código de constancia')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Guardar pagador' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Código de constancia'), { target: { value: '482' } });
    expect(screen.getByRole('button', { name: 'Vincular código' })).toBeEnabled();
  });

  it('permite declarar que pagó otra persona sin inventar una confirmación', async () => {
    render(<PaymentInstructions order={order(pendingIntent)} />);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Ya pagué' })).toBeEnabled());
    await act(async () => screen.getByRole('button', { name: 'Ya pagué' }).click());
    fireEvent.change(screen.getByLabelText('Nombre del pagador (opcional)'), {
      target: { value: 'Otra Persona' },
    });
    await act(async () => screen.getByRole('button', { name: 'Guardar pagador' }).click());

    expect(mocks.declarePayment).toHaveBeenCalledWith('order-1', null, 'Otra Persona');
    expect(screen.getByText('Pago en revisión')).toBeInTheDocument();
    expect(mocks.notify).toHaveBeenCalledWith(
      'Pagador guardado. Caja podrá usar este dato para revisar el pago.',
      'success',
    );
  });

  it('preserva la revisión y no ofrece un segundo cobro si el intento vencido ya fue declarado', async () => {
    const expiredIntent = { ...pendingIntent, expiresAt: '2020-01-01T00:00:00.000Z' };
    mocks.getPaymentDeclaration.mockResolvedValueOnce(null);
    mocks.declarePayment.mockResolvedValueOnce(true);
    render(<PaymentInstructions order={order(expiredIntent)} />);

    const paid = await screen.findByRole('button', { name: 'Ya pagué' });
    await waitFor(() => expect(paid).toBeEnabled());
    await act(async () => paid.click());

    expect(mocks.declarePayment).toHaveBeenCalledWith('order-1');
    expect(screen.getByText('Pago en revisión')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Aún no pagué' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Generar nueva referencia' })).not.toBeInTheDocument();
  });

  it('solo renueva una referencia vencida cuando el cliente declara que aún no pagó', async () => {
    const expiredIntent = { ...pendingIntent, expiresAt: '2020-01-01T00:00:00.000Z' };
    const renewedIntent = { ...pendingIntent, attemptId: 'attempt-2', checkoutReference: 'SUYA-NEWREF1' };
    mocks.getPaymentDeclaration.mockResolvedValueOnce(null);
    mocks.createIntent.mockResolvedValueOnce(renewedIntent);
    render(<PaymentInstructions order={order(expiredIntent)} />);

    const notPaid = await screen.findByRole('button', { name: 'Aún no pagué' });
    await waitFor(() => expect(notPaid).toBeEnabled());
    await act(async () => notPaid.click());

    expect(mocks.createIntent).toHaveBeenCalledWith('order-1', 'yape');
    expect(screen.getByText('SUYA-NEWREF1')).toBeInTheDocument();
  });

  it('no invita a repetir un pago devuelto ni muestra su QR', () => {
    const refundedIntent = {
      ...pendingIntent,
      status: 'refunded' as const,
      qrPayload: 'https://example.test/qr.svg',
    };
    render(<PaymentInstructions order={order(refundedIntent)} />);

    expect(
      screen.getByText(
        'Este pago fue devuelto. No vuelvas a pagar desde esta pantalla; contacta al restaurante para revisar el siguiente paso.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ya pagué' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Aún no pagué' })).not.toBeInTheDocument();
    expect(screen.queryByText('QR del negocio')).not.toBeInTheDocument();
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
      'Pago enviado. El servidor actualizará esta pantalla cuando valide el pago.',
      'success',
    );
    expect(screen.queryByText(/Culqi|webhook/i)).not.toBeInTheDocument();
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

  it('refresca el intento fallido para que un reintento no use la referencia vieja', async () => {
    const gatewayIntent: PaymentIntent = {
      ...pendingIntent,
      method: 'card',
      provider: 'culqi',
      providerReference: 'ord_test_suya_declined',
    };
    const failedIntent = { ...gatewayIntent, status: 'failed' as const };
    mocks.chargeCard.mockRejectedValueOnce(new Error('Culqi rechazó el pago'));
    mocks.getIntent.mockResolvedValueOnce(failedIntent);
    mocks.openCulqiCheckout.mockImplementationOnce(
      async (options: { onToken: (tokenId: string) => Promise<void> }) => {
        await options.onToken('tkn_test_declined');
      },
    );
    sessionStorage.setItem('suya.payment-email:order-1', 'cliente@example.com');
    render(<PaymentInstructions order={order(gatewayIntent)} />);

    await act(async () => {
      screen.getByRole('button', { name: 'Pagar con tarjeta' }).click();
    });

    expect(mocks.getIntent).toHaveBeenCalledWith('order-1');
    expect(screen.getByRole('button', { name: 'Reintentar pago' })).toBeEnabled();
  });

  it('fuerza un reintento nuevo si no puede refrescar el rechazo del servidor', async () => {
    const gatewayIntent: PaymentIntent = {
      ...pendingIntent,
      method: 'card',
      provider: 'culqi',
      providerReference: 'ord_test_suya_refresh_unavailable',
    };
    mocks.chargeCard.mockRejectedValueOnce(new Error('Culqi rechazó el pago'));
    mocks.getIntent.mockRejectedValueOnce(new Error('Red no disponible'));
    mocks.openCulqiCheckout.mockImplementationOnce(
      async (options: { onToken: (tokenId: string) => Promise<void> }) => {
        await options.onToken('tkn_test_refresh_unavailable');
      },
    );
    sessionStorage.setItem('suya.payment-email:order-1', 'cliente@example.com');
    render(<PaymentInstructions order={order(gatewayIntent)} />);

    await act(async () => {
      screen.getByRole('button', { name: 'Pagar con tarjeta' }).click();
    });

    expect(screen.getByRole('button', { name: 'Reintentar pago' })).toBeEnabled();
  });

  it('mantiene bloqueado el cargo si Culqi entrega el token antes de cerrar open', async () => {
    const gatewayIntent: PaymentIntent = {
      ...pendingIntent,
      method: 'card',
      provider: 'culqi',
      providerReference: 'ord_test_suya_sync_token',
    };
    let rejectCharge!: (cause: Error) => void;
    mocks.chargeCard.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectCharge = reject;
        }),
    );
    mocks.getIntent.mockResolvedValueOnce({ ...gatewayIntent, status: 'failed' });
    mocks.openCulqiCheckout.mockImplementationOnce(
      (options: { onToken: (tokenId: string) => Promise<void> }) => {
        void options.onToken('tkn_test_sync_token');
        return Promise.resolve();
      },
    );
    sessionStorage.setItem('suya.payment-email:order-1', 'cliente@example.com');
    render(<PaymentInstructions order={order(gatewayIntent)} />);

    await act(async () => {
      screen.getByRole('button', { name: 'Pagar con tarjeta' }).click();
    });
    await waitFor(() => expect(mocks.chargeCard).toHaveBeenCalled());

    expect(screen.getByRole('button', { name: 'Procesando…' })).toBeDisabled();

    await act(async () => {
      rejectCharge(new Error('Culqi rechazó el pago'));
    });

    expect(screen.getByRole('button', { name: 'Reintentar pago' })).toBeEnabled();
  });

  it('ignora un callback duplicado de token mientras el primer cargo sigue en curso', async () => {
    const gatewayIntent: PaymentIntent = {
      ...pendingIntent,
      method: 'card',
      provider: 'culqi',
      providerReference: 'ord_test_suya_duplicate_token',
    };
    let resolveCharge!: (reference: string) => void;
    mocks.chargeCard.mockImplementationOnce(
      () => new Promise((resolve) => { resolveCharge = resolve; }),
    );
    mocks.openCulqiCheckout.mockImplementationOnce(
      (options: { onToken: (tokenId: string) => Promise<void> }) => {
        void options.onToken('tkn_test_duplicate_token');
        void options.onToken('tkn_test_duplicate_token');
        return Promise.resolve();
      },
    );
    sessionStorage.setItem('suya.payment-email:order-1', 'cliente@example.com');
    render(<PaymentInstructions order={order(gatewayIntent)} />);

    await act(async () => {
      screen.getByRole('button', { name: 'Pagar con tarjeta' }).click();
    });
    await waitFor(() => expect(mocks.chargeCard).toHaveBeenCalledTimes(1));

    resolveCharge('chr_test_duplicate_token');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Pago verificado' })).toBeDisabled(),
    );
    expect(mocks.chargeCard).toHaveBeenCalledTimes(1);
  });
});
