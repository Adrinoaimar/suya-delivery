import { useMemo, useState } from 'react';
import { Check, KeyRound, MapPin, Navigation, PackageCheck, Phone } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/common/Button';
import { MapProvider } from '@/components/map/MapProvider';
import { CodeDialog } from '@/components/order/CodeDialog';
import { TrackingTimeline } from '@/components/order/TrackingTimeline';
import { notificationService } from '@/lib/services';
import { selectActiveOrder, useOrderStore } from '@/store/orderStore';
import { useTrackingStore } from '@/store/trackingStore';
import { formatPrice, orderStatusLabel } from '@/utils/format';
import type { OrderStatus } from '@/types';

/**
 * El último paso no avanza solo: exige el código de 4 dígitos del cliente.
 */
const NEXT_ACTION: Partial<Record<OrderStatus, { label: string; next: OrderStatus }>> = {
  preparing: { label: 'Recogí el pedido', next: 'picked_up' },
  picked_up: { label: 'Voy en camino', next: 'on_the_way' },
};

export default function RiderCurrentPage() {
  const orders = useOrderStore((state) => state.orders);
  const updateOrderStatus = useOrderStore((state) => state.updateOrderStatus);
  const confirmDelivery = useOrderStore((state) => state.confirmDelivery);
  const active = selectActiveOrder(orders);
  const reading = useTrackingStore((state) => state.reading);
  const [codeOpen, setCodeOpen] = useState(false);
  const [advancing, setAdvancing] = useState(false);

  if (!active) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-8 lg:px-8">
        <div className="rounded-card border border-white/10 bg-white/5 p-8 text-center text-white">
          <Navigation className="mx-auto h-8 w-8 text-suya-lime" aria-hidden="true" />
          <h1 className="mt-3 font-display text-xl font-bold">Sin viaje activo</h1>
          <p className="mt-1 text-sm text-white/70">
            No tienes una entrega asignada en este momento.
          </p>
          <Link
            to="/rider"
            className="press mt-4 inline-flex h-11 items-center rounded-btn bg-suya-lime px-4 font-display text-sm font-semibold text-suya-carbon"
          >
            Volver al inicio
          </Link>
        </div>
      </div>
    );
  }

  const action = NEXT_ACTION[active.status];
  const mapReady = active.storePosition !== null && active.deliveryPosition !== null;
  // Referencias estables: LeafletMap remonta el mapa entero si origin/destination cambian de identidad.
  const mapPoints = useMemo(
    () => (mapReady ? [active.storePosition!, active.deliveryPosition!] : []),
    [mapReady, active.storePosition, active.deliveryPosition],
  );
  const mapOrigin = useMemo(
    () => (active.storePosition ? { ...active.storePosition, label: active.storeName } : undefined),
    [active.storePosition, active.storeName],
  );
  const mapDestination = useMemo(
    () => (active.deliveryPosition ? { ...active.deliveryPosition, label: 'Punto de entrega' } : undefined),
    [active.deliveryPosition],
  );

  async function advance(next: OrderStatus) {
    setAdvancing(true);
    try {
      await updateOrderStatus(active.id, next);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No pudimos actualizar el pedido.';
      notificationService.notify(message, 'danger');
    } finally {
      setAdvancing(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4 px-4 py-5 lg:px-8 lg:py-8">
      <header className="text-white">
        <h1 className="font-display text-2xl font-bold">Viaje actual</h1>
        <p className="text-sm text-white/70">
          #{active.code} · {orderStatusLabel(active.status)}
        </p>
      </header>

      <div className="h-56 overflow-hidden rounded-card border border-white/10 sm:h-72">
        {mapReady ? <MapProvider
          points={mapPoints}
          origin={mapOrigin}
          destination={mapDestination}
          rider={reading?.position ?? null}
          label="Ubicaciones de entrega"
        /> : (
          <div className="flex h-full items-center justify-center bg-white p-6 text-center text-sm text-[#6B7076]">
            Pedido sin ambos puntos verificados. Usa dirección y referencia.
          </div>
        )}
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
              <Button disabled={advancing} onClick={() => void advance(action.next)}>
                <PackageCheck className="h-4 w-4" aria-hidden="true" />
                {advancing ? 'Actualizando…' : action.label}
              </Button>
            )}
            {active.status === 'on_the_way' && (
              <Button disabled={advancing} onClick={() => setCodeOpen(true)}>
                <Check className="h-4 w-4" aria-hidden="true" />
                Entregué el pedido
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

          <div className="mt-3 flex items-start gap-2 rounded-btn bg-suya-mist/60 p-3 text-sm text-[#4A4F55]">
            <KeyRound aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-suya-green" />
            <p>
              Para cerrar la entrega pide al cliente su <strong>código de 4 dígitos</strong>. Solo
              con ese código el pedido pasa a «Entregado».
            </p>
          </div>
        </section>
      </div>

      <CodeDialog
        open={codeOpen}
        onClose={() => setCodeOpen(false)}
        title="Confirmar entrega"
        description={`Pide al cliente el código del pedido #${active.code}.`}
        helper="El cliente lo ve en la pantalla de seguimiento de su pedido."
        confirmLabel="Confirmar entrega"
        onSubmit={(code) => confirmDelivery(active.id, code)}
        onSuccess={() => notificationService.notify('Entrega confirmada', 'success')}
      />
    </div>
  );
}
