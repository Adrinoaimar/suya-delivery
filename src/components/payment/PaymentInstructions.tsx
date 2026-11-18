import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, ExternalLink, LoaderCircle, QrCode } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { notificationService, paymentService } from '@/lib/services';
import type { WalletPaymentConfirmation, WalletPaymentConfirmationStatus } from '@/lib/services';
import { openCulqiCheckout } from '@/lib/payments/culqiCheckout';
import { synthesizeDynamicEmvcoQrFromStatic } from '@/lib/payments/paymentEngine';
import { YapeVerificationFeedback, type YapeVerificationPhase } from '@/components/payment/YapeVerificationFeedback';
import { YapePaymentActions } from '@/components/payment/YapePaymentActions';
import { ExpiredWalletClaimForm } from '@/components/payment/ExpiredWalletClaimForm';
import { PayerAppGuide } from '@/components/payment/PayerAppGuide';
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
  const [, refreshDeadline] = useState(0);
  const [loading, setLoading] = useState(!cancelled && !order.paymentIntent);
  const [error, setError] = useState<string | null>(null);
  const [confirmationCode, setConfirmationCode] = useState('');
  const [yapePhase, setYapePhase] = useState<YapeVerificationPhase | null>(null);
  const [yapeNameRequired, setYapeNameRequired] = useState(false);
  const payerFieldRef = useRef<HTMLInputElement>(null);
  const verificationRevision = useRef(0);
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
  const [yapeOtpPhone, setYapeOtpPhone] = useState('');
  const [yapeOtpCode, setYapeOtpCode] = useState('');
  const [yapeOtpBusy, setYapeOtpBusy] = useState(false);
  const gatewayTokenBusyRef = useRef(false);
  const gatewaySessionKeyRef = useRef('');
  const gatewaySessionKey = `${order.id}:${order.paymentIntent?.attemptId ?? ''}`;

  useEffect(() => {
    const duration = Date.parse(intent?.expiresAt ?? '') - Date.now();
    if (!Number.isFinite(duration) || duration <= 0 || duration >= 2_147_483_647) return;
    const timer = window.setTimeout(() => refreshDeadline((current) => current + 1), duration + 5);
    return () => window.clearTimeout(timer);
  }, [intent?.expiresAt]);

  useEffect(() => {
    if (yapePhase === 'name_required') payerFieldRef.current?.focus();
  }, [yapePhase]);

  useEffect(() => {
    setIntent(null);
    setLoading(true);
    setError(null);
    verificationRevision.current += 1;
    setYapePhase(null);
    setYapeNameRequired(false);
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
    setYapeOtpPhone('');
    setYapeOtpCode('');
    setYapeOtpBusy(false);
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
    const isAutoProvider =
      order.paymentIntent?.provider === 'culqi' ||
      order.paymentIntent?.provider === 'mercado_pago' ||
      order.paymentIntent?.provider === 'taypi_qr' ||
      order.paymentIntent?.provider === 'izipay' ||
      order.paymentIntent?.provider === 'static_qr';
    if (
      paymentCancelled ||
      !order.paymentIntent ||
      !manualWallet ||
      (isAutoProvider || order.paymentIntent.provider === 'mercadopago') ||
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
        if (order.paymentMethod !== 'yape') setPayerDisplayName(declaration?.payerDisplayName ?? '');
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
    if (
      paymentCancelled ||
      !intent ||
      intent.status !== 'pending' ||
      intent.provider !== 'taypi_qr' ||
      intent.qrPayload ||
      isExpired(intent)
    ) {
      return;
    }
    let active = true;
    void paymentService
      .createDynamicQr?.(intent)
      .then((qr) => {
        if (active && qr) {
          setIntent((current) => (current ? { ...current, qrPayload: qr } : current));
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [intent, paymentCancelled]);

  useEffect(() => {
    if (paymentCancelled || intent?.status !== 'pending') return;
    let active = true;
    const refreshSafely = () => {
      void Promise.resolve()
        .then(() => {
          if (isExpired(intent)) return;
          if (intent.observerRouted) return paymentService.retryRoutedPayment?.(order.id);
          if (intent.provider === 'static_qr') return paymentService.syncAutoCloudForOrder?.(order.id);
        })
        .catch(() => undefined)
        .then(() => paymentService.getIntent(order.id))
        .then((value) => active && value && setIntent(value))
        .catch(() => undefined);
    };
    const timer = window.setInterval(refreshSafely, 5_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [paymentCancelled, intent, order.id]);

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
    const confirmationValue = payerDisplayName.trim();
    if (
      isYape || intent?.observerRouted ||
      (walletConfirmationStatus !== 'pending' && walletConfirmationStatus !== 'code_mismatch') ||
      intent?.status !== 'pending' ||
      !confirmationValue
    ) {
      return;
    }
    let active = true;
    const check = () => {
      void paymentService.confirmWalletPayment(order.id, confirmationValue)
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
    handleWalletConfirmationResult,
    intent?.method,
    intent?.observerRouted,
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
    if (isYape && yapeNameRequired && payerName.split(/\s+/).length < 2) {
      setYapePhase('name_required');
      return;
    }
    if (!intent?.observerRouted && !isYape && !payerName) {
      notificationService.notify('Escribe el nombre de quien pagó con Lemon.', 'warning');
      return;
    }
    const revision = ++verificationRevision.current;
    setDeclarationBusy(true);
    setWalletConfirmationStatus(null);
    if (isYape) setYapePhase('checking');
    try {
      if (isYape && intent?.observerRouted) {
        const result = await paymentService.verifyRoutedYapeCode?.(order.id, code, payerName || null);
        if (!result) throw new Error('La verificación de Yape no está disponible.');
        if (revision !== verificationRevision.current) return;
        setYapePhase(result);
        if (result === 'name_required') setYapeNameRequired(true);
        if (result !== 'expired' && result !== 'retry_limit') setPaymentDeclared(true);
        if (result === 'authorized') {
          setIntent((current) => current ? { ...current, status: 'authorized' } : current);
        }
        return;
      }
      if (intent?.observerRouted) {
        await paymentService.declarePayment(order.id, code || null, payerName || null);
        setPaymentDeclared(true);
        setDeclarationKnown(true);
        setWalletConfirmationStatus('pending');
        await paymentService.retryRoutedPayment?.(order.id);
        const current = await paymentService.getIntent(order.id);
        if (current) setIntent(current);
        return;
      }
      const result = isYape
        ? await paymentService.confirmWalletPaymentByCode(order.id, code)
        : await paymentService.confirmWalletPayment(order.id, payerName);
      if (revision !== verificationRevision.current) return;
      if (isYape) {
        setYapePhase(result.status === 'pending' ? 'unobserved'
          : result.status === 'authorized' || result.status === 'code_mismatch' ? result.status : 'review');
      }
      handleWalletConfirmationResult(result, !isYape);
    } catch (cause) {
      if (revision !== verificationRevision.current) return;
      if (isYape) {
        setYapePhase('error');
        return;
      }
      notificationService.notify(
        cause instanceof Error ? cause.message : 'No pudimos vincular el pago.',
        'danger',
      );
    } finally {
      if (revision === verificationRevision.current) setDeclarationBusy(false);
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

  const expiredIntent = intent ?? order.paymentIntent;
  const expiredClaim = paymentService.reportExpiredWalletClaim && expiredIntent
    && (expiredIntent.method === 'yape' || expiredIntent.method === 'lemon')
    && (expiredIntent.observerRouted || expiredIntent.provider === 'static_qr'
      || (expiredIntent.provider === 'wallet_observer' && expiredIntent.qrPayload))
    && (expiredIntent.status === 'pending' || expiredIntent.status === 'failed')
    && (isExpired(expiredIntent) || yapePhase === 'expired')
    ? <ExpiredWalletClaimForm key={expiredIntent.attemptId} orderId={order.id} attemptId={expiredIntent.attemptId} />
    : null;

  if (paymentCancelled) {
    if (!partialPaymentCancelled && order.cancellationReason !== 'partial_wallet_payment') return expiredClaim;
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
  if (expiredClaim) return expiredClaim;
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
        <Button className="mt-3" variant="secondary" onClick={() => {
          setError(null); setLoading(true);
          void paymentService.getIntent(order.id).then((value) => {
            setIntent(value);
            if (!value) setError('No pudimos recuperar la solicitud. Conserva este pedido y vuelve a consultar.');
          }).catch(() => setError('No pudimos consultar el cobro. Comprueba tu conexión.'))
            .finally(() => setLoading(false));
        }}>Volver a consultar</Button>
      </Card>
    );
  }
  const verification = intent.method === 'yape' && yapePhase
    ? <YapeVerificationFeedback phase={intent.status === 'authorized' ? 'authorized' : yapePhase} />
    : null;
  if (intent.status === 'authorized') {
    if (verification) return <>{verification}{null}</>;
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
        <p className="font-semibold">{intent.gatewayState === 'partial_refund' ? 'Devolución parcial registrada'
          : intent.gatewayState === 'disputed' ? 'Pago en disputa' : 'Pago devuelto'}</p>
        <p className="mt-1 text-sm text-suya-muted">Contacta al restaurante para revisar el movimiento. No vuelvas a pagar hasta coordinar el siguiente paso.</p>
      </Card>
    );
  }

  const expired = isExpired(intent);
  const manualRecoveryRequired = expired || intent.status === 'failed';
  const gatewayWaiting = gatewayAwaitingWebhook && intent.status === 'pending' && !expired;
  const officialReview = ['late_review', 'amount_mismatch', 'identity_mismatch', 'partial_refund', 'disputed', 'test_confirmed'].includes(intent.gatewayState ?? '');
  let officialCheckoutUrl: string | null = null;
  try {
    const url = new URL(intent.checkoutUrl ?? '');
    if (url.protocol === 'https:' && !url.username && !url.password && !url.port &&
      ['www.mercadopago.com.pe', 'mercadopago.com.pe', 'sandbox.mercadopago.com.pe'].includes(url.hostname)) {
      officialCheckoutUrl = url.href;
    }
  } catch { /* Un enlace inválido permanece bloqueado. */ }
  const isStaticAutoCloud = intent.provider === 'static_qr';
  const isAutomaticCloudProvider =
    intent.provider === 'culqi' || intent.provider === 'mercadopago' ||
    intent.provider === 'mercado_pago' ||
    intent.provider === 'taypi_qr' ||
    intent.provider === 'izipay' ||
    isStaticAutoCloud;
  const isManualWallet =
    !isAutomaticCloudProvider && (intent.method === 'yape' || intent.method === 'lemon');

  const showYapeCodeInline = intent.method === 'yape' && intent.observerRouted;
  const PaymentEvidenceFields = showYapeCodeInline ? 'div' : 'details';

  const submitAutomaticYapeOtp = async () => {
    if (!intent || yapeOtpBusy || intent.status === 'authorized') return;
    const cleanPhone = yapeOtpPhone.replace(/\D/g, '');
    const cleanOtp = yapeOtpCode.replace(/\D/g, '');
    if (!/^9\d{8}$/.test(cleanPhone)) {
      notificationService.notify('Escribe tu celular Yape de 9 dígitos.', 'warning');
      return;
    }
    if (!/^\d{6}$/.test(cleanOtp)) {
      notificationService.notify(
        'Escribe el código de aprobación de 6 dígitos de la app Yape.',
        'warning',
      );
      return;
    }
    if (!paymentService.chargeYapeOtp) {
      notificationService.notify('El cobro automático Yape no está habilitado.', 'danger');
      return;
    }
    setYapeOtpBusy(true);
    try {
      const providerReference = await paymentService.chargeYapeOtp(
        intent,
        cleanPhone,
        cleanOtp,
        savedPaymentEmail(order.id),
      );
      setIntent((current) =>
        current ? { ...current, status: 'authorized', providerReference } : current,
      );
      notificationService.notify(
        'Pago confirmado automáticamente. Tu pedido ya fue enviado al restaurante.',
        'success',
      );
    } catch (cause) {
      notificationService.notify(
        cause instanceof Error ? cause.message : 'No pudimos completar el cobro con Yape.',
        'danger',
      );
    } finally {
      setYapeOtpBusy(false);
    }
  };

  return (
    <>
      {verification}
      <Card className="border-suya-sun bg-suya-sun-soft">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-white/80 text-suya-green">
          <QrCode className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <h2 className="font-display text-[15px] font-bold">{intent.provider === 'mercadopago' ? 'Pago seguro con Mercado Pago' : `Paga con ${paymentLabel(intent.method)}`}</h2>
          {intent.observerRouted ? (
            <div className="mt-1 space-y-0.5">
              <p className="font-display text-xl font-bold text-suya-carbon">{formatPrice(intent.amount)}</p>
              {intent.receiverLabel && <p className="text-sm text-suya-muted">Destinatario <strong className="text-suya-carbon">{intent.receiverLabel}</strong></p>}
            </div>
          ) : (
            <p className="mt-1 text-sm text-suya-carbon">
              Por favor, introduce el monto exacto del pedido: <strong>{formatPrice(intent.amount)}</strong>.
            </p>
          )}
        </div>
      </div>

      {intent.provider === 'mercadopago' ? (
        <div className="mt-4 rounded-card border border-suya-green/20 bg-white p-4">
          {intent.environment === 'test' && <p className="mb-2 font-semibold text-suya-carbon">Entorno de prueba — sin aprobación de pedidos reales</p>}
          <p className="text-sm text-suya-muted" role="status">
            {officialReview ? 'El abono requiere conciliación. No vuelvas a pagar; el restaurante revisará el movimiento con el proveedor.'
              : expired ? 'La solicitud venció. Si pagaste, no repitas el pago: consulta al restaurante para conciliarlo.'
                : intent.status === 'failed' ? 'El proveedor no confirmó este cobro. Consulta al restaurante antes de intentarlo otra vez.'
                  : 'Esperamos la confirmación del proveedor. El pedido se enviará al restaurante cuando el servidor verifique el abono.'}
          </p>
          {!officialReview && !expired && intent.status === 'pending' && officialCheckoutUrl && (
            <a className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-btn bg-suya-green px-4 py-2 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-suya-green"
              href={officialCheckoutUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4" aria-hidden="true" /> Abrir pago seguro
            </a>
          )}
          {!officialReview && !expired && intent.status === 'pending' && !officialCheckoutUrl && (
            <Button className="mt-3" disabled={gatewayBusy} onClick={() => {
              setGatewayBusy(true); setError(null);
              void paymentService.createIntent(order.id, intent.method).then(setIntent)
                .catch(() => setError('No pudimos preparar el enlace. Reintenta con este mismo pedido.'))
                .finally(() => setGatewayBusy(false));
            }}>{gatewayBusy ? 'Preparando…' : 'Preparar enlace de pago'}</Button>
          )}
          <p className="mt-3 text-xs text-suya-muted">Volver del checkout no confirma el pago. La aceptación del restaurante sigue siendo independiente.</p>
        </div>
      ) : intent.provider === 'mercado_pago' ? (
        <div className="mt-4 space-y-3 rounded-card border border-suya-green/20 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-suya-green">
            Confirmación 100% automática · Yape Oficial
          </p>
          <p className="text-sm text-suya-carbon">
            Abre tu app <strong>Yape → menú «Aprobar compras»</strong> y escribe tu celular junto al
            código de 6 dígitos para confirmar tu pedido al instante.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-semibold text-suya-carbon">
              Celular afiliado a Yape
              <input
                aria-label="Celular afiliado a Yape"
                value={yapeOtpPhone}
                onChange={(event) =>
                  setYapeOtpPhone(event.target.value.replace(/\D/g, '').slice(0, 9))
                }
                inputMode="numeric"
                maxLength={9}
                placeholder="987654321"
                className="mt-1 h-11 w-full rounded-btn border border-suya-border bg-white px-3 text-sm font-normal outline-none focus:border-suya-green focus:ring-2 focus:ring-suya-green/20"
                disabled={yapeOtpBusy}
              />
            </label>
            <label className="block text-xs font-semibold text-suya-carbon">
              Código de aprobación Yape (6 dígitos)
              <input
                aria-label="Código de aprobación Yape (6 dígitos)"
                value={yapeOtpCode}
                onChange={(event) =>
                  setYapeOtpCode(event.target.value.replace(/\D/g, '').slice(0, 6))
                }
                inputMode="numeric"
                maxLength={6}
                placeholder="123456"
                className="mt-1 h-11 w-full rounded-btn border border-suya-border bg-white px-3 text-sm font-normal outline-none focus:border-suya-green focus:ring-2 focus:ring-suya-green/20"
                disabled={yapeOtpBusy}
              />
            </label>
          </div>
          <Button
            type="button"
            onClick={() => void submitAutomaticYapeOtp()}
            disabled={yapeOtpBusy}
          >
            {yapeOtpBusy ? (
              <>
                <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                Verificando cobro con Yape…
              </>
            ) : (
              `Confirmar pago de ${formatPrice(intent.amount)} con Yape`
            )}
          </Button>
        </div>
      ) : intent.provider === 'taypi_qr' || intent.provider === 'izipay' ? (
        <div className="mt-4 flex flex-col items-center gap-3 rounded-card border border-suya-green/20 bg-white p-4 sm:flex-row sm:items-start">
          {intent.qrPayload && (
            <div className="rounded-xl border border-suya-mist bg-white p-2">
              <QRCodeSVG value={intent.qrPayload} size={156} level="M" includeMargin />
            </div>
          )}
          <div className="text-sm text-suya-muted">
            <p className="text-xs font-semibold uppercase tracking-wider text-suya-green">
              QR Dinámico Interoperable · Confirmación automática
            </p>
            <p className="mt-1 font-semibold text-suya-carbon">
              Escanea desde Yape, Plin o tu banco
            </p>
            <p className="mt-1">
              El monto exacto de <strong>{formatPrice(intent.amount)}</strong> y la referencia{' '}
              <strong>{intent.checkoutReference}</strong> están incluidos en este QR.
            </p>
            <p className="mt-2 text-xs text-suya-green-dark">
              Tu pedido se liberará automáticamente al restaurante apenas se confirme la transferencia.
            </p>
          </div>
        </div>
      ) : intent.provider === 'culqi' ? (
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
      ) : intent.qrPayload && (intent.receiverLabel || isStaticAutoCloud) && !manualRecoveryRequired ? (
        (() => {
          const synthesized = intent.observerRouted
            ? { qrPayload: intent.qrPayload, amountPenFormatted: intent.amount.toFixed(2), isEmvcoDynamic: false }
            : synthesizeDynamicEmvcoQrFromStatic({
            staticQrPayload: intent.qrPayload,
            amountCents: Math.round(intent.amount * 100),
            checkoutReference: intent.checkoutReference,
          });
          const isImageQr = !intent.observerRouted && /^(?:https:\/\/|data:image\/)/i.test(synthesized.qrPayload);
          return (
            <div className="mt-4 flex flex-col items-center gap-3 rounded-card border border-suya-border bg-white p-4 sm:flex-row sm:items-start">
              <div data-light-surface className="rounded-xl border border-suya-mist bg-white p-2">
                {isImageQr ? (
                  <img src={synthesized.qrPayload}
                    alt="Código QR de pago del comercio"
                    className="h-[156px] w-[156px] object-contain"
                  width={156} height={156} loading="eager" decoding="async" />
                ) : (
                  <QRCodeSVG value={synthesized.qrPayload} size={156} level="M" includeMargin />
                )}
              </div>
              <div className="text-sm text-suya-muted">
                <p className="font-semibold text-suya-carbon">Escanea el QR del negocio</p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  {!intent.observerRouted && (
                    <p>Paga exactamente <strong className="text-suya-carbon">{formatPrice(intent.amount)}</strong>.</p>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard?.writeText(synthesized.amountPenFormatted);
                      notificationService.notify(
                        `Monto exacto S/ ${synthesized.amountPenFormatted} copiado.`,
                        'info',
                      );
                    }}
                    className="rounded-btn border border-suya-border bg-suya-mist/50 px-2 py-0.5 text-xs font-semibold text-suya-carbon hover:bg-suya-mist"
                  >
                    {intent.observerRouted ? 'Copiar monto' : `Copiar monto (${synthesized.amountPenFormatted})`}
                  </button>
                </div>
                {intent.receiverLabel && !intent.observerRouted && (
                  <p className="mt-2 text-suya-carbon">
                    Destinatario: <strong>{intent.receiverLabel}</strong>
                  </p>
                )}
                {intent.observerRouted && (
                  <p className="mt-2 text-xs">{intent.method === 'yape' ? 'Escanea el QR desde Yape y confirma el monto.' : 'Suya verificará el abono aquí. Si ya pagaste, evita repetir el pago.'}</p>
                )}
                {intent.method === 'yape' && (
                  <YapePaymentActions qrPayload={synthesized.qrPayload} isImage={isImageQr} receiverPhone={intent.receiverPhone} />
                )}
                {isStaticAutoCloud && (
                  <PayerAppGuide
                    qrPayload={intent.qrPayload}
                    amountLabel={synthesized.amountPenFormatted}
                    initialPayerApp={intent.method === 'lemon' ? 'lemon' : 'yape'}
                  />
                )}
                {isStaticAutoCloud && (
                  <div className="mt-2 space-y-1.5">
                    <p className="flex items-center gap-1.5 text-xs font-semibold text-suya-green-dark">
                      <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                      Confirmación AutoCloud en curso (Yape / Plin / Lemon / IzipayYA)
                    </p>
                    <p className="text-xs text-suya-muted">
                      {synthesized.isEmvcoDynamic ? (
                        <>
                          Referencia <strong>{intent.checkoutReference}</strong> y monto exacto
                          embebidos en el QR.
                        </>
                      ) : (
                        <>
                          Ingresa exactamente <strong>S/ {synthesized.amountPenFormatted}</strong> al
                          escanear este QR para conciliar automáticamente tu pedido (
                          <strong>{intent.checkoutReference}</strong>).
                        </>
                      )}{' '}
                      Apenas llegue el aviso del banco a la nube, pasará a preparación.
                    </p>
                  </div>
                )}
              </div>
            </div>
          );
        })()
      ) : (
        <div className="mt-4 rounded-card border border-suya-border bg-white p-3 text-sm text-suya-carbon">
          {manualRecoveryRequired
            ? intent.observerRouted
              ? 'El QR venció. Si ya pagaste, informa el abono para que Caja lo revise.'
              : paymentDeclared
              ? 'Tu pago sigue en revisión. No vuelvas a pagar; Caja revisará el abono.'
              : 'Este QR venció. Si ya pagaste, espera la revisión; si aún no, genera un QR nuevo.'
            : 'No pudimos mostrar el QR. Contacta al restaurante antes de pagar.'}
        </div>
      )}

      {isManualWallet && !intent.observerRouted && manualRecoveryRequired && !paymentDeclared && (
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

      {isManualWallet && (!manualRecoveryRequired || intent.observerRouted) && (
        <div className="mt-4 rounded-card border border-suya-green/20 bg-white p-3">
          {walletConfirmationStatus && (intent.method !== 'yape' || walletConfirmationStatus === 'amount_mismatch') && (
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
          {intent.method !== 'yape' && walletConfirmationStatus === 'pending' && (
            <p className="mb-2 text-xs text-suya-muted">No realices otro pago mientras se valida.</p>
          )}
          {intent.observerRouted ? (
            <PaymentEvidenceFields className="space-y-3" open={showYapeCodeInline ? undefined : paymentDeclared || undefined}>
              {showYapeCodeInline ? (
                <div>
                  <h3 className="font-display text-sm font-bold text-suya-carbon">Verifica tu pago en Yape</h3>
                  <p id="yape-code-guide" className="mt-1 text-sm text-suya-muted">
                    En Yape, abre el pago en <strong>Movimientos</strong> y busca el código de
                    seguridad de 3 dígitos en el comprobante. Ejemplo: <strong>047</strong>.
                  </p>
                </div>
              ) : (
                <summary className="min-h-11 cursor-pointer text-sm font-semibold text-suya-green">
                  Ya pagué · informar a Caja
                </summary>
              )}
              <label className="block text-sm font-semibold text-suya-carbon">
                {intent.method === 'yape' ? 'Código de seguridad de Yape (obligatorio)' : 'Código del comprobante (opcional)'}
                <input
                  value={confirmationCode}
                  onChange={(event) => {
                    setConfirmationCode(intent.method === 'yape'
                      ? event.target.value.replace(/\D/g, '').slice(0, 3)
                      : event.target.value.replace(/[^a-z0-9-]/gi, '').slice(0, 64));
                    setYapePhase(null);
                    if (showYapeCodeInline) {
                      setYapeNameRequired(false);
                      setPayerDisplayName('');
                    }
                  }}
                  disabled={declarationBusy || yapePhase === 'retry_limit' || yapePhase === 'expired'}
                  inputMode={intent.method === 'yape' ? 'numeric' : 'text'}
                  required={intent.method === 'yape'}
                  aria-describedby={intent.method === 'yape' ? 'yape-code-guide' : undefined}
                  maxLength={intent.method === 'yape' ? 3 : 64}
                  placeholder={intent.method === 'yape' ? '000' : undefined}
                  autoComplete="off"
                  className="mt-1 h-11 w-full rounded-btn border border-suya-border px-3 text-sm"
                />
              </label>
              {(!showYapeCodeInline || yapeNameRequired) && <label className="block text-sm font-semibold text-suya-carbon">
                {showYapeCodeInline ? 'Nombre y apellido de quien pagó' : 'Nombre de quien pagó (opcional)'}
                <input
                  ref={payerFieldRef}
                  value={payerDisplayName}
                  onChange={(event) => setPayerDisplayName(event.target.value)}
                  required={showYapeCodeInline}
                  disabled={declarationBusy}
                  maxLength={120}
                  autoComplete="name"
                  className="mt-1 h-11 w-full rounded-btn border border-suya-border px-3 text-sm"
                />
              </label>}
              <Button type="button" className={showYapeCodeInline ? 'w-full sm:w-auto' : undefined} onClick={() => void confirmWalletPayment()} disabled={!declarationKnown || declarationBusy || yapePhase === 'retry_limit' || yapePhase === 'expired' || (intent.method === 'yape' && !/^\d{3}$/.test(confirmationCode))}>
                {declarationBusy ? 'Revisando…' : intent.method === 'yape' ? 'Verificar pago' : 'Informar pago'}
              </Button>
            </PaymentEvidenceFields>
          ) : intent.method === 'yape' ? (
            <label className="block text-xs font-semibold text-suya-carbon">
              Código de seguridad de Yape
              <input
                aria-label="Código de seguridad de Yape"
                value={confirmationCode}
                onChange={(event) => {
                  setConfirmationCode(event.target.value.replace(/\D/g, '').slice(0, 3));
                  setYapePhase(null);
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
          {!intent.observerRouted && <Button
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
          </Button>}
        </div>
      )}
      </Card>
    </>
  );
}
