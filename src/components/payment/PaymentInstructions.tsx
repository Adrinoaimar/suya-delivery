import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, Copy, ExternalLink, LoaderCircle, QrCode, ShieldCheck } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Badge } from '@/components/common/Badge';
import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { notificationService, paymentService } from '@/lib/services';
import type { WalletPaymentConfirmation, WalletPaymentConfirmationStatus } from '@/lib/services';
import { openCulqiCheckout } from '@/lib/payments/culqiCheckout';
import type { Order, PaymentIntent } from '@/types';
import { formatDateTime, formatPrice, paymentLabel } from '@/utils/format';

interface PaymentInstructionsProps {
  order: Pick<Order, 'id' | 'code' | 'total' | 'paymentMethod' | 'paymentIntent' | 'status'>;
}

function statusLabel(status: PaymentIntent['status'], expired = false): string {
  if (status === 'authorized') return 'Pago verificado';
  if (status === 'failed') return 'Pago rechazado';
  if (status === 'refunded') return 'Pago devuelto';
  if (expired) return 'Intento expirado';
  return 'Pendiente de verificación';
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

export function PaymentInstructions({ order }: PaymentInstructionsProps) {
  const cancelled = order.status === 'cancelled';
  const [intent, setIntent] = useState<PaymentIntent | null>(
    cancelled ? null : (order.paymentIntent ?? null),
  );
  const [loading, setLoading] = useState(!cancelled && !order.paymentIntent);
  const [error, setError] = useState<string | null>(null);
  const [evidenceCode, setEvidenceCode] = useState('');
  const [confirmationCode, setConfirmationCode] = useState('');
  const [payerDisplayName, setPayerDisplayName] = useState('');
  const [submittingEvidence, setSubmittingEvidence] = useState(false);
  const [evidenceSaved, setEvidenceSaved] = useState(false);
  const [paymentDeclared, setPaymentDeclared] = useState(false);
  const [declarationKnown, setDeclarationKnown] = useState(false);
  const [declarationBusy, setDeclarationBusy] = useState(false);
  const [walletConfirmationStatus, setWalletConfirmationStatus] =
    useState<WalletPaymentConfirmationStatus | null>(null);
  const [gatewayBusy, setGatewayBusy] = useState(false);
  const [gatewayAwaitingWebhook, setGatewayAwaitingWebhook] = useState(false);
  const [manualBusy, setManualBusy] = useState(false);
  const gatewayTokenBusyRef = useRef(false);
  const gatewaySessionKeyRef = useRef('');
  const gatewaySessionKey = `${order.id}:${order.status}:${order.paymentIntent?.attemptId ?? ''}`;

  useEffect(() => {
    // Este componente vive en rutas que pueden cambiar de pedido o de intento sin desmontarse.
    // Nunca arrastres intento, constancia ni estados de checkout del contexto anterior.
    setIntent(null);
    setLoading(true);
    setError(null);
    setEvidenceCode('');
    setConfirmationCode('');
    setPayerDisplayName('');
    setSubmittingEvidence(false);
    setEvidenceSaved(false);
    setPaymentDeclared(false);
    setDeclarationKnown(false);
    setDeclarationBusy(false);
    setWalletConfirmationStatus(null);
    setGatewayBusy(false);
    setGatewayAwaitingWebhook(false);
    setManualBusy(false);
    gatewayTokenBusyRef.current = false;
    gatewaySessionKeyRef.current = gatewaySessionKey;
  }, [gatewaySessionKey]);

  useEffect(() => {
    if (cancelled || order.paymentMethod === 'cash' || order.paymentIntent) return;
    let active = true;
    setLoading(true);
    void paymentService
      .getIntent(order.id)
      .then((value) => {
        if (active) {
          setIntent(value);
          setError(value ? null : 'Todavía no hay un intento digital para este pedido.');
        }
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : 'No pudimos cargar el pago.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [cancelled, order.id, order.paymentIntent, order.paymentMethod]);

  useEffect(() => {
    if (cancelled || !order.paymentIntent) return;
    setIntent(order.paymentIntent);
    setError(null);
    setLoading(false);
  }, [cancelled, order.paymentIntent]);

  useEffect(() => {
    const isManualWallet = order.paymentMethod === 'yape' || order.paymentMethod === 'lemon';
    if (
      cancelled ||
      !order.paymentIntent ||
      !isManualWallet ||
      order.paymentIntent.provider === 'culqi' ||
      order.paymentIntent.status === 'refunded'
    ) {
      setPaymentDeclared(false);
      setDeclarationKnown(true);
      return;
    }

    let active = true;
    setDeclarationKnown(false);
    void Promise.resolve(paymentService.getPaymentDeclaration(order.id))
      .then((declaration) => {
        if (!active) return;
        setPaymentDeclared(Boolean(declaration));
        setPayerDisplayName(
          order.paymentMethod === 'yape' ? '' : (declaration?.payerDisplayName ?? ''),
        );
        setDeclarationKnown(true);
      })
      .catch(() => {
        // Fail closed: an unavailable declaration state must never expose a
        // renewal action that could create a second payment.
        if (active) setDeclarationKnown(false);
      });
    return () => {
      active = false;
    };
  }, [
    cancelled,
    order.id,
    order.paymentIntent,
    order.paymentIntent?.attemptId,
    order.paymentIntent?.provider,
    order.paymentMethod,
  ]);

  useEffect(() => {
    if (cancelled || intent?.status !== 'pending') return;
    let active = true;
    const refresh = () => {
      void paymentService
        .getIntent(order.id)
        .then((value) => {
          if (active && value) setIntent(value);
        })
        .catch(() => undefined);
    };
    const timer = window.setInterval(refresh, 5_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [cancelled, intent?.status, order.id]);

  useEffect(() => {
    if (!intent || intent.status !== 'pending' || isExpired(intent)) {
      setGatewayAwaitingWebhook(false);
    }
  }, [intent]);

  const handleWalletConfirmationResult = useCallback(
    (result: WalletPaymentConfirmation, notifyPending = true) => {
      setWalletConfirmationStatus(result.status);
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
        setPaymentDeclared(true);
        setDeclarationKnown(true);
        notificationService.notify(
          'Pago realizado y validado. El pedido quedó liberado para preparación.',
          'success',
        );
        return;
      }
      setPaymentDeclared(true);
      setDeclarationKnown(true);
      if (result.status === 'ambiguous') {
        notificationService.notify(
          'Encontramos más de una notificación compatible. Caja debe revisar el pago antes de liberarlo.',
          'warning',
        );
      } else if (notifyPending) {
        notificationService.notify(
          'Pago registrado. Estamos validando identidad, monto y hora con la notificación.',
          'success',
        );
      }
    },
    [],
  );

  useEffect(() => {
    const isYapeConfirmation = intent?.method === 'yape';
    const confirmationValue = isYapeConfirmation
      ? confirmationCode.trim()
      : payerDisplayName.trim();
    if (
      walletConfirmationStatus !== 'pending' ||
      intent?.status !== 'pending' ||
      !confirmationValue
    ) {
      return;
    }
    let active = true;
    const confirm = () => {
      const request = isYapeConfirmation
        ? paymentService.confirmWalletPaymentByCode(order.id, confirmationValue)
        : paymentService.confirmWalletPayment(order.id, confirmationValue);
      void request
        .then((result) => {
          if (!active || result.status === 'pending') return;
          handleWalletConfirmationResult(result, false);
        })
        .catch(() => undefined);
    };
    const timer = window.setInterval(confirm, 5_000);
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

  const gatewayStatus = intent?.status;

  if (cancelled || order.paymentMethod === 'cash') return null;
  if (loading) {
    return (
      <Card role="status" aria-busy="true">
        <div className="flex items-center gap-2 text-sm text-suya-muted">
          <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
          Cargando instrucciones de pago…
        </div>
      </Card>
    );
  }
  if (!intent || error) {
    return (
      <Card className="border-red-200 bg-red-50/70">
        <p className="font-semibold text-red-950">No se pudo preparar el pago digital</p>
        <p className="mt-1 text-sm text-red-900">
          {error ?? 'Inténtalo desde el detalle del pedido.'}
        </p>
      </Card>
    );
  }

  const verified = intent.status === 'authorized';
  const paymentRefunded = intent.status === 'refunded';
  const gatewayExpired = isExpired(intent);
  const gatewayWaitingForWebhook =
    gatewayAwaitingWebhook && intent.status === 'pending' && !gatewayExpired;
  const manualRecoveryRequired = !paymentRefunded && (gatewayExpired || intent.status === 'failed');
  const copyReference = async () => {
    try {
      await navigator.clipboard.writeText(intent.checkoutReference);
      notificationService.notify('Referencia copiada.', 'success');
    } catch {
      notificationService.notify('No pudimos copiarla; escríbela manualmente.', 'warning');
    }
  };

  const saveEvidence = async () => {
    const normalizedCode = evidenceCode.trim();
    const normalizedPayerName = payerDisplayName.trim();
    const isYapeWallet = intent.method === 'yape';
    const hasCode = Boolean(normalizedCode);
    if (isYapeWallet && !/^\d{3}$/.test(normalizedCode)) {
      notificationService.notify('El código Yape debe tener exactamente 3 dígitos.', 'warning');
      return;
    }
    if (!hasCode && (!normalizedPayerName || isYapeWallet)) {
      notificationService.notify(
        isYapeWallet
          ? 'Escribe el código Yape de 3 dígitos.'
          : 'Escribe el código o el nombre de quien realizó el pago.',
        'warning',
      );
      return;
    }
    setSubmittingEvidence(true);
    try {
      const saved = await paymentService.declarePayment(
        order.id,
        normalizedCode || null,
        isYapeWallet ? null : normalizedPayerName || null,
      );
      if (!saved) throw new Error('No pudimos vincular la constancia al pedido.');
      setEvidenceCode('');
      setEvidenceSaved(hasCode);
      setPaymentDeclared(true);
      setDeclarationKnown(true);
      notificationService.notify(
        hasCode
          ? 'Código guardado. Caja podrá identificar este pago.'
          : 'Pagador guardado. Caja podrá usar este dato para revisar el pago.',
        'success',
      );
    } catch (cause) {
      notificationService.notify(
        cause instanceof Error ? cause.message : 'No pudimos guardar el código.',
        'danger',
      );
    } finally {
      setSubmittingEvidence(false);
    }
  };

  const editEvidence = () => {
    setEvidenceSaved(false);
    setEvidenceCode('');
  };

  const renewManualIntent = async () => {
    if (manualBusy || intent.provider === 'culqi' || !declarationKnown || paymentDeclared) return;
    setManualBusy(true);
    try {
      const refreshed = await paymentService.createIntent(order.id, intent.method);
      setIntent(refreshed);
      setEvidenceCode('');
      setConfirmationCode('');
      setPayerDisplayName('');
      setEvidenceSaved(false);
      notificationService.notify('Nueva referencia de pago generada.', 'success');
    } catch (cause) {
      notificationService.notify(
        cause instanceof Error ? cause.message : 'No pudimos generar una nueva referencia.',
        'danger',
      );
    } finally {
      setManualBusy(false);
    }
  };

  const confirmWalletPayment = async () => {
    if (declarationBusy || paymentDeclared || !declarationKnown) return;
    const isYapeWallet = intent.method === 'yape';
    const normalizedCode = confirmationCode.trim();
    const normalizedPayerName = payerDisplayName.trim();
    if (isYapeWallet && !/^\d{3}$/.test(normalizedCode)) {
      notificationService.notify('Escribe el código Yape de 3 dígitos.', 'warning');
      return;
    }
    if (!isYapeWallet && !normalizedPayerName) {
      notificationService.notify(
        'Escribe el nombre que aparece en la cuenta de Lemon que realizó el pago.',
        'warning',
      );
      return;
    }
    setDeclarationBusy(true);
    try {
      const result = isYapeWallet
        ? await paymentService.confirmWalletPaymentByCode(order.id, normalizedCode)
        : await paymentService.confirmWalletPayment(order.id, normalizedPayerName);
      handleWalletConfirmationResult(result);
    } catch (cause) {
      notificationService.notify(
        cause instanceof Error ? cause.message : 'No pudimos validar el pago.',
        'danger',
      );
    } finally {
      setDeclarationBusy(false);
    }
  };

  const openGateway = async () => {
    if (gatewayBusy || gatewayWaitingForWebhook || verified || paymentRefunded) return;
    const checkoutSessionKey = gatewaySessionKeyRef.current;
    const customerEmail = savedPaymentEmail(order.id);
    if (!customerEmail) {
      notificationService.notify('Falta el correo usado para abrir el checkout seguro.', 'warning');
      return;
    }
    setGatewayBusy(true);
    setGatewayAwaitingWebhook(false);
    gatewayTokenBusyRef.current = false;
    try {
      const activeIntent =
        intent.status === 'failed' || gatewayExpired || !intent.providerReference
          ? await paymentService.createIntent(order.id, intent.method, undefined, customerEmail)
          : intent;
      if (gatewaySessionKeyRef.current !== checkoutSessionKey) return;
      setIntent(activeIntent);
      await openCulqiCheckout({
        intent: activeIntent,
        method: activeIntent.method === 'card' ? 'card' : 'yape',
        customerEmail,
        onToken: async (tokenId) => {
          // Custom Checkout abre un modal no bloqueante. El callback puede
          // llegar después de que openCulqiCheckout() haya retornado.
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
            notificationService.notify(
              `${activeIntent.method === 'card' ? 'Tarjeta' : 'Yape'} autorizado. Pedido identificado en Suya.`,
              'success',
            );
          } catch (cause) {
            // El backend cierra el intento cuando Culqi rechaza el cargo. No
            // conserves el estado pending local: así el próximo toque crea
            // una orden/referencia nueva y no reusa la anterior.
            if (gatewaySessionKeyRef.current !== checkoutSessionKey) return;
            const refreshed = await paymentService.getIntent(order.id).catch(() => null);
            setIntent(
              refreshed ?? {
                ...activeIntent,
                status: 'failed',
                providerReference: null,
              },
            );
            notificationService.notify(
              cause instanceof Error
                ? cause.message
                : `No pudimos procesar ${activeIntent.method === 'card' ? 'la tarjeta' : 'Yape'}.`,
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
          notificationService.notify(
            'Pago enviado. El servidor actualizará esta pantalla cuando valide el pago.',
            'success',
          );
        },
        onError: (message) => {
          if (gatewaySessionKeyRef.current !== checkoutSessionKey) return;
          setGatewayBusy(false);
          setGatewayAwaitingWebhook(false);
          notificationService.notify(message, 'danger');
        },
      });
      // Culqi.open() no espera a que el usuario cierre el modal. Liberamos el
      // estado de apertura para no dejar la pantalla bloqueada si lo cancela;
      // onToken vuelve a marcarlo ocupado durante el cobro.
      if (gatewaySessionKeyRef.current === checkoutSessionKey && !gatewayTokenBusyRef.current)
        setGatewayBusy(false);
    } catch (cause) {
      if (gatewaySessionKeyRef.current !== checkoutSessionKey) return;
      setGatewayBusy(false);
      setGatewayAwaitingWebhook(false);
      notificationService.notify(
        cause instanceof Error ? cause.message : 'No pudimos abrir el checkout seguro.',
        'danger',
      );
    }
  };

  return (
    <Card
      className={
        verified ? 'border-suya-green/30 bg-suya-lime-soft' : 'border-suya-sun bg-suya-sun-soft'
      }
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-white/80 text-suya-green">
            {verified ? (
              <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
            ) : (
              <QrCode className="h-5 w-5" aria-hidden="true" />
            )}
          </span>
          <div>
            <h2 className="font-display text-[15px] font-bold">
              {verified ? 'Pago verificado con' : 'Paga con'} {paymentLabel(intent.method)}
            </h2>
            <p className="mt-1 text-sm text-suya-muted">
              Monto exacto: <strong>{formatPrice(intent.amount)}</strong>
            </p>
          </div>
        </div>
        <Badge tone={verified ? 'lime' : 'sun'}>{statusLabel(intent.status, gatewayExpired)}</Badge>
      </div>

      {paymentRefunded ? (
        <div className="mt-4 rounded-card border border-suya-border bg-white p-4 text-sm text-suya-carbon">
          Este pago fue devuelto. No vuelvas a pagar desde esta pantalla; contacta al restaurante
          para revisar el siguiente paso.
        </div>
      ) : intent.provider === 'culqi' && !verified ? (
        <div className="mt-4 rounded-card border border-suya-green/20 bg-white p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-suya-lime-soft text-suya-green">
                <QrCode className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <p className="font-semibold text-suya-carbon">Pago electrónico seguro</p>
                <p className="mt-1 text-sm text-suya-muted">
                  Abre el canal autorizado para pagar el monto exacto de este pedido.
                </p>
              </div>
            </div>
            <Button
              type="button"
              onClick={() => void openGateway()}
              disabled={gatewayBusy || gatewayWaitingForWebhook || verified || paymentRefunded}
            >
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
              {gatewayBusy
                ? 'Procesando…'
                : gatewayWaitingForWebhook
                  ? 'Esperando confirmación…'
                  : verified
                    ? 'Pago verificado'
                    : gatewayStatus === 'failed' || gatewayExpired
                      ? 'Reintentar pago'
                      : intent.method === 'card'
                        ? 'Pagar con tarjeta'
                        : 'Abrir QR Yape'}
            </Button>
          </div>
          {intent.qrPayload && /^https:\/\//i.test(intent.qrPayload) && (
            <div className="mt-4 flex justify-center rounded-btn border border-suya-mist bg-white p-3">
              <img
                src={intent.qrPayload}
                alt="QR Yape generado para este pedido"
                width={176}
                height={176}
                loading="eager"
                decoding="async"
                className="h-44 w-44"
              />
            </div>
          )}
          <p className="mt-3 text-xs text-suya-muted">
            Referencia de pago:{' '}
            <span className="font-mono">{intent.providerReference ?? 'pendiente'}</span>
          </p>
        </div>
      ) : !verified && intent.qrPayload && intent.receiverLabel && !manualRecoveryRequired ? (
        <div className="mt-4 flex flex-col items-center gap-3 rounded-card border border-suya-border bg-white p-4 sm:flex-row sm:items-start">
          <div className="rounded-xl border border-suya-mist bg-white p-2">
            <QRCodeSVG value={intent.qrPayload} size={156} level="M" includeMargin />
          </div>
          <div className="text-sm text-suya-muted">
            <p className="font-semibold text-suya-carbon">QR del negocio</p>
            <p className="mt-1">
              Escanéalo en {paymentLabel(intent.method)} y escribe exactamente{' '}
              {formatPrice(intent.amount)}.
            </p>
            {intent.receiverLabel && (
              <p className="mt-2 text-suya-carbon">
                Destinatario: <strong>{intent.receiverLabel}</strong>
              </p>
            )}
            <p className="mt-2 text-xs">
              Este QR identifica al negocio; el monto se valida en Suya contra el pedido.
            </p>
          </div>
        </div>
      ) : (
        <div className="mt-4 rounded-btn border border-suya-sun/60 bg-white/70 p-3 text-sm text-suya-carbon">
          {paymentRefunded
            ? 'Este pago fue devuelto. No vuelvas a pagar desde esta referencia.'
            : verified
              ? 'Pago verificado. No vuelvas a pagar desde esta referencia.'
              : manualRecoveryRequired
                ? 'Esta referencia ya venció. Si ya pagaste, conserva esta revisión; si aún no pagaste, usa la opción correspondiente más abajo.'
                : !intent.receiverLabel
                  ? 'No pudimos validar el destinatario de este QR. No pagues todavía; vuelve a intentarlo o contacta al restaurante.'
                  : 'No pudimos mostrar un QR válido del negocio. No pagues todavía; contacta al restaurante para validar el destinatario.'}
        </div>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.14em] text-suya-muted">
            Referencia del pedido
          </p>
          <p className="mt-1 break-all font-mono text-lg font-bold text-suya-carbon">
            {intent.checkoutReference}
          </p>
          <p className="mt-1 text-xs text-suya-muted">
            Pedido #{order.code} · vence {formatDateTime(intent.expiresAt)}
          </p>
        </div>
        <Button type="button" variant="secondary" size="sm" onClick={() => void copyReference()}>
          <Copy className="h-4 w-4" aria-hidden="true" />
          Copiar referencia
        </Button>
      </div>

      {intent.provider !== 'culqi' && manualRecoveryRequired && !paymentDeclared && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-btn border border-suya-sun/60 bg-white/80 p-3">
          <p className="text-sm text-suya-carbon">
            Esta referencia ya venció. Si ya pagaste, conserva esta revisión; si aún no pagaste,
            genera una referencia nueva.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => void renewManualIntent()}
              disabled={!declarationKnown || declarationBusy || manualBusy}
            >
              {manualBusy ? 'Generando…' : 'Aún no pagué'}
            </Button>
          </div>
        </div>
      )}

      {!verified &&
        !paymentRefunded &&
        intent.provider !== 'culqi' &&
        (intent.method === 'yape' || intent.method === 'lemon') && (
          <div className="mt-4 rounded-btn border border-suya-green/20 bg-white/75 p-3">
            {!paymentDeclared ? (
              <>
                <p className="text-sm font-semibold text-suya-carbon">¿Ya realizaste el pago?</p>
                <p className="mt-1 text-xs text-suya-muted">
                  {intent.method === 'yape'
                    ? 'Escribe el código de seguridad de 3 dígitos que aparece en la notificación de Yape. Suya comprobará el código, monto, cuenta receptora y hora del abono.'
                    : 'Escribe el nombre que aparece en Lemon. Suya comprobará en el servidor que coincida con la notificación, el monto, la cuenta receptora y la hora del abono.'}
                </p>
                {intent.method === 'yape' ? (
                  <label className="mt-3 block text-xs font-semibold text-suya-carbon">
                    Código de seguridad Yape (3 dígitos)
                    <input
                      aria-label="Código de seguridad Yape"
                      value={confirmationCode}
                      onChange={(event) =>
                        setConfirmationCode(event.target.value.replace(/\D/g, '').slice(0, 3))
                      }
                      autoComplete="one-time-code"
                      inputMode="numeric"
                      maxLength={3}
                      pattern="[0-9]{3}"
                      placeholder="Ej. 482"
                      className="mt-1 h-11 w-full rounded-btn border border-suya-border bg-white px-3 text-sm font-normal outline-none focus:border-suya-green focus:ring-2 focus:ring-suya-green/20"
                      disabled={declarationBusy}
                    />
                  </label>
                ) : (
                  <label className="mt-3 block text-xs font-semibold text-suya-carbon">
                    Nombre del pagador en Lemon
                    <input
                      aria-label="Nombre del pagador en Lemon"
                      value={payerDisplayName}
                      onChange={(event) => setPayerDisplayName(event.target.value)}
                      autoComplete="name"
                      maxLength={120}
                      placeholder="Ej. Clara Elena Navarro Tocto"
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
                      Validando pago…
                    </>
                  ) : (
                    'Confirmar pago'
                  )}
                </Button>
              </>
            ) : (
              <>
                <p className="flex items-center gap-2 text-sm font-semibold text-suya-carbon">
                  {walletConfirmationStatus === 'pending' && (
                    <LoaderCircle
                      className="h-4 w-4 animate-spin text-suya-green"
                      aria-hidden="true"
                    />
                  )}
                  {walletConfirmationStatus === 'pending'
                    ? 'Validando pago…'
                    : walletConfirmationStatus === 'ambiguous'
                      ? 'Pago requiere revisión de Caja'
                      : 'Pago en revisión'}
                </p>
                <p className="mt-1 text-xs text-suya-muted">
                  {walletConfirmationStatus === 'pending'
                    ? intent.method === 'yape'
                      ? 'Estamos esperando la notificación de Yape y comparando código, monto y hora. No vuelvas a pagar.'
                      : 'Estamos esperando la notificación de Lemon y comparando nombre, monto y hora. No vuelvas a pagar.'
                    : 'No generes otra referencia. El restaurante conserva la evidencia y puede revisar el pago desde Suya Caja.'}
                </p>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
                  <label className="min-w-0 flex-1 text-xs font-semibold text-suya-carbon">
                    {intent.method === 'yape'
                      ? 'Código Yape (3 dígitos)'
                      : 'Código de constancia o referencia'}
                    <input
                      value={evidenceCode}
                      onChange={(event) =>
                        setEvidenceCode(
                          intent.method === 'yape'
                            ? event.target.value.replace(/\D/g, '').slice(0, 3)
                            : event.target.value,
                        )
                      }
                      autoComplete="one-time-code"
                      inputMode={intent.method === 'yape' ? 'numeric' : 'text'}
                      maxLength={intent.method === 'yape' ? 3 : 64}
                      placeholder={intent.method === 'yape' ? 'Ej. 384' : 'Ej. LM-123'}
                      className="mt-1 h-11 w-full rounded-btn border border-suya-border bg-white px-3 text-sm font-normal outline-none focus:border-suya-green focus:ring-2 focus:ring-suya-green/20"
                      disabled={submittingEvidence || evidenceSaved}
                    />
                  </label>
                  {intent.method !== 'yape' && (
                    <label className="min-w-0 flex-1 text-xs font-semibold text-suya-carbon">
                      Nombre del pagador (opcional)
                      <input
                        value={payerDisplayName}
                        onChange={(event) => setPayerDisplayName(event.target.value)}
                        autoComplete="name"
                        maxLength={120}
                        placeholder="Si pagó otra persona"
                        className="mt-1 h-11 w-full rounded-btn border border-suya-border bg-white px-3 text-sm font-normal outline-none focus:border-suya-green focus:ring-2 focus:ring-suya-green/20"
                        disabled={submittingEvidence}
                      />
                    </label>
                  )}
                  {evidenceSaved ? (
                    <Button type="button" variant="secondary" size="sm" onClick={editEvidence}>
                      Cambiar código
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => void saveEvidence()}
                      disabled={
                        submittingEvidence ||
                        (intent.method === 'yape'
                          ? !/^\d{3}$/.test(evidenceCode.trim())
                          : !evidenceCode.trim() && !payerDisplayName.trim())
                      }
                    >
                      {submittingEvidence
                        ? 'Guardando…'
                        : intent.method === 'yape' || evidenceCode.trim()
                          ? 'Vincular código'
                          : 'Guardar pagador'}
                    </Button>
                  )}
                </div>
                {evidenceSaved && (
                  <p className="mt-2 text-xs font-semibold text-suya-green-dark">
                    Código vinculado. Puedes cambiarlo mientras el pago siga pendiente.
                  </p>
                )}
              </>
            )}
          </div>
        )}

      <div className="mt-4 flex items-start gap-2 border-t border-black/10 pt-3 text-xs text-suya-muted">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-suya-green" aria-hidden="true" />
        <p>
          {paymentRefunded
            ? 'Este pago fue devuelto y no debe repetirse desde esta referencia.'
            : intent.provider === 'culqi'
              ? 'El servidor confirma el pago. Suya conserva la referencia del pedido y no libera por una notificación local.'
              : intent.method === 'yape'
                ? 'Suya valida en el servidor el código, monto, cuenta receptora y hora contra la notificación de Yape. Si no hay una coincidencia exacta, Caja debe revisar el abono.'
                : 'Suya valida en el servidor el nombre, monto, cuenta receptora y hora contra la notificación de Lemon. Si no hay una coincidencia exacta, Caja debe revisar el abono.'}
        </p>
      </div>
    </Card>
  );
}
