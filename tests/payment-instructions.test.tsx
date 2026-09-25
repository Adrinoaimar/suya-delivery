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
  confirmWalletPayment: vi.fn(),
  confirmWalletPaymentByCode: vi.fn(),
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
    confirmWalletPayment: mocks.confirmWalletPayment,
    confirmWalletPaymentByCode: mocks.confirmWalletPaymentByCode,
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

function order(
  paymentIntent: PaymentIntent,
  status: Order['status'] = 'confirmed',
  cancellationReason: string | null = null,
): Pick<
  Order,
  | 'id'
  | 'code'
  | 'total'
  | 'storeName'
  | 'paymentMethod'
  | 'paymentIntent'
  | 'status'
  | 'cancellationReason'
> {
  return {
    id: paymentIntent.orderId,
    code: 'SUY-10001',
    storeName: 'Andá Paya Cevichería',
    total: paymentIntent.amount,
    paymentMethod: paymentIntent.method,
    paymentIntent,
    status,
    cancellationReason,
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
  mocks.confirmWalletPayment.mockResolvedValue({
    status: 'pending',
    attemptId: 'attempt-1',
    observationId: null,
    observedAt: null,
    payerDisplayName: 'Otra Persona',
    observedAmountCents: null,
  });
  mocks.confirmWalletPaymentByCode.mockResolvedValue({
    status: 'pending',
    attemptId: 'attempt-1',
    observationId: null,
    observedAt: null,
    payerDisplayName: 'Otra Persona',
    observedAmountCents: null,
  });
});

describe('PaymentInstructions', () => {
  it('no muestra ni consulta pago cuando el pedido está cancelado', async () => {
    render(<PaymentInstructions order={order(pendingIntent, 'cancelled')} />);

    expect(screen.queryByText(/Paga con/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirmar pago' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Aún no pagué' })).not.toBeInTheDocument();
    await waitFor(() => expect(mocks.getIntent).not.toHaveBeenCalled());
    expect(mocks.getIntent).not.toHaveBeenCalled();
    expect(mocks.createIntent).not.toHaveBeenCalled();
  });

  it('reflects server authorization when the parent order refreshes', () => {
    const { rerender } = render(<PaymentInstructions order={order(pendingIntent)} />);
    expect(screen.getByText('Pendiente de verificación')).toBeInTheDocument();

    rerender(
      <PaymentInstructions
        order={order({
          ...pendingIntent,
          status: 'authorized',
          providerReference: 'wallet_observation:1',
        })}
      />,
    );

    expect(screen.getByText('Pago verificado')).toBeInTheDocument();
  });

  it('muestra el destinatario exacto junto al QR del negocio', () => {
    render(
      <PaymentInstructions
        order={order({
          ...pendingIntent,
          qrPayload: 'yape://public-business-qr',
          receiverLabel: 'Andá Paya Cevichería',
        })}
      />,
    );

    expect(screen.getByText('Destinatario:')).toBeInTheDocument();
    expect(screen.getByText('Andá Paya Cevichería')).toBeInTheDocument();
    expect(screen.getByText('QR del negocio')).toBeInTheDocument();
  });

  it('oculta el QR y las acciones de pago cuando el intento ya fue autorizado', () => {
    render(
      <PaymentInstructions
        order={order({
          ...pendingIntent,
          status: 'authorized',
          providerReference: 'wallet_observation:authorized',
          qrPayload: 'yape://public-business-qr',
          receiverLabel: 'Andá Paya Cevichería',
        })}
      />,
    );

    expect(screen.getByText('Pago verificado')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Pago verificado con Yape' })).toBeInTheDocument();
    expect(screen.queryByText('QR del negocio')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirmar pago' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Aún no pagué' })).not.toBeInTheDocument();
  });

  it('oculta el QR si el destinatario no fue validado', () => {
    render(
      <PaymentInstructions
        order={order({ ...pendingIntent, qrPayload: 'yape://unverified-qr' })}
      />,
    );

    expect(screen.queryByText('QR del negocio')).not.toBeInTheDocument();
    expect(
      screen.getByText(
        'No pudimos validar el destinatario de este QR. No pagues todavía; vuelve a intentarlo o contacta al restaurante.',
      ),
    ).toBeInTheDocument();
  });

  it('no invita a pagar si falta el QR aunque exista una etiqueta', () => {
    render(
      <PaymentInstructions
        order={order({ ...pendingIntent, receiverLabel: 'Andá Paya Cevichería' })}
      />,
    );

    expect(
      screen.getByText(
        'No pudimos mostrar un QR válido del negocio. No pagues todavía; contacta al restaurante para validar el destinatario.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Abre Yape/)).not.toBeInTheDocument();
  });

  it('limpia la constancia al cambiar el intento del mismo pedido', async () => {
    mocks.confirmWalletPaymentByCode.mockResolvedValueOnce({
      status: 'pending',
      attemptId: 'attempt-1',
      observationId: null,
      observedAt: null,
      payerDisplayName: 'Otra Persona',
      observedAmountCents: null,
    });
    const { rerender } = render(<PaymentInstructions order={order(pendingIntent)} />);

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Confirmar pago' })).toBeEnabled(),
    );
    fireEvent.change(screen.getByLabelText('Código de seguridad Yape'), {
      target: { value: '482' },
    });
    await act(async () => screen.getByRole('button', { name: 'Confirmar pago' }).click());
    fireEvent.change(screen.getByLabelText('Código Yape (3 dígitos)'), {
      target: { value: '384' },
    });
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

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Confirmar pago' })).toBeEnabled(),
    );
    fireEvent.change(screen.getByLabelText('Código de seguridad Yape'), {
      target: { value: '482' },
    });
    await act(async () => screen.getByRole('button', { name: 'Confirmar pago' }).click());
    await waitFor(() => expect(screen.getByLabelText('Código Yape (3 dígitos)')).toHaveValue(''));
    expect(screen.getByRole('button', { name: 'Vincular código' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Cambiar código' })).not.toBeInTheDocument();
    expect(screen.getByText('SUYA-EF56GH78')).toBeInTheDocument();
  });

  it('permite corregir el código de la constancia mientras sigue pendiente', async () => {
    mocks.confirmWalletPaymentByCode.mockResolvedValueOnce({
      status: 'pending',
      attemptId: 'attempt-1',
      observationId: null,
      observedAt: null,
      payerDisplayName: 'Otra Persona',
      observedAmountCents: null,
    });
    render(<PaymentInstructions order={order(pendingIntent)} />);

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Confirmar pago' })).toBeEnabled(),
    );
    fireEvent.change(screen.getByLabelText('Código de seguridad Yape'), {
      target: { value: '482' },
    });
    await act(async () => screen.getByRole('button', { name: 'Confirmar pago' }).click());
    const input = screen.getByLabelText('Código Yape (3 dígitos)');
    expect(input).toHaveAttribute('inputmode', 'numeric');
    fireEvent.change(input, { target: { value: '384' } });
    await act(async () => {
      screen.getByRole('button', { name: 'Vincular código' }).click();
    });

    expect(await screen.findByRole('button', { name: 'Cambiar código' })).toBeInTheDocument();
    await act(async () => {
      screen.getByRole('button', { name: 'Cambiar código' }).click();
    });
    expect(screen.getByLabelText('Código Yape (3 dígitos)')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Vincular código' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Código Yape (3 dígitos)'), {
      target: { value: '482' },
    });
    expect(screen.getByRole('button', { name: 'Vincular código' })).toBeEnabled();
  });

  it('permite confirmar el código Yape sin inventar una autorización', async () => {
    render(<PaymentInstructions order={order(pendingIntent)} />);

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Confirmar pago' })).toBeEnabled(),
    );
    fireEvent.change(screen.getByLabelText('Código de seguridad Yape'), {
      target: { value: '482' },
    });
    await act(async () => screen.getByRole('button', { name: 'Confirmar pago' }).click());

    expect(mocks.confirmWalletPaymentByCode).toHaveBeenCalledWith('order-1', '482');
    expect(screen.getByText('Validando pago…')).toBeInTheDocument();
    expect(mocks.notify).toHaveBeenCalledWith(
      'Pago registrado. Estamos validando identidad, monto y hora con la notificación.',
      'success',
    );
  });

  it('actualiza el pedido tras un Yape parcial y muestra cancelación y revisión del abono', async () => {
    const onPartialPaymentCancelled = vi.fn();
    mocks.confirmWalletPaymentByCode.mockResolvedValueOnce({
      status: 'amount_mismatch',
      attemptId: 'attempt-1',
      observationId: null,
      observedAt: null,
      payerDisplayName: null,
      observedAmountCents: 100,
    });
    const { rerender } = render(
      <PaymentInstructions
        order={order({ ...pendingIntent, amount: 10 })}
        onPartialPaymentCancelled={onPartialPaymentCancelled}
      />,
    );

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Confirmar pago' })).toBeEnabled(),
    );
    fireEvent.change(screen.getByLabelText('Código de seguridad Yape'), {
      target: { value: '482' },
    });
    await act(async () => screen.getByRole('button', { name: 'Confirmar pago' }).click());

    expect(mocks.confirmWalletPaymentByCode).toHaveBeenCalledWith('order-1', '482');
    expect(screen.getByText('Monto de Yape no coincide')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Yape detectado: S/ 1.00. Total del pedido: S/ 10.00. El monto no coincide y queda para revisión de Caja; el pago no se marcó como pagado. El teléfono de contacto de Andá Paya Cevichería se agregará cuando el comercio lo confirme. No realices otro pago hasta coordinarlo con el restaurante.',
      ),
    ).toBeInTheDocument();
    expect(onPartialPaymentCancelled).toHaveBeenCalledOnce();

    rerender(
      <PaymentInstructions
        order={order({ ...pendingIntent, amount: 10 }, 'cancelled', 'partial_wallet_payment')}
        onPartialPaymentCancelled={onPartialPaymentCancelled}
      />,
    );
    expect(screen.getByText('Pedido cancelado por pago parcial')).toBeInTheDocument();
    expect(
      screen.getByText(
        'El pedido se canceló automáticamente porque el Yape fue parcial. Yape detectado: S/ 1.00. Total del pedido: S/ 10.00. El pago no se marcó como pagado y el abono queda para revisión de Caja y gestión de devolución. El teléfono de contacto de Andá Paya Cevichería se agregará cuando el comercio lo confirme. No realices otro pago para este pedido.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Código Yape (3 dígitos)')).not.toBeInTheDocument();
    expect(screen.queryByText(/liberado para preparación/)).not.toBeInTheDocument();
    expect(mocks.notify).toHaveBeenCalledWith(
      expect.stringContaining('no coincide'),
      'warning',
    );
  });

  it('conserva el mensaje de devolución al cargar un pedido ya cancelado por pago parcial', () => {
    render(
      <PaymentInstructions
        order={order({ ...pendingIntent, amount: 10 }, 'cancelled', 'partial_wallet_payment')}
      />,
    );

    expect(screen.getByText('Pedido cancelado por pago parcial')).toBeInTheDocument();
    expect(screen.getByText(/teléfono de contacto de Andá Paya Cevichería se agregará/)).toBeInTheDocument();
    expect(mocks.getIntent).not.toHaveBeenCalled();
  });

  it('al vincular el código Yape compara código y monto con Observer', async () => {
    mocks.confirmWalletPaymentByCode
      .mockResolvedValueOnce({
        status: 'pending',
        attemptId: 'attempt-1',
        observationId: null,
        observedAt: null,
        payerDisplayName: null,
        observedAmountCents: null,
      })
      .mockResolvedValueOnce({
        status: 'code_mismatch',
        attemptId: 'attempt-1',
        observationId: null,
        observedAt: null,
        payerDisplayName: null,
        observedAmountCents: null,
      })
      .mockResolvedValueOnce({
        status: 'amount_mismatch',
        attemptId: 'attempt-1',
        observationId: null,
        observedAt: null,
        payerDisplayName: null,
        observedAmountCents: 100,
      });
    render(<PaymentInstructions order={order({ ...pendingIntent, amount: 10 })} />);

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Confirmar pago' })).toBeEnabled(),
    );
    fireEvent.change(screen.getByLabelText('Código de seguridad Yape'), {
      target: { value: '813' },
    });
    await act(async () => screen.getByRole('button', { name: 'Confirmar pago' }).click());

    const linkCode = screen.getByLabelText('Código Yape (3 dígitos)');
    fireEvent.change(linkCode, { target: { value: '111' } });
    await act(async () => screen.getByRole('button', { name: 'Vincular código' }).click());
    expect(await screen.findByText('Código Yape no coincide')).toBeInTheDocument();
    expect(screen.getByLabelText('Código Yape (3 dígitos)')).toHaveValue('111');

    fireEvent.change(screen.getByLabelText('Código Yape (3 dígitos)'), {
      target: { value: '813' },
    });
    await act(async () => screen.getByRole('button', { name: 'Vincular código' }).click());

    expect(mocks.confirmWalletPaymentByCode).toHaveBeenCalledTimes(3);
    expect(mocks.confirmWalletPaymentByCode).toHaveBeenNthCalledWith(1, 'order-1', '813');
    expect(mocks.confirmWalletPaymentByCode).toHaveBeenNthCalledWith(2, 'order-1', '111');
    expect(mocks.confirmWalletPaymentByCode).toHaveBeenNthCalledWith(3, 'order-1', '813');
    expect(mocks.declarePayment).not.toHaveBeenCalled();
    expect(await screen.findByText('Monto de Yape no coincide')).toBeInTheDocument();
    expect(screen.getByText(/Yape detectado: S\/ 1\.00.*S\/ 10\.00/)).toBeInTheDocument();
  });

  it('preserva la revisión y no ofrece un segundo cobro si el intento vencido ya fue declarado', async () => {
    const expiredIntent = { ...pendingIntent, expiresAt: '2020-01-01T00:00:00.000Z' };
    mocks.getPaymentDeclaration.mockResolvedValueOnce(null);
    mocks.confirmWalletPaymentByCode.mockResolvedValueOnce({
      status: 'pending',
      attemptId: 'attempt-1',
      observationId: null,
      observedAt: null,
      payerDisplayName: 'Otra Persona',
      observedAmountCents: null,
    });
    render(<PaymentInstructions order={order(expiredIntent)} />);

    const paid = await screen.findByRole('button', { name: 'Confirmar pago' });
    await waitFor(() => expect(paid).toBeEnabled());
    fireEvent.change(screen.getByLabelText('Código de seguridad Yape'), {
      target: { value: '482' },
    });
    await act(async () => paid.click());

    expect(mocks.confirmWalletPaymentByCode).toHaveBeenCalledWith('order-1', '482');
    expect(screen.getByText('Validando pago…')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Aún no pagué' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Generar nueva referencia' }),
    ).not.toBeInTheDocument();
  });

  it('solo renueva una referencia vencida cuando el cliente declara que aún no pagó', async () => {
    const expiredIntent = { ...pendingIntent, expiresAt: '2020-01-01T00:00:00.000Z' };
    const renewedIntent = {
      ...pendingIntent,
      attemptId: 'attempt-2',
      checkoutReference: 'SUYA-NEWREF1',
    };
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
    expect(screen.queryByRole('button', { name: 'Confirmar pago' })).not.toBeInTheDocument();
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
      () =>
        new Promise((resolve) => {
          resolveCharge = resolve;
        }),
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
    await waitFor(() => expect(screen.getByText('Pago verificado')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Pagar con tarjeta' })).not.toBeInTheDocument();
    expect(screen.queryByText('Pago electrónico seguro')).not.toBeInTheDocument();
    expect(mocks.chargeCard).toHaveBeenCalledTimes(1);
  });

  it('ignora callbacks de Culqi del pedido anterior al cambiar de pedido', async () => {
    const firstIntent: PaymentIntent = {
      ...pendingIntent,
      provider: 'culqi',
      providerReference: 'ord_test_stale_order',
    };
    const secondIntent: PaymentIntent = {
      ...pendingIntent,
      orderId: 'order-2',
      attemptId: 'attempt-2',
      provider: 'culqi',
      providerReference: 'ord_test_current_order',
    };
    let onToken!: (tokenId: string) => Promise<void>;
    mocks.openCulqiCheckout.mockImplementationOnce(
      async (options: { onToken: (tokenId: string) => Promise<void> }) => {
        onToken = options.onToken;
      },
    );
    sessionStorage.setItem('suya.payment-email:order-1', 'cliente@example.com');
    sessionStorage.setItem('suya.payment-email:order-2', 'cliente@example.com');
    const { rerender } = render(<PaymentInstructions order={order(firstIntent)} />);

    await act(async () => {
      screen.getByRole('button', { name: 'Abrir QR Yape' }).click();
    });
    expect(onToken).toBeTypeOf('function');

    rerender(<PaymentInstructions order={order(secondIntent)} />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Abrir QR Yape' })).toBeInTheDocument(),
    );

    await act(async () => {
      await onToken('tkn_test_stale_order');
    });

    expect(mocks.chargeCard).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Abrir QR Yape' })).toBeEnabled();
  });
});
