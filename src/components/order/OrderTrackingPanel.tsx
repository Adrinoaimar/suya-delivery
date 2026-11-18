import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, MapPin, Radio, Store } from 'lucide-react';
import { cn } from '@/lib/cn';
import { MapUnavailable } from '@/components/map/MapUnavailable';
import { MapProvider } from '@/components/map/MapProvider';
import { TrackingTimeline } from '@/components/order/TrackingTimeline';
import { safetyOperationsService } from '@/lib/services';
import { appendTrail, mergeTrails } from '@/utils/locationTrail';
import { orderStatusLabel } from '@/utils/format';
import type { Order, OrderStatus, LatLng, RiderLocationPoint } from '@/types';
import { ORDER_FLOW } from '@/types';

const TRACKING_STATUSES = new Set<OrderStatus>(['picked_up', 'on_the_way']);
const RECENT_SIGNAL_MS = 90_000;
const MAP_STATUSES = new Set<OrderStatus>(['confirmed', 'preparing', 'picked_up', 'on_the_way']);

function statusMessage(status: OrderStatus): string {
  const messages: Partial<Record<OrderStatus, string>> = {
    confirmed: 'El negocio recibió tu pedido.',
    preparing: 'El negocio está preparando tu pedido.',
    picked_up: 'El repartidor recogió tu pedido.',
    on_the_way: 'Tu pedido está en camino.',
    delivered: 'Tu pedido fue entregado.',
  };
  return messages[status] ?? orderStatusLabel(status);
}

interface OrderTrackingPanelProps {
  order: Order;
}

export function OrderTrackingPanel({ order }: OrderTrackingPanelProps) {
  return <TrackingView key={JSON.stringify([order.id, order.riderId])} order={order} />;
}

function TrackingView({ order }: OrderTrackingPanelProps) {
  const [rider, setRider] = useState<RiderLocationPoint | null>(null);
  const newestTime = useRef(0);
  const [clock, setClock] = useState(Date.now);
  const timestamp = rider?.capturedAt ? Date.parse(rider.capturedAt) : 0;
  const recent = timestamp > 0 && timestamp + RECENT_SIGNAL_MS > clock;
  useEffect(() => {
    if (!timestamp) return;
    const update = () => setClock(Date.now());
    update();
    const timeout = window.setTimeout(
      update,
      Math.max(0, timestamp + RECENT_SIGNAL_MS - Date.now()) + 1,
    );
    document.addEventListener('visibilitychange', update);
    return () => {
      window.clearTimeout(timeout);
      document.removeEventListener('visibilitychange', update);
    };
  }, [timestamp]);
  const [riderTrail, setRiderTrail] = useState<LatLng[]>([]);
  const [locationState, setLocationState] = useState<'idle' | 'loading' | 'ready' | 'error'>(
    'idle',
  );
  const [retryCount, setRetryCount] = useState(0);
  const paymentAccepted =
    order.paymentMethod === 'cash' || order.paymentIntent?.status === 'authorized';
  const visibleOrder =
    paymentAccepted &&
    order.origin !== 'table_qr' &&
    order.status !== 'cancelled' &&
    order.status !== 'pending_payment';
  const canShowMap = visibleOrder && MAP_STATUSES.has(order.status);
  const canReadRiderLocation =
    canShowMap && Boolean(order.riderId) && TRACKING_STATUSES.has(order.status);

  useEffect(() => {
    if (!canReadRiderLocation) {
      setRider(null);
      setRiderTrail([]);
      newestTime.current = 0;
      setLocationState('idle');
      return undefined;
    }

    let mounted = true;
    setLocationState('loading');
    const unsubscribe = safetyOperationsService.subscribeLocation(order.id, (position) => {
      if (!mounted) return;
      const time = position.capturedAt ? Date.parse(position.capturedAt) : 0;
      if (time < newestTime.current) return;
      newestTime.current = time;
      setRider(position);
      setRiderTrail((trail) => appendTrail(trail, position));
      setLocationState('ready');
    });

    let refreshId = 0;
    function refreshLocation() {
      if (document.hidden) return;
      const request = ++refreshId;
      void safetyOperationsService
        .locationHistory(order.id)
        .then((history) => {
          if (!mounted || request !== refreshId) return;
          const latest = history.at(-1) ?? null;
          const time = latest?.capturedAt ? Date.parse(latest.capturedAt) : 0;
          if (latest && time > newestTime.current) {
            newestTime.current = time;
            setRider(latest);
            setRiderTrail(mergeTrails(history, []));
          } else if (latest) {
            setRider((current) => current ?? latest);
            setRiderTrail((current) =>
              mergeTrails(
                history,
                current.filter(
                  (point: RiderLocationPoint) =>
                    !point.capturedAt || Date.parse(point.capturedAt) > time,
                ),
              ),
            );
          }
          setLocationState('ready');
        })
        .catch(() => {
          if (mounted && request === refreshId) setLocationState('error');
        });
    }
    refreshLocation();
    const recovery = window.setInterval(() => {
      if (navigator.onLine && Date.now() - newestTime.current >= RECENT_SIGNAL_MS) refreshLocation();
    }, 45_000);
    window.addEventListener('online', refreshLocation);
    document.addEventListener('visibilitychange', refreshLocation);
    return () => {
      window.clearInterval(recovery);
      window.removeEventListener('online', refreshLocation);
      document.removeEventListener('visibilitychange', refreshLocation);
      mounted = false;
      unsubscribe();
    };
  }, [canReadRiderLocation, order.id, retryCount]);

  const points = useMemo(
    () =>
      [order.storePosition, order.deliveryPosition, canReadRiderLocation ? rider : null].filter(
        (point): point is LatLng => point != null,
      ),
    [order.deliveryPosition, order.storePosition, rider, canReadRiderLocation],
  );
  const origin = useMemo(
    () => (order.storePosition ? { ...order.storePosition, label: order.storeName } : undefined),
    [order.storeName, order.storePosition],
  );
  const destination = useMemo(
    () =>
      order.deliveryPosition ? { ...order.deliveryPosition, label: 'Tu dirección' } : undefined,
    [order.deliveryPosition],
  );

  if (!visibleOrder) return null;

  const tracking = TRACKING_STATUSES.has(order.status);
  const live = Boolean(rider && canReadRiderLocation && recent && locationState !== 'error');
  const signal = tracking
    ? rider && canReadRiderLocation
      ? live
        ? 'Señal GPS reciente del repartidor'
        : timestamp
          ? `Última ubicación recibida a las ${new Date(timestamp).toLocaleTimeString('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit' })}`
          : 'Última ubicación recibida'
      : locationState === 'error'
        ? 'No pudimos cargar la ubicación del repartidor.'
        : 'Esperando la primera ubicación GPS del repartidor.'
    : 'El mapa mostrará la ubicación del repartidor cuando recoja tu pedido.';
  const step = ORDER_FLOW.indexOf(order.status);
  const final = order.status === 'delivered';

  return (
    <section className="overflow-hidden rounded-[24px] border border-suya-border bg-white" aria-label="Seguimiento del pedido">
      <header className="flex items-center justify-between gap-4 px-4 pb-4 pt-5 sm:px-6 sm:pt-6">
        <div className="min-w-0">
          <h2 className="text-xs font-semibold text-suya-green-dark">Seguimiento del pedido</h2>
          <p key={order.status} className="suya-value-in mt-1.5 text-balance font-display text-[clamp(1.125rem,3vw,1.7rem)] font-bold leading-tight tracking-tight text-suya-carbon" aria-live="polite">
            {statusMessage(order.status)}
          </p>
        </div>

      </header>

      <div className={cn('grid items-start gap-4 px-3 pb-3 sm:gap-5 sm:px-5 sm:pb-5', !final && 'md:grid-cols-[minmax(0,1.65fr)_minmax(15.5rem,1fr)]')}>
        {canShowMap && (
          <div className="min-w-0">
            <div className={cn('suya-tracking-map-frame relative isolate rounded-[20px] bg-suya-ivory ring-1 ring-suya-border', points.length ? 'h-[clamp(320px,53dvh,490px)]' : 'min-h-[200px] overflow-hidden')}>
              {points.length > 0 ? (
                <>
                  <MapProvider
                    variant="tracking"
                    points={points}
                    origin={origin}
                    destination={destination}
                    rider={canReadRiderLocation ? rider : null}
                    riderStale={Boolean(rider) && !live}
                    riderTrail={canReadRiderLocation ? riderTrail : undefined}
                    label={`Mapa de seguimiento del pedido ${order.code}`}
                    className="rounded-[20px]"
                  />
                  {tracking && (
                    <div className="pointer-events-none absolute left-3 top-3 z-[490] max-w-[calc(100%-4.5rem)]">
                      <span className={cn('inline-flex items-center gap-2 rounded-full border border-suya-border bg-white px-3 py-2 text-xs font-semibold shadow-card', live ? 'text-suya-green-dark' : 'text-suya-carbon')}>
                        <span className={cn('size-2 shrink-0 rounded-full', live ? 'bg-suya-green' : 'bg-suya-sun')} aria-hidden="true" />
                        {live ? 'GPS en vivo' : rider ? 'Última ubicación' : 'Buscando señal'}
                      </span>
                    </div>
                  )}
                </>
              ) : (
                <MapUnavailable address={order.customer.address} reference={order.customer.reference} audience="customer" />
              )}
            </div>
            <div className="flex items-start gap-2 px-2 pb-1 pt-3 text-xs leading-relaxed text-suya-muted">
              <Radio className={cn('mt-px h-4 w-4 shrink-0', live ? 'text-suya-green' : 'text-suya-muted')} aria-hidden="true" />
              <div>
                <p role="status">{signal}</p>
                {locationState === 'error' && tracking && (
                  <button type="button" onClick={() => setRetryCount((count) => count + 1)} className="min-h-11 rounded-btn font-semibold text-suya-green-dark underline underline-offset-4 focus-visible:outline-suya-green">
                    Reintentar ubicación
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        <aside className="min-w-0 overflow-hidden rounded-[20px] border border-suya-border bg-[#F5F8F4] px-4 py-4 sm:px-5" aria-label="Avance del pedido">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
            <h3 className="font-display text-base font-bold text-suya-carbon">Avance del pedido</h3>
            <span className="text-xs font-semibold text-suya-green-dark">{orderStatusLabel(order.status)}</span>
          </div>
          <div aria-hidden="true" className="mt-3 flex gap-1.5">
            {ORDER_FLOW.map((status, index) => (
              <span key={status} className={cn('h-1.5 min-w-0 flex-1 rounded-full', index < step ? 'bg-suya-green' : index === step ? 'bg-suya-lime' : 'bg-[#DCE5DD]')} />
            ))}
          </div>

          <dl className="mt-4 space-y-3 border-y border-suya-border py-4 text-sm">
            <div className="flex gap-2.5">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white text-suya-green-dark"><Store className="h-4 w-4" aria-hidden="true" /></span>
              <div className="min-w-0">
                <dt className="text-xs font-medium text-suya-muted">Sale de</dt>
                <dd className="mt-0.5 break-words font-semibold text-suya-carbon">{order.storeName}</dd>
              </div>
            </div>
            <div className="flex gap-2.5">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-suya-green-dark text-white"><MapPin className="h-4 w-4" aria-hidden="true" /></span>
              <div className="min-w-0">
                <dt className="text-xs font-medium text-suya-muted">Entrega en</dt>
                <dd className="mt-0.5 break-words font-semibold text-suya-carbon">{order.customer.address}</dd>
                {order.customer.reference && <dd className="mt-1 break-words text-xs text-suya-muted">{order.customer.reference}</dd>}
              </div>
            </div>
          </dl>

          <details className="group">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-btn text-sm font-semibold text-suya-green-dark focus-visible:outline-suya-green [&::-webkit-details-marker]:hidden">
              Historial del pedido <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
            </summary>
            <div className="pt-2">
              <TrackingTimeline order={order} compact />
            </div>
          </details>
        </aside>
      </div>
    </section>
  );
}
