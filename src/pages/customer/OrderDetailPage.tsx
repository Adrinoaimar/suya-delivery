import { ArrowLeft, Receipt } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { Badge } from '@/components/common/Badge';
import { ButtonLink } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { EmptyState } from '@/components/common/EmptyState';
import { CartLine } from '@/components/order/CartLine';
import { OrderCodes } from '@/components/order/OrderCodes';
import { TrackingTimeline } from '@/components/order/TrackingTimeline';
import { RiderCard } from '@/components/rider/RiderCard';
import { riders } from '@/data';
import { useOrderStore } from '@/store/orderStore';
import { formatDateTime, formatPrice, orderStatusLabel, paymentLabel } from '@/utils/format';

export default function OrderDetailPage() {
  const { id = '' } = useParams();
  const order = useOrderStore((state) => state.getOrder(id));
  const rider = riders.find((item) => item.id === order?.riderId);

  if (!order) {
    return (
      <div className="shell py-10">
        <EmptyState
          icon={<Receipt className="h-6 w-6" />}
          title="No encontramos este pedido"
          description="Puede que se haya borrado al reiniciar los datos de la demo."
          action={<ButtonLink to="/orders">Ver mis pedidos</ButtonLink>}
        />
      </div>
    );
  }

  const isActive = order.status !== 'delivered' && order.status !== 'cancelled';

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
          <p className="text-sm text-[#6B7076]">
            #{order.code} · {formatDateTime(order.createdAt)}
          </p>
        </div>
        <Badge tone={order.status === 'cancelled' ? 'danger' : 'lime'}>
          {orderStatusLabel(order.status)}
        </Badge>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_340px] lg:items-start">
        <div className="space-y-4">
          {isActive && <OrderCodes order={order} />}

          <Card>
            <h2 className="mb-3 font-display text-[15px] font-bold">Seguimiento</h2>
            <TrackingTimeline order={order} />
            {isActive && (
              <ButtonLink to={`/orders/${order.id}/track`} className="mt-4" fullWidth>
                Ver en el mapa
              </ButtonLink>
            )}
          </Card>

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
          {rider && (
            <Card>
              <h2 className="mb-3 font-display text-[15px] font-bold">Repartidor</h2>
              <RiderCard rider={rider} />
            </Card>
          )}

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
