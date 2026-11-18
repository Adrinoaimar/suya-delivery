import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Receipt } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { Badge } from '@/components/common/Badge';
import { Button, ButtonLink } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { Modal } from '@/components/common/Modal';
import { Skeleton } from '@/components/common/Skeleton';
import { CartLine } from '@/components/order/CartLine';
import { OrderCodes } from '@/components/order/OrderCodes';
import { OrderTrackingPanel } from '@/components/order/OrderTrackingPanel';
import { PaymentInstructions } from '@/components/payment/PaymentInstructions';
import { useOrderStore } from '@/store/orderStore';
import {
  formatPrice,
  orderStatusLabel,
  paymentLabel,
} from '@/utils/format';

export default function OrderDetailPage() {
  const { id = '' } = useParams();
  const order = useOrderStore((state) => state.getOrder(id));
  const status = useOrderStore((state) => state.status);
  const error = useOrderStore((state) => state.error);
  const refresh = useOrderStore((state) => state.refresh);
  const refreshOrder = useOrderStore((state) => state.refreshOrder);
  const cancelOrder = useOrderStore((state) => state.cancelOrder);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState('');
  const refreshCurrentOrder = useCallback(() => {
    void refreshOrder(id);
  }, [id, refreshOrder]);

  useEffect(() => {
    void refreshOrder(id);
  }, [id, refreshOrder]);

  if (!order) {
    if (status === 'idle' || status === 'loading') {
      return (
        <div className="shell space-y-3 py-10" role="status" aria-busy="true">
          <span className="sr-only">Cargando pedido…</span>
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-40 w-full rounded-card" />
        </div>
      );
    }
    if (status === 'error') {
      return (
        <div className="shell py-10">
          <ErrorState description={error ?? undefined} onRetry={() => void refresh()} />
        </div>
      );
    }
    return (
      <div className="shell py-10">
        <EmptyState
          icon={<Receipt className="h-6 w-6" />}
          title="No encontramos este pedido"
          description="Verifica el enlace o vuelve a tu historial de pedidos."
          action={<ButtonLink to="/orders">Ver mis pedidos</ButtonLink>}
        />
      </div>
    );
  }

  const paymentAccepted = order.paymentMethod === 'cash' || order.paymentIntent?.status === 'authorized';
  const canShowDeliveryCode = paymentAccepted && Boolean(order.deliveryCode) && (
    order.status === 'confirmed' ||
    order.status === 'preparing' ||
    order.status === 'picked_up' ||
    order.status === 'on_the_way' ||
    order.status === 'delivered'
  );
  const visibleStatus =
    order.status === 'pending_payment' ||
    (order.status === 'confirmed' && !paymentAccepted)
      ? 'pending_payment'
      : order.status;
  const canCancel = Boolean(order.cancelCode) && !['cancelled', 'delivered', 'picked_up', 'on_the_way'].includes(order.status)
    && (order.paymentMethod === 'cash' || (!paymentAccepted && visibleStatus === 'pending_payment'));

  async function confirmCancellation() {
    if (!order || !canCancel || cancelling) return;
    setCancelling(true);
    setCancelError('');
    try {
      const result = await cancelOrder(order.id, order.cancelCode);
      if (result.ok) setCancelOpen(false);
      else setCancelError('No pudimos cancelar este pedido. Revisa su estado actualizado.');
      await refreshOrder(id);
    } catch {
      setCancelError('No pudimos cancelar ahora. Actualiza el pedido y vuelve a intentarlo.');
    } finally {
      setCancelling(false);
    }
  }

  return (
    <div className="shell space-y-4 py-4 lg:py-8">
      <Link
        to="/orders"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-[#6B7076] hover:text-suya-green"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Mis pedidos
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="section-title">{order.storeName}</h1>
        </div>
        <Badge
          tone={
            visibleStatus === 'cancelled'
              ? 'danger'
              : visibleStatus === 'pending_payment'
                ? 'sun'
                : 'lime'
          }
        >
          {orderStatusLabel(visibleStatus)}
        </Badge>
      </div>

      <OrderTrackingPanel order={{ ...order, status: visibleStatus }} />

      <div className="grid gap-4 lg:grid-cols-[1fr_340px] lg:items-start">
        <div className="space-y-4">
          {canShowDeliveryCode && <OrderCodes order={order} />}
          <PaymentInstructions
            order={order}
            onPartialPaymentCancelled={refreshCurrentOrder}
            onPaymentAccepted={refreshCurrentOrder}
          />

          <Card padded={false}>
            <h2 className="border-b border-suya-mist px-4 py-3 font-display text-[15px] font-bold">
              Productos
            </h2>
            <div className="divide-y divide-suya-mist px-4">
              {order.items.map((item) => (
                <CartLine
                  key={item.lineId}
                  item={item}
                  readOnly
                  onIncrement={() => undefined}
                  onDecrement={() => undefined}
                />
              ))}
            </div>
          </Card>
        </div>

        <div className="space-y-3">
          <Card>
            <h2 className="mb-3 font-display text-[15px] font-bold">Entrega</h2>
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-[#6B7076]">Dirección</dt>
                <dd className="font-medium">{order.customer.address}</dd>
              </div>
              {order.customer.reference && (
                <div>
                  <dt className="text-[#6B7076]">Referencia</dt>
                  <dd className="font-medium">{order.customer.reference}</dd>
                </div>
              )}
              <div>
                <dt className="text-[#6B7076]">Contacto</dt>
                <dd className="font-medium">
                  {order.customer.name} · {order.customer.phone}
                </dd>
              </div>
              <div>
                <dt className="text-[#6B7076]">Pago</dt>
                <dd className="font-medium">{paymentLabel(order.paymentMethod)}</dd>
              </div>
            </dl>
          </Card>

          <Card>
            <h2 className="mb-3 font-display text-[15px] font-bold">Resumen</h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-[#6B7076]">Subtotal</dt>
                <dd className="font-medium">{formatPrice(order.subtotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[#6B7076]">Envío</dt>
                <dd className="font-medium">{formatPrice(order.deliveryFee)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[#6B7076]">Descuento</dt>
                <dd className="font-medium">
                  {order.discount > 0 ? `− ${formatPrice(order.discount)}` : formatPrice(0)}
                </dd>
              </div>
              <div className="flex justify-between border-t border-suya-mist pt-2.5 text-base">
                <dt className="font-display font-bold">Total</dt>
                <dd className="font-display font-bold">{formatPrice(order.total)}</dd>
              </div>
            </dl>
          </Card>
        </div>
      </div>

      {canCancel && (
        <div className="flex justify-center border-t border-suya-border pt-4 sm:justify-end">
          <button type="button" onClick={() => { setCancelOpen(true); setCancelError(''); }}
            className="press min-h-11 rounded-btn px-4 text-sm font-semibold text-suya-danger hover:bg-suya-danger-soft">
            Cancelar pedido
          </button>
        </div>
      )}
      <Modal open={cancelOpen} onClose={() => { if (!cancelling) setCancelOpen(false); }}
        title="¿Cancelar este pedido?" initialFocusSelector="[data-keep-order]"
        description={order.paymentMethod !== 'cash'
          ? 'Si ya pagaste o acabas de enviar el abono, conserva el pedido y verifica el pago primero.'
          : 'Esto avisará al negocio que ya no necesitas el pedido.'}
        footer={<div className="flex flex-wrap gap-2">
          <Button data-keep-order variant="secondary" disabled={cancelling} onClick={() => setCancelOpen(false)}>Conservar pedido</Button>
          <Button variant="danger" disabled={cancelling || !canCancel} onClick={() => void confirmCancellation()}>
            {cancelling ? 'Cancelando…' : 'Sí, cancelar'}
          </Button>
        </div>}>
        {cancelError && <p role="alert" className="text-sm text-suya-danger">{cancelError}</p>}
      </Modal>
    </div>
  );
}
