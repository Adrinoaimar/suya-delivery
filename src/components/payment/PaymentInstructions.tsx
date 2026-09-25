import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, ExternalLink, LoaderCircle, QrCode } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { notificationService, paymentService } from '@/lib/services';
import type { WalletPaymentConfirmation, WalletPaymentConfirmationStatus } from '@/lib/services';
import { openCulqiCheckout } from '@/lib/payments/culqiCheckout';
import type { Order, PaymentIntent } from '@/types';
import { formatPrice, paymentLabel } from '@/utils/format';

interface PaymentInstructionsProps {
  order: Pick<
    Order,
    | 'id'
    | 'storeName'
    | 'total'
    | 'paymentMethod'
    | 'paymentIntent'
    | 'status'
    | 'cancellationReason'
  >;
  onPartialPaymentCancelled?: () => void;
  onPaymentAccepted?: () => void;
}

function isExpired(intent: PaymentIntent): boolean {
  const timestamp = Date.parse(intent.expiresAt);
  return Number.isFinite(timestamp) && timestamp <= Date.now();
}

function savedPaymentEmail(orderId: string): string | null {
  try {
    const email = sessionStorage.getItem(`suya.payment-email:${orderId}`)?.trim().toLowerCase();
    return email || null;
  } catch {
    return null;
  }
}

function amountMismatchMessage(amountCents: number | null, orderAmount: number): string {
  const received = amountCents == null ? 'El abono recibido' : `Yape recibido: ${formatPrice(amountCents / 100)}`;
  return `${received}. El monto solicitado es ${formatPrice(orderAmount)}. El abono queda para revisión de Caja; no pagues otra vez hasta coordinarlo con el restaurante.`;
}

function partialPaymentCancelledMessage(
  amountCents: number | null,
  orderAmount: number,
  storeName: string,
): string {
  const received = amountCents == null ? 'El abono no cubrió el total.' : `Recibido: ${formatPrice(amountCents / 100)}.`;
  return `${received} Total: ${formatPrice(orderAmount)}. Contacta a ${storeName} para revisar el abono y coordinar la devolución; el número de contacto se añadirá cuando el restaurante lo confirme.`;
}

export function PaymentInstructions({
  order,
  onPartialPaymentCancelled,
  onPaymentAccepted,
}: PaymentInstructionsProps) {
  const cancelled = order.status === 'cancelled';
  const [partialPaymentCancelled, setPartialPaymentCancelled] = useState(false);
  const paymentCancelled = cancelled || partialPaymentCancelled;
  const [intent, setIntent] = useState<PaymentIntent | null>(order.paymentIntent ?? null);
  const [loading, setLoading] = useState(!cancelled && !order.paymentIntent);
  const [error, setError] = useState<string | null>(null);
  const [confirmationCode, setConfirmationCode] = useState('');
  const [payerDisplayName, setPayerDisplayName] = useState('');
  const [paymentDeclared, setPaymentDeclared] = useState(false);
  const [declarationKnown, setDeclarationKnown] = useState(false);
  const [declarationBusy, setDeclarationBusy] = useState(false);
  const [walletConfirmationStatus, setWalletConfirmationStatus] =
    useState<WalletPaymentConfirmationStatus | null>(null);
  const [walletObservedAmountCents, setWalletObservedAmountCents] = useState<number | null>(null);
  const [gatewayBusy, setGatewayBusy] = useState(false);
  const [gatewayAwaitingWebhook, setGatewayAwaitingWebhook] = useState(false);
  const [manualBusy, setManualBusy] = useState(false);
  const gatewayTokenBusyRef = useRef(false);
  const gatewaySessionKeyRef = useRef('');
  const gatewaySessionKey = `${order.id}:${order.paymentIntent?.attemptId ?? ''}`;

  useEffect(() => {
    setIntent(null);
    setLoading(true);
    setError(null);
    setConfirmationCode('');
    setPayerDisplayName('');
    setPaymentDeclared(false);
    setDeclarationKnown(false);
    setDeclarationBusy(false);
    setWalletConfirmationStatus(null);
    setWalletObservedAmountCents(null);
    setPartialPaymentCancelled(false);
    setGatewayBusy(false);
    setGatewayAwaitingWebhook(false);
    setManualBusy(false);
    gatewayTokenBusyRef.current = false;
    gatewaySessionKeyRef.current = gatewaySessionKey;
  }, [gatewaySessionKey]);

  useEffect(() => {
    if (paymentCancelled || order.paymentMethod === 'cash' || order.paymentIntent) return;
    let active = true;
    setLoading(true);
    void paymentService
      .getIntent(order.id)
      .then((value) => {
        if (active) {
          setIntent(value);
          setError(value ? null : 'No pudimos preparar el pago. Vuelve a intentarlo.');
        }
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : 'No pudimos cargar el pago.');
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [paymentCancelled, order.id, order.paymentIntent, order.paymentMethod]);

  useEffect(() => {
    if (paymentCancelled || !order.paymentIntent) return;
    setIntent(order.paymentIntent);
    setError(null);
    setLoading(false);
  }, [paymentCancelled, order.paymentIntent]);

  useEffect(() => {
    const manualWallet = order.paymentMethod === 'yape' || order.paymentMethod === 'lemon';
    if (
      paymentCancelled ||
      !order.paymentIntent ||
      !manualWallet ||
      order.paymentIntent.provider === 'culqi' ||
      order.paymentIntent.status === 'refunded'
    ) {
      setPaymentDeclared(false);
      setDeclarationKnown(true);
      return;
    }

    let active = true;
    setDeclarationKnown(false);
    void paymentService
      .getPaymentDeclaration(order.id)
      .then((declaration) => {
        if (!active) return;
        setPaymentDeclared(Boolean(declaration));
        setPayerDisplayName(
          order.paymentMethod === 'yape' ? '' : (declaration?.payerDisplayName ?? ''),
        );
        setDeclarationKnown(true);
      })
      .catch(() => active && setDeclarationKnown(false));
    return () => {
      active = false;
    };
  }, [
    paymentCancelled,
    order.id,
    order.paymentIntent,
    order.paymentIntent?.attemptId,
    order.paymentIntent?.provider,
    order.paymentMethod,
  ]);

  useEffect(() => {
    if (paymentCancelled || intent?.status !== 'pending') return;
    let active = true;
    const refreshSafely = () => {
      void Promise.resolve()
        .then(() => paymentService.getIntent(order.id))
        .then((value) => active && value && setIntent(value))
        .catch(() => undefined);
    };
    const timer = window.setInterval(refreshSafely, 5_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [paymentCancelled, intent?.status, order.id]);

  useEffect(() => {
    if (intent?.status === 'authorized') onPaymentAccepted?.();
  }, [intent?.attemptId, intent?.status, onPaymentAccepted]);

  useEffect(() => {
    if (!intent || intent.status !== 'pending' || !isExpired(intent)) return;
    setGatewayAwaitingWebhook(false);
  }, [intent]);

  const handleWalletConfirmationResult = useCallback(
    (result: WalletPaymentConfirmation, notifyStatus = true) => {
      setWalletConfirmationStatus(result.status);
      setWalletObservedAmountCents(result.observedAmountCents);
      setPaymentDeclared(true);
      setDeclarationKnown(true);
      if (result.status === 'authorized') {
        setIntent((current) =>
          current
            ? {
                ...current,
                status: 'authorized',
                providerReference: result.observationId
                  ? `wallet_observation:${result.observationId}`
                  : current.providerReference,
              }
            : current,
        );
        notificationService.notify('Pago confirmado. El pedido ya puede prepararse.', 'success');
      } else if (result.status === 'amount_mismatch') {
        const expectedAmount = intent?.amount ?? order.total;
        const partialPayment =
          result.observationId !== null &&
          result.observedAmountCents !== null &&
          result.observedAmountCents < Math.round(expectedAmount * 100);
        if (partialPayment) {
          setPartialPaymentCancelled(true);
          notificationService.notify(
            `Pedido cancelado automáticamente por pago parcial. ${partialPaymentCancelledMessage(result.observedAmountCents, expectedAmount, order.storeName)}`,
            'warning',
          );
        } else {
          notificationService.notify(
            amountMismatchMessage(result.observedAmountCents, expectedAmount),
            'warning',
          );
        }
        onPartialPaymentCancelled?.();
      } else if (result.status === 'ambiguous' && notifyStatus) {
        notificationService.notify('Caja debe revisar el pago antes de confirmar el pedido.', 'warning');
      } else if (result.status === 'code_mismatch' && notifyStatus) {
        notificationService.notify('El código no coincide. Revísalo e inténtalo otra vez.', 'warning');
      } else if (result.status === 'pending' && notifyStatus) {
        notificationService.notify('Código vinculado. Esperamos la confirmación del pago.', 'success');
      }
    },
    [intent?.amount, onPartialPaymentCancelled, order.storeName, order.total],
  );

  useEffect(() => {
    const isYape = intent?.method === 'yape';
    const confirmationValue = isYape ? confirmationCode.trim() : payerDisplayName.trim();
    if (
      (walletConfirmationStatus !== 'pending' && walletConfirmationStatus !== 'code_mismatch') ||
      intent?.status !== 'pending' ||
      !confirmationValue
    ) {
      return;
    }
    let active = true;
    const check = () => {
      const request = isYape
        ? paymentService.confirmWalletPaymentByCode(order.id, confirmationValue)
        : paymentService.confirmWalletPayment(order.id, confirmationValue);
      void request
        .then((result) => {
          if (active && result.status !== 'pending') handleWalletConfirmationResult(result, false);
        })
        .catch(() => undefined);
    };
    const timer = window.setInterval(check, 5_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [
    confirmationCode,
    handleWalletConfirmationResult,
    intent?.method,
    intent?.status,
    order.id,
    payerDisplayName,
    walletConfirmationStatus,
  ]);

  const confirmWalletPayment = async () => {
    if (declarationBusy || !declarationKnown) return;
    const isYape = intent?.method === 'yape';
    const code = confirmationCode.trim();
    const payerName = payerDisplayName.trim();
    if (isYape && !/^\d{3}$/.test(code)) {
      notificationService.notify('Escribe los 3 dígitos que aparecen en Yape.', 'warning');
      return;
    }
    if (!isYape && !payerName) {
      notificationService.notify('Escribe el nombre de quien pagó con Lemon.', 'warning');
      return;
    }
    setDeclarationBusy(true);
    try {
      const result = isYape
        ? await paymentService.confirmWalletPaymentByCode(order.id, code)
        : await paymentService.confirmWalletPayment(order.id, payerName);
      handleWalletConfirmationResult(result);
    } catch (cause) {
      notificationService.notify(
        cause instanceof Error ? cause.message : 'No pudimos vincular el pago.',
        'danger',
      );
    } finally {
      setDeclarationBusy(false);
    }
  };

  const renewManualIntent = async () => {
    if (manualBusy || !intent || intent.provider === 'culqi' || !declarationKnown || paymentDeclared)
      return;
    setManualBusy(true);
    try {
      const refreshed = await paymentService.createIntent(order.id, intent.method);
      setIntent(refreshed);
      setConfirmationCode('');
      setPayerDisplayName('');
      setWalletConfirmationStatus(null);
      notificationService.notify('QR actualizado.', 'success');
    } catch (cause) {
      notificationService.notify(
        cause instanceof Error ? cause.message : 'No pudimos actualizar el QR.',
        'danger',
      );
    } finally {
      setManualBusy(false);
    }
  };

  const openGateway = async () => {
    if (!intent || gatewayBusy || gatewayAwaitingWebhook || intent.status === 'authorized') return;
    const checkoutSessionKey = gatewaySessionKeyRef.current;
    const customerEmail = savedPaymentEmail(order.id);
    if (!customerEmail) {
      notificationService.notify('Falta el correo para abrir el pago seguro.', 'warning');
      return;
    }
    setGatewayBusy(true);
    setGatewayAwaitingWebhook(false);
    gatewayTokenBusyRef.current = false;
    try {
      const activeIntent =
        intent.status === 'failed' || isExpired(intent) || !intent.providerReference
          ? await paymentService.createIntent(order.id, intent.method, undefined, customerEmail)
          : intent;
      if (gatewaySessionKeyRef.current !== checkoutSessionKey) return;
      setIntent(activeIntent);
      await openCulqiCheckout({
        intent: activeIntent,
        method: activeIntent.method === 'card' ? 'card' : 'yape',
        customerEmail,
        onToken: async (tokenId) => {
          if (gatewaySessionKeyRef.current !== checkoutSessionKey || gatewayTokenBusyRef.current)
            return;
          gatewayTokenBusyRef.current = true;
          setGatewayBusy(true);
          try {
            const providerReference = await paymentService.chargeCard(
              activeIntent,
              tokenId,
              customerEmail,
            );
            if (gatewaySessionKeyRef.current !== checkoutSessionKey) return;
            setIntent((current) =>
              current ? { ...current, status: 'authorized', providerReference } : current,
            );
            notificationService.notify('Pago confirmado. Tu pedido ya está en el local.', 'success');
          } catch (cause) {
            if (gatewaySessionKeyRef.current !== checkoutSessionKey) return;
            const refreshed = await paymentService.getIntent(order.id).catch(() => null);
            setIntent(refreshed ?? { ...activeIntent, status: 'failed', providerReference: null });
            notificationService.notify(
              cause instanceof Error ? cause.message : 'No pudimos procesar el pago.',
              'danger',
            );
          } finally {
            if (gatewaySessionKeyRef.current === checkoutSessionKey) {
              gatewayTokenBusyRef.current = false;
              setGatewayBusy(false);
            }
          }
        },
        onOrder: () => {
          if (gatewaySessionKeyRef.current !== checkoutSessionKey) return;
          setGatewayBusy(false);
          setGatewayAwaitingWebhook(true);
          notificationService.notify('Pago enviado. Esperamos la confirmación.', 'success');
        },
        onError: (message) => {
          if (gatewaySessionKeyRef.current !== checkoutSessionKey) return;
          setGatewayBusy(false);
          setGatewayAwaitingWebhook(false);
          notificationService.notify(message, 'danger');
        },
      });
      if (gatewaySessionKeyRef.current === checkoutSessionKey && !gatewayTokenBusyRef.current)
        setGatewayBusy(false);
    } catch (cause) {
      if (gatewaySessionKeyRef.current !== checkoutSessionKey) return;
      setGatewayBusy(false);
      setGatewayAwaitingWebhook(false);
      notificationService.notify(
        cause instanceof Error ? cause.message : 'No pudimos abrir el pago seguro.',
        'danger',
      );
    }
  };

  if (paymentCancelled) {
    if (!partialPaymentCancelled && order.cancellationReason !== 'partial_wallet_payment') return null;
    return (
      <Card className="border-red-200 bg-red-50/70" role="status">
        <p className="font-semibold text-red-950">Pedido cancelado por pago parcial</p>
        <p className="mt-1 text-sm text-red-900">
          {partialPaymentCancelledMessage(walletObservedAmountCents, order.total, order.storeName)}
        </p>
      </Card>
    );
  }
  if (order.paymentMethod === 'cash') return null;
  if (loading) {
    return (
      <Card role="status" aria-busy="true">
        <div className="flex items-center gap-2 text-sm text-suya-muted">
          <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
          Cargando pago…
        </div>
      </Card>
    );
  }
  if (!intent || error) {
    return (
      <Card className="border-red-200 bg-red-50/70">
        <p className="font-semibold text-red-950">No pudimos preparar el pago</p>
        <p className="mt-1 text-sm text-red-900">{error ?? 'Vuelve a intentarlo.'}</p>
      </Card>
    );
  }
  if (intent.status === 'authorized') {
    return (
      <Card className="border-suya-green/30 bg-suya-lime-soft" role="status">
        <p className="flex items-center gap-2 font-semibold text-suya-green-dark">
          <CheckCircle2 className="h-5 w-5" aria-hidden="true" /> Pago confirmado
        </p>
        <p className="mt-1 text-sm text-suya-green-dark">El pedido ya fue enviado al local.</p>
      </Card>
    );
  }
  if (intent.status === 'refunded') {
    return (
      <Card className="border-suya-mist bg-white" role="status">
        <p className="font-semibold">Pago devuelto</p>
        <p className="mt-1 text-sm text-suya-muted">Contacta al restaurante para coordinar el siguiente paso.</p>
      </Card>
    );
  }

  const expired = isExpired(intent);
  const manualRecoveryRequired = expired || intent.status === 'failed';
  const gatewayWaiting = gatewayAwaitingWebhook && intent.status === 'pending' && !expired;
  const isManualWallet = intent.provider !== 'culqi' && (intent.method === 'yape' || intent.method === 'lemon');

  return (
    <Card className="border-suya-sun bg-suya-sun-soft">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-white/80 text-suya-green">
          <QrCode className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <h2 className="font-display text-[15px] font-bold">Paga con {paymentLabel(intent.method)}</h2>
          <p className="mt-1 text-sm text-suya-carbon">
            Por favor, introduce el monto exacto del pedido: <strong>{formatPrice(intent.amount)}</strong>.
          </p>
        </div>
      </div>

      {intent.provider === 'culqi' ? (
        <div className="mt-4 rounded-card border border-suya-green/20 bg-white p-4">
          {intent.qrPayload && /^https:\/\//i.test(intent.qrPayload) && (
            <div className="mb-4 flex justify-center">
              <img
                src={intent.qrPayload}
                alt="QR de pago"
                width={176}
                height={176}
                loading="lazy"
                decoding="async"
                className="h-44 w-44"
              />
            </div>
          )}
          <p className="text-sm text-suya-muted">
            {gatewayWaiting ? 'Esperando confirmación del pago…' : 'Continúa en el canal seguro de pago.'}
          </p>
          <Button
            type="button"
            className="mt-3"
            onClick={() => void openGateway()}
            disabled={gatewayBusy || gatewayWaiting}
          >
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
            {gatewayBusy
              ? 'Abriendo pago…'
              : gatewayWaiting
                ? 'Esperando confirmación…'
                : intent.method === 'card'
                  ? 'Pagar con tarjeta'
                  : 'Abrir Yape'}
          </Button>
        </div>
      ) : intent.qrPayload && intent.receiverLabel && !manualRecoveryRequired ? (
        <div className="mt-4 flex flex-col items-center gap-3 rounded-card border border-suya-border bg-white p-4 sm:flex-row sm:items-start">
          <div className="rounded-xl border border-suya-mist bg-white p-2">
            <QRCodeSVG value={intent.qrPayload} size={156} level="M" includeMargin />
          </div>
          <div className="text-sm text-suya-muted">
            <p className="font-semibold text-suya-carbon">Escanea el QR del negocio</p>
            <p className="mt-1">Paga exactamente {formatPrice(intent.amount)}.</p>
            <p className="mt-2 text-suya-carbon">Destinatario: <strong>{intent.receiverLabel}</strong></p>
          </div>
        </div>
      ) : (
        <div className="mt-4 rounded-card border border-suya-border bg-white p-3 text-sm text-suya-carbon">
          {manualRecoveryRequired
            ? paymentDeclared
              ? 'Tu pago sigue en revisión. No vuelvas a pagar; Caja revisará el abono.'
              : 'Este QR venció. Si ya pagaste, espera la revisión; si aún no, genera un QR nuevo.'
            : 'No pudimos mostrar el QR. Contacta al restaurante antes de pagar.'}
        </div>
      )}

      {isManualWallet && manualRecoveryRequired && !paymentDeclared && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-card bg-white p-3">
          <p className="text-sm text-suya-carbon">¿Aún no realizaste el pago?</p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => void renewManualIntent()}
            disabled={!declarationKnown || declarationBusy || manualBusy}
          >
            {manualBusy ? 'Actualizando…' : 'Generar QR nuevo'}
          </Button>
        </div>
      )}

      {isManualWallet && !manualRecoveryRequired && (
        <div className="mt-4 rounded-card border border-suya-green/20 bg-white p-3">
          {walletConfirmationStatus && (
            <p className="mb-2 text-sm font-semibold text-suya-carbon" role="status">
              {walletConfirmationStatus === 'pending'
                ? 'Esperando confirmación del pago…'
                : walletConfirmationStatus === 'code_mismatch'
                  ? 'El código no coincide. Revísalo.'
                  : walletConfirmationStatus === 'amount_mismatch'
                    ? 'El monto no coincide; Caja revisará el abono.'
                    : 'Caja revisará el pago antes de confirmarlo.'}
            </p>
          )}
          {walletConfirmationStatus === 'pending' && (
            <p className="mb-2 text-xs text-suya-muted">No realices otro pago mientras se valida.</p>
          )}
          {intent.method === 'yape' ? (
            <label className="block text-xs font-semibold text-suya-carbon">
              Código de seguridad de Yape
              <input
                aria-label="Código de seguridad de Yape"
                value={confirmationCode}
                onChange={(event) => {
                  setConfirmationCode(event.target.value.replace(/\D/g, '').slice(0, 3));
                  setWalletConfirmationStatus(null);
                  setPaymentDeclared(false);
                }}
                autoComplete="one-time-code"
                inputMode="numeric"
                maxLength={3}
                pattern="[0-9]{3}"
                placeholder="3 dígitos"
                className="mt-1 h-11 w-full rounded-btn border border-suya-border bg-white px-3 text-sm font-normal outline-none focus:border-suya-green focus:ring-2 focus:ring-suya-green/20"
                disabled={declarationBusy}
              />
            </label>
          ) : (
            <label className="block text-xs font-semibold text-suya-carbon">
              Nombre de quien pagó con Lemon
              <input
                aria-label="Nombre de quien pagó con Lemon"
                value={payerDisplayName}
                onChange={(event) => {
                  setPayerDisplayName(event.target.value);
                  setWalletConfirmationStatus(null);
                  setPaymentDeclared(false);
                }}
                autoComplete="name"
                maxLength={120}
                placeholder="Nombre del pagador"
                className="mt-1 h-11 w-full rounded-btn border border-suya-border bg-white px-3 text-sm font-normal outline-none focus:border-suya-green focus:ring-2 focus:ring-suya-green/20"
                disabled={declarationBusy}
              />
            </label>
          )}
          <Button
            type="button"
            className="mt-3"
            onClick={() => void confirmWalletPayment()}
            disabled={!declarationKnown || declarationBusy}
          >
            {declarationBusy ? (
              <>
                <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                Revisando…
              </>
            ) : intent.method === 'yape' ? (
              'Vincular código'
            ) : (
              'Vincular pago'
            )}
          </Button>
        </div>
      )}
    </Card>
  );
}
