import { useEffect, useState } from 'react';
import { CheckCircle2, Copy, LoaderCircle, QrCode, ShieldCheck } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Badge } from '@/components/common/Badge';
import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { notificationService, paymentService } from '@/lib/services';
import type { Order, PaymentIntent } from '@/types';
import { formatDateTime, formatPrice, paymentLabel } from '@/utils/format';

interface PaymentInstructionsProps {
  order: Pick<Order, 'id' | 'code' | 'total' | 'paymentMethod' | 'paymentIntent'>;
}

function statusLabel(status: PaymentIntent['status']): string {
  if (status === 'authorized') return 'Pago verificado';
  if (status === 'failed') return 'Pago rechazado';
  if (status === 'refunded') return 'Pago devuelto';
  return 'Pendiente de verificación';
}

export function PaymentInstructions({ order }: PaymentInstructionsProps) {
  const [intent, setIntent] = useState<PaymentIntent | null>(order.paymentIntent ?? null);
  const [loading, setLoading] = useState(!order.paymentIntent);
  const [error, setError] = useState<string | null>(null);

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
  const copyReference = async () => {
    try {
      await navigator.clipboard.writeText(intent.checkoutReference);
      notificationService.notify('Referencia copiada.', 'success');
    } catch {
      notificationService.notify('No pudimos copiarla; escríbela manualmente.', 'warning');
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
        <Badge tone={verified ? 'lime' : 'sun'}>{statusLabel(intent.status)}</Badge>
      </div>

      {intent.qrPayload ? (
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

      <div className="mt-4 flex items-start gap-2 border-t border-black/10 pt-3 text-xs text-suya-muted">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-suya-green" aria-hidden="true" />
        <p>
          La notificación del celular de caja solo es evidencia. El restaurante debe verificar
          monto, billetera, hora y referencia antes de liberar el pedido.
        </p>
      </div>
    </Card>
  );
}
