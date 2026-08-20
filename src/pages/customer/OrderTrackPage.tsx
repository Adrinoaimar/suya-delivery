import { useEffect, useState } from 'react';
import { ArrowLeft, MapPin, XCircle } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { Badge } from '@/components/common/Badge';
import { Button, ButtonLink } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { Skeleton } from '@/components/common/Skeleton';
import { ExpandableSheet } from '@/components/common/BottomSheet';
import { CodeDialog } from '@/components/order/CodeDialog';
import { OrderCodes } from '@/components/order/OrderCodes';
import { TrackingTimeline } from '@/components/order/TrackingTimeline';
import { MapProvider } from '@/components/map/MapProvider';
import { notificationService, safetyOperationsService } from '@/lib/services';
import { useOrderStore } from '@/store/orderStore';
import { orderRouteProgress, useOrderStatusNotifier } from '@/hooks/useOrders';
import { useIsDesktop } from '@/hooks/useMediaQuery';
import { formatPrice, orderStatusLabel } from '@/utils/format';
import type { LatLng } from '@/types';

export default function OrderTrackPage() {
  const { id = '' } = useParams();
  const order = useOrderStore((state) => state.getOrder(id));
  const status = useOrderStore((state) => state.status);
  const error = useOrderStore((state) => state.error);
  const refresh = useOrderStore((state) => state.refresh);
  const cancelOrder = useOrderStore((state) => state.cancelOrder);
  const [expanded, setExpanded] = useState(true);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [riderPosition, setRiderPosition] = useState<LatLng | null>(null);
  const isDesktop = useIsDesktop();

  const progress = orderRouteProgress(order);
  useOrderStatusNotifier(order);

  useEffect(() => {
    if (!order?.riderId || !['picked_up', 'on_the_way'].includes(order.status)) {
      setRiderPosition(null);
      return undefined;
    }
    let active = true;
    void safetyOperationsService.latestLocation(order.id)
      .then((position) => { if (active) setRiderPosition(position); })
      .catch(() => undefined);
    const unsubscribe = safetyOperationsService.subscribeLocation(order.id, (position) => {
      if (active) setRiderPosition(position);
    });
    return () => { active = false; unsubscribe(); };
  }, [order?.id, order?.riderId, order?.status]);

  if (!order) {
    if (status === 'idle' || status === 'loading') {
      return (
        <div className="shell space-y-3 py-10" role="status" aria-busy="true">
          <span className="sr-only">Cargando seguimiento…</span>
          <Skeleton className="h-72 w-full rounded-card" />
          <Skeleton className="h-32 w-full rounded-card" />
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
          icon={<MapPin className="h-6 w-6" />}
          title="No encontramos este pedido"
          action={<ButtonLink to="/orders">Ver mis pedidos</ButtonLink>}
        />
      </div>
    );
  }

  const mapReady = order.storePosition !== null && order.deliveryPosition !== null;
  const mapPoints = mapReady ? [order.storePosition!, order.deliveryPosition!] : [];
  const delivered = order.status === 'delivered';
  const cancelled = order.status === 'cancelled';
  const etaMinutes = Math.max(1, Math.round(order.etaMinutes * (1 - progress)));
  const etaLabel = delivered
    ? 'Pedido entregado'
    : cancelled
      ? 'Pedido cancelado'
      : `${Math.max(1, etaMinutes - 6)}–${etaMinutes} min`;

  const summary = (
    <span className="flex flex-col">
      <span className="font-display text-[15px] font-bold">{orderStatusLabel(order.status)}</span>
      <span className="text-sm text-[#6B7076]">
        {delivered || cancelled ? order.storeName : `Llega en ${etaLabel}`}
      </span>
    </span>
  );

  const detail = (
    <div className="space-y-4">
      <OrderCodes order={order} />

      <TrackingTimeline order={order} compact />

      {order.riderId && !cancelled && (
        <p className="rounded-card border border-suya-mist p-3 text-sm text-[#4A4F55]">
          Repartidor asignado. Su ubicación aparecerá cuando recoja el pedido y comparta GPS.
        </p>
      )}

      <div className="rounded-card border border-suya-mist p-3">
        <p className="font-display text-[15px] font-bold">{order.storeName}</p>
        <p className="text-sm text-[#6B7076]">
          #{order.code} · {order.items.length} {order.items.length === 1 ? 'producto' : 'productos'}
        </p>
        <ul className="mt-2 space-y-1 text-sm text-[#4A4F55]">
          {order.items.map((item) => (
            <li key={item.lineId}>
              {item.quantity} × {item.name}
            </li>
          ))}
        </ul>
        <p className="mt-2 flex justify-between border-t border-suya-mist pt-2 font-display font-bold">
          Total <span>{formatPrice(order.total)}</span>
        </p>
      </div>

      <div className="rounded-card border border-suya-mist p-3">
        <p className="text-sm font-semibold">Entregar en</p>
        <p className="text-sm text-[#6B7076]">{order.customer.address}</p>
        {order.customer.reference && (
          <p className="text-sm text-[#6B7076]">Referencia: {order.customer.reference}</p>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {!delivered && !cancelled && (
          <Button variant="ghost" size="sm" onClick={() => setConfirmCancel(true)}>
            <XCircle className="h-4 w-4" aria-hidden="true" />
            Cancelar pedido
          </Button>
        )}
        <ButtonLink to={`/orders/${order.id}`} variant="ghost" size="sm">
          Ver detalle
        </ButtonLink>
      </div>

    </div>
  );

  return (
    <>
      {/* Se monta un solo mapa: dos instancias de Leaflet a la vez duplicarían los tiles. */}
      {!isDesktop && (
      <div className="flex h-[calc(100dvh-var(--header-h)-var(--bottom-nav-h))] flex-col lg:hidden">
        <div className="relative h-[45%] shrink-0 overflow-hidden bg-suya-ivory">
          {mapReady ? <MapProvider
            points={mapPoints}
            origin={{ ...order.storePosition!, label: order.storeName }}
            destination={{ ...order.deliveryPosition!, label: 'Punto de entrega' }}
            rider={cancelled ? null : riderPosition}
            label={`Ubicaciones del pedido ${order.code}`}
          /> : <MapUnavailable />}
          <Link
            to="/orders"
            aria-label="Volver a mis pedidos"
            className="press absolute left-3 top-3 flex h-11 w-11 items-center justify-center rounded-full bg-white/95 shadow-card"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <Badge tone="green" className="absolute right-3 top-3 shadow-card">
            {etaLabel}
          </Badge>
        </div>
        <ExpandableSheet
          title="Resumen del pedido"
          expanded={expanded}
          onToggle={() => setExpanded((value) => !value)}
          summary={summary}
          className="-mt-4 flex-1 overflow-hidden"
        >
          {detail}
        </ExpandableSheet>
      </div>
      )}

      {/* Escritorio: panel + mapa */}
      {isDesktop && (
      <div className="hidden lg:block">
        <div className="shell grid grid-cols-[380px_1fr] gap-5 py-8">
          <div className="space-y-4">
            <Link
              to="/orders"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-[#6B7076] hover:text-suya-green"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Mis pedidos
            </Link>
            <div>
              <h1 className="section-title">{orderStatusLabel(order.status)}</h1>
              <p className="text-sm text-[#6B7076]">
                {delivered || cancelled ? order.storeName : `Llega en ${etaLabel}`}
              </p>
            </div>
            <Card>{detail}</Card>
          </div>
          <div className="sticky top-24 h-[calc(100dvh-140px)] overflow-hidden rounded-card border border-suya-mist bg-white">
            {mapReady ? <MapProvider
              points={mapPoints}
              origin={{ ...order.storePosition!, label: order.storeName }}
              destination={{ ...order.deliveryPosition!, label: 'Punto de entrega' }}
              rider={cancelled ? null : riderPosition}
              label={`Ubicaciones del pedido ${order.code}`}
            /> : <MapUnavailable />}
          </div>
        </div>
      </div>
      )}

      <CodeDialog
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        title="¿Cancelar el pedido?"
        description="Escribe tu código de cancelación para confirmar."
        helper={`Lo encuentras arriba, en «Código para cancelar» (pedido #${order.code}).`}
        confirmLabel="Cancelar pedido"
        tone="danger"
        onSubmit={(code) => cancelOrder(order.id, code)}
        onSuccess={() => notificationService.notify('Pedido cancelado', 'info')}
      />
    </>
  );
}

function MapUnavailable() {
  return (
    <div className="flex h-full items-center justify-center bg-suya-ivory p-6 text-center text-sm text-[#6B7076]" role="status">
      Este pedido no tiene ambos puntos verificados. Usa dirección y referencia para coordinar.
    </div>
  );
}
