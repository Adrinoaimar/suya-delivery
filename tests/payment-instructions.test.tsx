import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PaymentInstructions } from '@/components/payment/PaymentInstructions';
import type { Order, PaymentIntent } from '@/types';

const mocks = vi.hoisted(() => ({
  getIntent: vi.fn(),
  retryRoutedPayment: vi.fn(),
  verifyRoutedYapeCode: vi.fn(),
  createIntent: vi.fn(),
  chargeCard: vi.fn(),
  submitEvidence: vi.fn(),
  declarePayment: vi.fn(),
  confirmWalletPayment: vi.fn(),
  confirmWalletPaymentByCode: vi.fn(),
  getPaymentDeclaration: vi.fn(),
  getExpiredWalletClaim: vi.fn(),
  reportExpiredWalletClaim: vi.fn(),
  notify: vi.fn(),
  openCulqiCheckout: vi.fn(),
}));

vi.mock('@/lib/services', () => ({
  paymentService: {
    getIntent: mocks.getIntent,
    retryRoutedPayment: mocks.retryRoutedPayment,
    verifyRoutedYapeCode: mocks.verifyRoutedYapeCode,
    createIntent: mocks.createIntent,
    chargeCard: mocks.chargeCard,
    submitEvidence: mocks.submitEvidence,
    declarePayment: mocks.declarePayment,
    confirmWalletPayment: mocks.confirmWalletPayment,
    confirmWalletPaymentByCode: mocks.confirmWalletPaymentByCode,
    getPaymentDeclaration: mocks.getPaymentDeclaration,
    getExpiredWalletClaim: mocks.getExpiredWalletClaim,
    reportExpiredWalletClaim: mocks.reportExpiredWalletClaim,
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
  mocks.getExpiredWalletClaim.mockResolvedValue(null);
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
  it('registra el reclamo de un Yape ruteado vencido sin declarar ni confirmar el pago', async () => {
    mocks.reportExpiredWalletClaim.mockResolvedValueOnce('2026-11-18T20:00:00Z');
    render(<PaymentInstructions order={order({ ...pendingIntent, observerRouted: true,
      qrPayload: '000201-fixture-yape', expiresAt: '2020-01-01T00:00:00Z' }, 'pending_payment')} />);

    fireEvent.change(await screen.findByLabelText('Nombre de quien pagó'), { target: { value: 'Clara Ejemplo' } });
    fireEvent.change(screen.getByLabelText('Referencia del comprobante (opcional)'), { target: { value: '047' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar reclamo a Caja' }));
    expect(await screen.findByText('Reclamo enviado a Caja.')).toBeVisible();
    expect(mocks.reportExpiredWalletClaim).toHaveBeenCalledWith('order-1', 'attempt-1', 'Clara Ejemplo', '047');
    expect(mocks.verifyRoutedYapeCode).not.toHaveBeenCalled();
    expect(mocks.declarePayment).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Guardar QR' })).not.toBeInTheDocument();
  });

  it('recupera el reclamo previo de un QR estático vencido', async () => {
    mocks.getExpiredWalletClaim.mockResolvedValueOnce('2026-11-18T20:00:00Z');
    render(<PaymentInstructions order={order({ ...pendingIntent, provider: 'static_qr',
      qrPayload: '000201-fixture-yape', expiresAt: '2020-01-01T00:00:00Z' }, 'pending_payment')} />);

    expect(await screen.findByText('Reclamo enviado a Caja.')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Enviar reclamo a Caja' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Confirmación AutoCloud en curso/)).not.toBeInTheDocument();
  });

  it('corrige un código rechazado y solo celebra al recibir autorización de Caja', async () => {
    const accepted = vi.fn();
    const intent = { ...pendingIntent, observerRouted: true, receiverLabel: 'Jean Prueba',
      qrPayload: '000201-fixture-yape' };
    mocks.verifyRoutedYapeCode.mockResolvedValueOnce('code_mismatch');
    let authorize!: (result: string) => void;
    mocks.verifyRoutedYapeCode.mockImplementationOnce(() => new Promise<string>((resolve) => { authorize = resolve; }));
    render(<PaymentInstructions order={order(intent, 'pending_payment')} onPaymentAccepted={accepted} />);
    expect(await screen.findByText('Jean Prueba')).toBeInTheDocument();
    expect(accepted).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'Verifica tu pago en Yape' })).toBeVisible();
    expect(screen.queryByText('Ya pagué · informar a Caja')).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Nombre.*quien pagó/)).not.toBeInTheDocument();
    const verify = screen.getByRole('button', { name: 'Verificar pago' });
    expect(verify).toBeDisabled();
    const code = screen.getByLabelText('Código de seguridad de Yape (obligatorio)');
    expect(code).toBeVisible();
    expect(code).toBeRequired();
    fireEvent.change(code, { target: { value: '12' } });
    expect(verify).toBeDisabled();
    fireEvent.change(code, { target: { value: '123' } });
    await waitFor(() => expect(verify).toBeEnabled());
    fireEvent.click(verify);
    expect(await screen.findByText('Código incorrecto')).toBeVisible();
    expect(accepted).not.toHaveBeenCalled();
    fireEvent.change(code, { target: { value: '047' } });
    expect(screen.queryByText('Código incorrecto')).not.toBeInTheDocument();
    fireEvent.click(verify);
    expect(screen.getByText('Verificando pago')).toBeVisible();
    expect(code).toBeDisabled();
    await act(async () => authorize('authorized'));
    expect(await screen.findByText('Código correcto')).toBeVisible();
    await waitFor(() => expect(accepted).toHaveBeenCalled());
    expect(mocks.verifyRoutedYapeCode.mock.calls).toEqual([
      ['order-1', '123', null], ['order-1', '047', null],
    ]);
    expect(mocks.declarePayment).not.toHaveBeenCalled();
    expect(mocks.retryRoutedPayment).not.toHaveBeenCalled();
    expect(mocks.createIntent).not.toHaveBeenCalled();
  });

  it('pide el nombre solo si Caja encuentra varios abonos con el mismo código', async () => {
    mocks.verifyRoutedYapeCode.mockResolvedValueOnce('name_required').mockResolvedValueOnce('authorized');
    render(<PaymentInstructions order={order({ ...pendingIntent, observerRouted: true, qrPayload: '000201-fixture-yape' }, 'pending_payment')} />);
    const code = await screen.findByLabelText('Código de seguridad de Yape (obligatorio)');
    expect(screen.queryByLabelText('Nombre y apellido de quien pagó')).not.toBeInTheDocument();
    fireEvent.change(code, { target: { value: '047' } });
    const verify = screen.getByRole('button', { name: 'Verificar pago' });
    await waitFor(() => expect(verify).toBeEnabled());
    fireEvent.click(verify);
    const payer = await screen.findByLabelText('Nombre y apellido de quien pagó');
    expect(screen.getByText('Necesitamos el nombre de quien pagó')).toBeVisible();
    expect(code).toHaveValue('047');
    fireEvent.change(payer, { target: { value: 'Cliente Uno' } });
    fireEvent.click(verify);
    expect(await screen.findByText('Código correcto')).toBeVisible();
    expect(mocks.verifyRoutedYapeCode.mock.calls).toEqual([
      ['order-1', '047', null], ['order-1', '047', 'Cliente Uno'],
    ]);
  });

  it('abre el checkout oficial sin asumir pago ni pedir evidencia manual', async () => {
    const accepted = vi.fn();
    const intent = { ...pendingIntent, method: 'card' as const, provider: 'mercadopago',
      checkoutUrl: 'https://www.mercadopago.com.pe/checkout/v1/redirect?pref_id=official' };
    render(<PaymentInstructions order={order(intent, 'pending_payment')} onPaymentAccepted={accepted} />);
    const link = await screen.findByRole('link', { name: 'Abrir pago seguro' });
    expect(link).toHaveAttribute('href', intent.checkoutUrl);
    fireEvent.click(link);
    expect(accepted).not.toHaveBeenCalled();
    expect(mocks.chargeCard).not.toHaveBeenCalled();
    expect(mocks.getPaymentDeclaration).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('Código de seguridad de Yape')).not.toBeInTheDocument();
  });

  it.each(['https://mercadopago.com.pe.attacker.invalid/checkout', 'javascript:alert(1)',
    'https://attacker@www.mercadopago.com.pe/checkout'])('bloquea un enlace no confiable: %s', async (checkoutUrl) => {
    render(<PaymentInstructions order={order({ ...pendingIntent, provider: 'mercadopago', checkoutUrl }, 'pending_payment')} />);
    await screen.findByRole('button', { name: 'Preparar enlace de pago' });
    expect(screen.queryByRole('link', { name: 'Abrir pago seguro' })).not.toBeInTheDocument();
  });

  it('retiene el abono tardío y no invita a pagar otra vez', async () => {
    render(<PaymentInstructions order={order({ ...pendingIntent, provider: 'mercadopago', gatewayState: 'late_review',
      checkoutUrl: 'https://www.mercadopago.com.pe/checkout/v1/redirect?pref_id=official' }, 'pending_payment')} />);
    await screen.findByText(/El abono requiere conciliación/);
    expect(screen.queryByRole('link', { name: 'Abrir pago seguro' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Preparar enlace de pago' })).not.toBeInTheDocument();
  });

  it('identifica una prueba y nunca la muestra como pago confirmado', async () => {
    render(<PaymentInstructions order={order({ ...pendingIntent, provider: 'mercadopago', environment: 'test',
      gatewayState: 'test_confirmed' }, 'pending_payment')} />);
    await screen.findByText(/Entorno de prueba/);
    expect(screen.queryByText('Pago confirmado')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Abrir pago seguro' })).not.toBeInTheDocument();
  });

  it('recupera un enlace interrumpido conservando el mismo pedido', async () => {
    const intent = { ...pendingIntent, provider: 'mercadopago', checkoutUrl: null };
    mocks.createIntent.mockResolvedValue({ ...intent, checkoutUrl: 'https://www.mercadopago.com.pe/checkout/v1/redirect?pref_id=recovered' });
    render(<PaymentInstructions order={order(intent, 'pending_payment')} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Preparar enlace de pago' }));
    await screen.findByRole('link', { name: 'Abrir pago seguro' });
    expect(mocks.createIntent).toHaveBeenCalledWith('order-1', 'yape');
    expect(mocks.getIntent).not.toHaveBeenCalled();
  });
  it('no muestra ni consulta pago cuando el pedido está cancelado', async () => {
    render(<PaymentInstructions order={order(pendingIntent, 'cancelled')} />);

    expect(screen.queryByText(/Paga con/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Vincular código' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Generar QR nuevo' })).not.toBeInTheDocument();
    await waitFor(() => expect(mocks.getIntent).not.toHaveBeenCalled());
    expect(mocks.getIntent).not.toHaveBeenCalled();
    expect(mocks.createIntent).not.toHaveBeenCalled();
  });

  it('reflects server authorization when the parent order refreshes', () => {
    const { rerender } = render(<PaymentInstructions order={order(pendingIntent)} />);
    expect(screen.getByText(/introduce el monto exacto del pedido/)).toBeInTheDocument();

    rerender(
      <PaymentInstructions
        order={order({
          ...pendingIntent,
          status: 'authorized',
          providerReference: 'wallet_observation:1',
        })}
      />,
    );

    expect(screen.getByText('Pago confirmado')).toBeInTheDocument();
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
    expect(screen.getByText('Escanea el QR del negocio')).toBeInTheDocument();
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

    expect(screen.getByText('Pago confirmado')).toBeInTheDocument();
    expect(screen.queryByText('Escanea el QR del negocio')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Vincular código' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Generar QR nuevo' })).not.toBeInTheDocument();
  });

  it('oculta el QR si el destinatario no fue validado', () => {
    render(
      <PaymentInstructions
        order={order({ ...pendingIntent, qrPayload: 'yape://unverified-qr' })}
      />,
    );

    expect(screen.queryByText('Escanea el QR del negocio')).not.toBeInTheDocument();
    expect(
      screen.getByText('No pudimos mostrar el QR. Contacta al restaurante antes de pagar.'),
    ).toBeInTheDocument();
  });

  it('no invita a pagar si falta el QR aunque exista una etiqueta', () => {
    render(
      <PaymentInstructions
        order={order({ ...pendingIntent, receiverLabel: 'Andá Paya Cevichería' })}
      />,
    );

    expect(
      screen.getByText('No pudimos mostrar el QR. Contacta al restaurante antes de pagar.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Abrir Yape' })).not.toBeInTheDocument();
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
      expect(screen.getByRole('button', { name: 'Vincular código' })).toBeEnabled(),
    );
    const codeInput = screen.getByLabelText('Código de seguridad de Yape');
    fireEvent.change(codeInput, { target: { value: '482' } });
    await act(async () => {
      screen.getByRole('button', { name: 'Vincular código' }).click();
    });
    expect(mocks.confirmWalletPaymentByCode).toHaveBeenCalledWith('order-1', '482');

    rerender(
      <PaymentInstructions
        order={order({
          ...pendingIntent,
          attemptId: 'attempt-2',
          checkoutReference: 'SUYA-EF56GH78',
        })}
      />,
    );

    await waitFor(() => expect(screen.getByLabelText('Código de seguridad de Yape')).toHaveValue(''));
    expect(mocks.confirmWalletPaymentByCode).toHaveBeenCalledTimes(1);
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
      expect(screen.getByRole('button', { name: 'Vincular código' })).toBeEnabled(),
    );
    const input = screen.getByLabelText('Código de seguridad de Yape');
    expect(input).toHaveAttribute('inputmode', 'numeric');
    fireEvent.change(input, { target: { value: '384' } });
    await act(async () => {
      screen.getByRole('button', { name: 'Vincular código' }).click();
    });
    expect(await screen.findByText('Aún no encontramos el abono')).toBeInTheDocument();
    expect(input).toHaveValue('384');
    fireEvent.change(input, { target: { value: '482' } });
    expect(input).toHaveValue('482');
    expect(screen.getByRole('button', { name: 'Vincular código' })).toBeEnabled();
  });

  it('permite confirmar el código Yape sin inventar una autorización', async () => {
    render(<PaymentInstructions order={order(pendingIntent)} />);

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Vincular código' })).toBeEnabled(),
    );
    fireEvent.change(screen.getByLabelText('Código de seguridad de Yape'), {
      target: { value: '482' },
    });
    await act(async () => screen.getByRole('button', { name: 'Vincular código' }).click());

    expect(mocks.confirmWalletPaymentByCode).toHaveBeenCalledWith('order-1', '482');
    expect(screen.getByText('Aún no encontramos el abono')).toBeInTheDocument();
  });

  it('actualiza el pedido tras un Yape parcial y muestra cancelación y revisión del abono', async () => {
    const onPartialPaymentCancelled = vi.fn();
    mocks.confirmWalletPaymentByCode.mockResolvedValueOnce({
      status: 'amount_mismatch',
      attemptId: 'attempt-1',
      observationId: 'observation-1',
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
      expect(screen.getByRole('button', { name: 'Vincular código' })).toBeEnabled(),
    );
    fireEvent.change(screen.getByLabelText('Código de seguridad de Yape'), {
      target: { value: '482' },
    });
    await act(async () => screen.getByRole('button', { name: 'Vincular código' }).click());

    expect(mocks.confirmWalletPaymentByCode).toHaveBeenCalledWith('order-1', '482');
    expect(screen.getByText('Pedido cancelado por pago parcial')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Recibido: S/ 1.00. Total: S/ 10.00. Contacta a Andá Paya Cevichería para revisar el abono y coordinar la devolución; el número de contacto se añadirá cuando el restaurante lo confirme.',
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
        'Recibido: S/ 1.00. Total: S/ 10.00. Contacta a Andá Paya Cevichería para revisar el abono y coordinar la devolución; el número de contacto se añadirá cuando el restaurante lo confirme.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Código de seguridad de Yape')).not.toBeInTheDocument();
    expect(screen.queryByText(/liberado para preparación/)).not.toBeInTheDocument();
    expect(mocks.notify).toHaveBeenCalledWith(
      expect.stringContaining('Pedido cancelado automáticamente por pago parcial'),
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
    expect(screen.getByText(/el número de contacto se añadirá cuando el restaurante lo confirme/)).toBeInTheDocument();
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
      expect(screen.getByRole('button', { name: 'Vincular código' })).toBeEnabled(),
    );
    fireEvent.change(screen.getByLabelText('Código de seguridad de Yape'), {
      target: { value: '813' },
    });
    await act(async () => screen.getByRole('button', { name: 'Vincular código' }).click());

    const linkCode = screen.getByLabelText('Código de seguridad de Yape');
    fireEvent.change(linkCode, { target: { value: '111' } });
    await act(async () => screen.getByRole('button', { name: 'Vincular código' }).click());
    expect(await screen.findByText('Código incorrecto')).toBeInTheDocument();
    expect(screen.getByLabelText('Código de seguridad de Yape')).toHaveValue('111');

    fireEvent.change(screen.getByLabelText('Código de seguridad de Yape'), {
      target: { value: '813' },
    });
    await act(async () => screen.getByRole('button', { name: 'Vincular código' }).click());

    expect(mocks.confirmWalletPaymentByCode).toHaveBeenCalledTimes(3);
    expect(mocks.confirmWalletPaymentByCode).toHaveBeenNthCalledWith(1, 'order-1', '813');
    expect(mocks.confirmWalletPaymentByCode).toHaveBeenNthCalledWith(2, 'order-1', '111');
    expect(mocks.confirmWalletPaymentByCode).toHaveBeenNthCalledWith(3, 'order-1', '813');
    expect(mocks.declarePayment).not.toHaveBeenCalled();
    expect(await screen.findByText('El monto no coincide; Caja revisará el abono.')).toBeInTheDocument();
    expect(mocks.notify).toHaveBeenCalledWith(
      expect.stringContaining('Yape recibido: S/ 1.00. El monto solicitado es S/ 10.00'),
      'warning',
    );
  });

  it('preserva la revisión y no ofrece un segundo cobro si el intento vencido ya fue declarado', async () => {
    const expiredIntent = { ...pendingIntent, expiresAt: '2020-01-01T00:00:00.000Z' };
    mocks.getPaymentDeclaration.mockResolvedValueOnce({
      declaredAt: '2026-09-24T18:00:00.000Z',
      payerDisplayName: 'Otra Persona',
    });
    render(<PaymentInstructions order={order(expiredIntent)} />);

    expect(
      await screen.findByText('Tu pago sigue en revisión. No vuelvas a pagar; Caja revisará el abono.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Generar QR nuevo' })).not.toBeInTheDocument();
    expect(mocks.confirmWalletPaymentByCode).not.toHaveBeenCalled();
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

    const notPaid = await screen.findByRole('button', { name: 'Generar QR nuevo' });
    await waitFor(() => expect(notPaid).toBeEnabled());
    await act(async () => notPaid.click());

    expect(mocks.createIntent).toHaveBeenCalledWith('order-1', 'yape');
    expect(screen.getByText(/introduce el monto exacto del pedido/)).toBeInTheDocument();
  });

  it('no invita a repetir un pago devuelto ni muestra su QR', () => {
    const refundedIntent = {
      ...pendingIntent,
      status: 'refunded' as const,
      qrPayload: 'https://example.test/qr.svg',
    };
    render(<PaymentInstructions order={order(refundedIntent)} />);

    expect(
      screen.getByText('Pago devuelto'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Vincular código' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Generar QR nuevo' })).not.toBeInTheDocument();
    expect(screen.queryByText('Escanea el QR del negocio')).not.toBeInTheDocument();
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

    const button = screen.getByRole('button', { name: 'Abrir Yape' });
    await act(async () => {
      button.click();
    });

    expect(screen.getByRole('button', { name: 'Esperando confirmación…' })).toBeDisabled();
    expect(mocks.notify).toHaveBeenCalledWith(
      'Pago enviado. Esperamos la confirmación.',
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

    const button = screen.getByRole('button', { name: 'Abrir Yape' });
    await act(async () => {
      button.click();
    });

    expect(screen.getByRole('button', { name: 'Abrir Yape' })).not.toBeDisabled();
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
    expect(screen.getByRole('button', { name: 'Pagar con tarjeta' })).toBeEnabled();
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

    expect(screen.getByRole('button', { name: 'Pagar con tarjeta' })).toBeEnabled();
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

    expect(screen.getByRole('button', { name: 'Abriendo pago…' })).toBeDisabled();

    await act(async () => {
      rejectCharge(new Error('Culqi rechazó el pago'));
    });

    expect(screen.getByRole('button', { name: 'Pagar con tarjeta' })).toBeEnabled();
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
    await waitFor(() => expect(screen.getByText('Pago confirmado')).toBeInTheDocument());
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
      screen.getByRole('button', { name: 'Abrir Yape' }).click();
    });
    expect(onToken).toBeTypeOf('function');

    rerender(<PaymentInstructions order={order(secondIntent)} />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Abrir Yape' })).toBeInTheDocument(),
    );

    await act(async () => {
      await onToken('tkn_test_stale_order');
    });

    expect(mocks.chargeCard).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Abrir Yape' })).toBeEnabled();
  });
});
