import { useCallback, useEffect } from 'react';
import { ArrowLeft, Receipt } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { Badge } from '@/components/common/Badge';
import { ButtonLink } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { Skeleton } from '@/components/common/Skeleton';
import { CartLine } from '@/components/order/CartLine';
import { OrderCodes } from '@/components/order/OrderCodes';
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
    </div>
  );
}
