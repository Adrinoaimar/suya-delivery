import { useMemo } from 'react';
import { Check, MapPin, Navigation, PackageCheck, Phone } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/common/Button';
import { MapProvider } from '@/components/map/MapProvider';
import { TrackingTimeline } from '@/components/order/TrackingTimeline';
import { demoRoute } from '@/data';
import { orderService } from '@/lib/services';
import { useRouteProgress } from '@/hooks/useOrderSimulation';
import { selectActiveOrder, useOrderStore } from '@/store/orderStore';
import { formatPrice, orderStatusLabel } from '@/utils/format';
import { pointAtProgress } from '@/utils/geo';
import type { OrderStatus } from '@/types';

const NEXT_ACTION: Partial<Record<OrderStatus, { label: string; next: OrderStatus }>> = {
  confirmed: { label: 'Marcar en preparación', next: 'preparing' },
  preparing: { label: 'Recogí el pedido', next: 'picked_up' },
  picked_up: { label: 'Voy en camino', next: 'on_the_way' },
  on_the_way: { label: 'Entregué el pedido', next: 'delivered' },
};

export default function RiderCurrentPage() {
  const orders = useOrderStore((state) => state.orders);
  const refresh = useOrderStore((state) => state.refresh);
  const active = selectActiveOrder(orders);
  const progress = useRouteProgress(active);

  const riderPosition = useMemo(() => pointAtProgress(demoRoute.points, progress), [progress]);

  if (!active) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-8 lg:px-8">
        <div className="rounded-card border border-white/10 bg-white/5 p-8 text-center text-white">
          <Navigation className="mx-auto h-8 w-8 text-suya-lime" aria-hidden="true" />
          <h1 className="mt-3 font-display text-xl font-bold">Sin viaje activo</h1>
          <p className="mt-1 text-sm text-white/70">
            Crea un pedido desde la vista de cliente para ver aquí el viaje del repartidor.
          </p>
          <Link
            to="/stores"
            className="press mt-4 inline-flex h-11 items-center rounded-btn bg-suya-lime px-4 font-display text-sm font-semibold text-suya-carbon"
          >
            Ir a la tienda
          </Link>
        </div>
      </div>
    );
  }

  const action = NEXT_ACTION[active.status];

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4 px-4 py-5 lg:px-8 lg:py-8">
      <header className="text-white">
        <h1 className="font-display text-2xl font-bold">Viaje actual</h1>
        <p className="text-sm text-white/70">
          #{active.code} · {orderStatusLabel(active.status)}
        </p>
      </header>

      <div className="h-56 overflow-hidden rounded-card border border-white/10 sm:h-72">
        <MapProvider
          points={demoRoute.points}
          origin={demoRoute.origin}
          destination={demoRoute.destination}
          rider={riderPosition}
          label="Ruta asignada"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <section className="rounded-card bg-white p-4">
          <h2 className="font-display text-[15px] font-bold">Entrega</h2>
          <p className="mt-1 flex items-start gap-1.5 text-sm text-[#4A4F55]">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-suya-green" aria-hidden="true" />
            {active.customer.address}
          </p>
          {active.customer.reference && (
            <p className="mt-1 text-sm text-[#6B7076]">Referencia: {active.customer.reference}</p>
          )}
          <p className="mt-2 text-sm text-[#4A4F55]">
            {active.customer.name} · {active.customer.phone}
          </p>

          <div className="mt-3 border-t border-suya-mist pt-3">
            <h3 className="font-display text-[15px] font-bold">{active.storeName}</h3>
            <ul className="mt-1 space-y-1 text-sm text-[#4A4F55]">
              {active.items.map((item) => (
                <li key={item.lineId}>
                  {item.quantity} × {item.name}
                </li>
              ))}
            </ul>
            <p className="mt-2 flex justify-between font-display font-bold">
              Total a cobrar <span>{formatPrice(active.total)}</span>
            </p>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {action && (
              <Button
                onClick={() => {
                  orderService.updateStatus(active.id, action.next);
                  refresh();
                }}
              >
                {action.next === 'delivered' ? (
                  <Check className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <PackageCheck className="h-4 w-4" aria-hidden="true" />
                )}
                {action.label}
              </Button>
            )}
            <a
              href={`tel:${active.customer.phone.replace(/\s/g, '')}`}
              className="press inline-flex h-12 items-center gap-2 rounded-btn border border-suya-green px-4 font-display text-[15px] font-semibold text-suya-green"
            >
              <Phone className="h-4 w-4" aria-hidden="true" />
              Llamar al cliente
            </a>
          </div>
        </section>

        <section className="rounded-card bg-white p-4">
          <h2 className="mb-3 font-display text-[15px] font-bold">Estado del pedido</h2>
          <TrackingTimeline order={active} compact />
        </section>
      </div>
    </div>
  );
}
