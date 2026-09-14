import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Copy, ExternalLink, LoaderCircle, QrCode, ShieldCheck } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Badge } from '@/components/common/Badge';
import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { notificationService, paymentService } from '@/lib/services';
import { openCulqiCheckout } from '@/lib/payments/culqiCheckout';
import type { Order, PaymentIntent } from '@/types';
import { formatDateTime, formatPrice, paymentLabel } from '@/utils/format';

interface PaymentInstructionsProps {
  order: Pick<Order, 'id' | 'code' | 'total' | 'paymentMethod' | 'paymentIntent'>;
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
  const [intent, setIntent] = useState<PaymentIntent | null>(order.paymentIntent ?? null);
  const [loading, setLoading] = useState(!order.paymentIntent);
  const [error, setError] = useState<string | null>(null);
  const [evidenceCode, setEvidenceCode] = useState('');
  const [submittingEvidence, setSubmittingEvidence] = useState(false);
  const [evidenceSaved, setEvidenceSaved] = useState(false);
  const [gatewayBusy, setGatewayBusy] = useState(false);
  const [gatewayAwaitingWebhook, setGatewayAwaitingWebhook] = useState(false);
  const [manualBusy, setManualBusy] = useState(false);
  const gatewayTokenBusyRef = useRef(false);

  useEffect(() => {
    if (order.paymentMethod === 'cash' || order.paymentIntent) return;
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
  }, [order.id, order.paymentIntent, order.paymentMethod]);

  useEffect(() => {
    if (!order.paymentIntent) return;
    setIntent(order.paymentIntent);
    setError(null);
    setLoading(false);
  }, [order.paymentIntent]);

  useEffect(() => {
    if (intent?.status !== 'pending') return;
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
  }, [intent?.status, order.id]);

  useEffect(() => {
    if (!intent || intent.status !== 'pending' || isExpired(intent)) {
      setGatewayAwaitingWebhook(false);
    }
  }, [intent]);

  const gatewayStatus = intent?.status;

  if (order.paymentMethod === 'cash') return null;
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
  const gatewayExpired = isExpired(intent);
  const gatewayWaitingForWebhook =
    gatewayAwaitingWebhook && intent.status === 'pending' && !gatewayExpired;
  const copyReference = async () => {
    try {
      await navigator.clipboard.writeText(intent.checkoutReference);
      notificationService.notify('Referencia copiada.', 'success');
    } catch {
      notificationService.notify('No pudimos copiarla; escríbela manualmente.', 'warning');
    }
  };

  const saveEvidence = async () => {
    if (!evidenceCode.trim()) {
      notificationService.notify('Escribe el código de seguridad u operación de la constancia.', 'warning');
      return;
    }
    setSubmittingEvidence(true);
    try {
      const saved = await paymentService.submitEvidence(order.id, evidenceCode);
      if (!saved) throw new Error('No pudimos vincular la constancia al pedido.');
      setEvidenceCode('');
      setEvidenceSaved(true);
      notificationService.notify('Código guardado. Caja podrá identificar este pago.', 'success');
    } catch (cause) {
      notificationService.notify(
        cause instanceof Error ? cause.message : 'No pudimos guardar el código.',
        'danger',
      );
    } finally {
      setSubmittingEvidence(false);
    }
  };

  const renewManualIntent = async () => {
    if (manualBusy || intent.provider === 'culqi') return;
    setManualBusy(true);
    try {
      const refreshed = await paymentService.createIntent(order.id, intent.method);
      setIntent(refreshed);
      setEvidenceCode('');
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

  const openGateway = async () => {
    if (gatewayBusy || gatewayWaitingForWebhook || verified) return;
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
      setIntent(activeIntent);
      await openCulqiCheckout({
        intent: activeIntent,
        method: activeIntent.method === 'card' ? 'card' : 'yape',
        customerEmail,
        onToken: async (tokenId) => {
          // Custom Checkout abre un modal no bloqueante. El callback puede
          // llegar después de que openCulqiCheckout() haya retornado.
          gatewayTokenBusyRef.current = true;
          setGatewayBusy(true);
          try {
            const providerReference = await paymentService.chargeCard(
              activeIntent,
              tokenId,
              customerEmail,
            );
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
            gatewayTokenBusyRef.current = false;
            setGatewayBusy(false);
          }
        },
        onOrder: () => {
          setGatewayBusy(false);
          setGatewayAwaitingWebhook(true);
          notificationService.notify(
            'Pago enviado. Culqi confirmará el monto mediante webhook; esta pantalla se actualizará sola.',
            'success',
          );
        },
        onError: (message) => {
          setGatewayBusy(false);
          setGatewayAwaitingWebhook(false);
          notificationService.notify(message, 'danger');
        },
      });
      // Culqi.open() no espera a que el usuario cierre el modal. Liberamos el
      // estado de apertura para no dejar la pantalla bloqueada si lo cancela;
      // onToken vuelve a marcarlo ocupado durante el cobro.
      if (!gatewayTokenBusyRef.current) setGatewayBusy(false);
    } catch (cause) {
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
              Paga con {paymentLabel(intent.method)}
            </h2>
            <p className="mt-1 text-sm text-suya-muted">
              Monto exacto: <strong>{formatPrice(intent.amount)}</strong>
            </p>
          </div>
        </div>
        <Badge tone={verified ? 'lime' : 'sun'}>{statusLabel(intent.status, gatewayExpired)}</Badge>
      </div>

      {intent.provider === 'culqi' ? (
        <div className="mt-4 rounded-card border border-suya-green/20 bg-white p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-suya-lime-soft text-suya-green">
                <QrCode className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <p className="font-semibold text-suya-carbon">Checkout seguro de Culqi</p>
                <p className="mt-1 text-sm text-suya-muted">
                  Genera un QR de billetera (Yape) o captura tarjeta con el monto exacto de este pedido.
                </p>
              </div>
            </div>
            <Button
              type="button"
              onClick={() => void openGateway()}
              disabled={gatewayBusy || gatewayWaitingForWebhook || verified}
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
              <img src={intent.qrPayload} alt="QR Yape generado para este pedido" className="h-44 w-44" />
            </div>
          )}
          <p className="mt-3 text-xs text-suya-muted">
            Referencia Culqi: <span className="font-mono">{intent.providerReference ?? 'pendiente'}</span>
          </p>
        </div>
      ) : intent.qrPayload ? (
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
            <p className="mt-2 text-xs">
              Este QR identifica al negocio; el monto se valida en Suya contra el pedido.
            </p>
          </div>
        </div>
      ) : (
        <div className="mt-4 rounded-btn border border-suya-sun/60 bg-white/70 p-3 text-sm text-suya-carbon">
          El negocio aún no configuró su QR público. Abre {paymentLabel(intent.method)}, paga
          exactamente el monto indicado y conserva la constancia.
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

      {intent.provider !== 'culqi' && (gatewayExpired || intent.status === 'failed') && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-btn border border-suya-sun/60 bg-white/80 p-3">
          <p className="text-sm text-suya-carbon">
            Esta referencia ya no acepta pagos. Genera otra antes de pagar.
          </p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => void renewManualIntent()}
            disabled={manualBusy}
          >
            {manualBusy ? 'Generando…' : 'Generar nueva referencia'}
          </Button>
        </div>
      )}

      {!verified && intent.provider !== 'culqi' && (intent.method === 'yape' || intent.method === 'lemon') && (
        <div className="mt-4 rounded-btn border border-suya-green/20 bg-white/75 p-3">
          <p className="text-sm font-semibold text-suya-carbon">
            Identifica tu pago antes de cerrar esta pantalla
          </p>
          <p className="mt-1 text-xs text-suya-muted">
            Después de pagar, escribe el código de seguridad u operación que aparece en tu
            constancia. Suya guarda un hash no reversible y solo muestra sus últimos cuatro
            caracteres; así un pago de S/30 no se confunde con otro pago de S/30.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
            <label className="min-w-0 flex-1 text-xs font-semibold text-suya-carbon">
              Código de constancia
              <input
                value={evidenceCode}
                onChange={(event) => setEvidenceCode(event.target.value)}
                autoComplete="one-time-code"
                inputMode="text"
                maxLength={64}
                placeholder="Ej. 384"
                className="mt-1 h-11 w-full rounded-btn border border-suya-border bg-white px-3 text-sm font-normal outline-none focus:border-suya-green focus:ring-2 focus:ring-suya-green/20"
                disabled={submittingEvidence || evidenceSaved}
              />
            </label>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => void saveEvidence()}
              disabled={submittingEvidence || evidenceSaved || !evidenceCode.trim()}
            >
              {submittingEvidence ? 'Guardando…' : evidenceSaved ? 'Código vinculado' : 'Vincular código'}
            </Button>
          </div>
        </div>
      )}

      <div className="mt-4 flex items-start gap-2 border-t border-black/10 pt-3 text-xs text-suya-muted">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-suya-green" aria-hidden="true" />
        <p>
          {intent.provider === 'culqi'
            ? 'Culqi confirma el pago por webhook. Suya conserva la referencia del pedido y no libera por una notificación local.'
            : 'La notificación del celular de caja solo es evidencia. El restaurante debe verificar monto, billetera, hora y referencia antes de liberar el pedido.'}
        </p>
      </div>
    </Card>
  );
}
