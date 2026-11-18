import { useEffect, useMemo, useRef, useState } from 'react';
import { Bike, ChevronRight, Navigation, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Toggle } from '@/components/common/Toggle';
import { MapProvider } from '@/components/map/MapProvider';
import { cn } from '@/lib/cn';
import { notificationService, riderOperationsService } from '@/lib/services';
import { useAuthStore } from '@/store/authStore';
import { selectActiveOrder, useOrderStore } from '@/store/orderStore';
import { useRiderStore } from '@/store/riderStore';
import { useTrackingStore } from '@/store/trackingStore';
import { orderStatusLabel } from '@/utils/format';

export default function RiderHomePage() {
  const available = useRiderStore((state) => state.available);
  const setAvailable = useRiderStore((state) => state.setAvailable);
  const orders = useOrderStore((state) => state.orders);
  const active = selectActiveOrder(orders);
  const riderName = useAuthStore((state) => state.identity?.displayName ?? 'Repartidor');
  const reading = useTrackingStore((state) => state.reading);
  const [availabilityBusy, setAvailabilityBusy] = useState(false);
  const availabilityRequestRef = useRef(0);
  const availabilityBusyRef = useRef(false);
  const mapPoints = useMemo(
    () =>
      [active?.storePosition, active?.deliveryPosition].filter(
        (point): point is NonNullable<typeof point> => point != null,
      ),
    [active?.storePosition, active?.deliveryPosition],
  );
  const mapOrigin = useMemo(
    () =>
      active?.storePosition ? { ...active.storePosition, label: active.storeName } : undefined,
    [active?.storePosition, active?.storeName],
  );
  const mapDestination = useMemo(
    () =>
      active?.deliveryPosition
        ? { ...active.deliveryPosition, label: 'Punto de entrega' }
        : undefined,
    [active?.deliveryPosition],
  );
  const guidingToDelivery = Boolean(active && ['picked_up', 'on_the_way'].includes(active.status));

  useEffect(() => {
    const requestId = ++availabilityRequestRef.current;
    let active = true;
    void riderOperationsService
      .getAvailability()
      .then((status) => {
        if (active && requestId === availabilityRequestRef.current) {
          setAvailable(status === 'available');
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [setAvailable]);

  function changeAvailability(value: boolean): void {
    if (availabilityBusyRef.current) return;
    availabilityBusyRef.current = true;
    const requestId = ++availabilityRequestRef.current;
    setAvailabilityBusy(true);
    void riderOperationsService
      .setAvailability(value)
      .then((nextStatus) => {
        if (requestId !== availabilityRequestRef.current) return;
        const nextAvailable = nextStatus === 'available';
        setAvailable(nextAvailable);
        notificationService.notify(
          nextAvailable ? 'Ahora estás disponible' : 'Ya no recibirás pedidos',
          nextAvailable ? 'success' : 'info',
        );
      })
      .catch((error: unknown) => {
        if (requestId !== availabilityRequestRef.current) return;
        notificationService.notify(
          error instanceof Error ? error.message : 'No pudimos cambiar tu disponibilidad.',
          'danger',
        );
      })
      .finally(() => {
        if (requestId !== availabilityRequestRef.current) return;
        availabilityBusyRef.current = false;
        setAvailabilityBusy(false);
      });
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-5 lg:px-8 lg:py-8">
      <header className="motion-enter pb-1 text-white">
        <p className="text-sm font-medium text-white/75">Hola,</p>
        <h1 className="break-words font-display text-3xl font-bold tracking-tight">{riderName}</h1>
      </header>

      {/* Disponibilidad */}
      <section
        className={cn(
          'rounded-card border border-white/20 bg-suya-green-dark p-5',
          available && 'border-suya-lime/50',
        )}
      >
        <h2 className="mb-2 font-display text-xs font-semibold uppercase tracking-widest text-suya-lime-soft">Tu turno</h2>
        <Toggle
          label={available ? 'Disponible' : 'No disponible'}
          description={
            availabilityBusy
              ? 'Actualizando tu disponibilidad…'
              : available
              ? 'Recibes pedidos en Sullana con tu ubicación activa.'
              : 'Activa tu turno y el GPS para recibir pedidos cercanos.'
          }
          checked={available}
          disabled={availabilityBusy}
          tone="sun"
          className="[&_span]:text-white [&_span.text-sm]:text-white/80"
          onChange={changeAvailability}
        />
      </section>

      {/* Viaje activo */}
      <section className="rounded-card border border-white/15 bg-white p-5 text-suya-carbon">
        <h2 className="flex items-center gap-2 font-display text-[15px] font-bold">
          <Navigation className="h-5 w-5 text-suya-green" aria-hidden="true" />
          Viaje actual
        </h2>
        {active ? (
          <div className="motion-enter mt-2" key={active.id}>
            <p className="font-display text-lg font-bold">{active.storeName}</p>
            <p className="text-sm text-suya-muted" aria-live="polite">
              #{active.code} · {orderStatusLabel(active.status)}
            </p>
            <p className="mt-1 text-sm text-suya-muted">Entregar en: {active.customer.address}</p>
            <Link
              to="/rider/current"
              className="press mt-3 inline-flex h-12 items-center rounded-btn bg-suya-lime px-4 font-display text-sm font-semibold text-suya-carbon"
            >
              Abrir viaje <ChevronRight className="ml-2 h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        ) : (
          <p className="mt-2 text-sm text-suya-muted">
            No tienes un viaje asignado. Tu próxima entrega aparecerá aquí.
          </p>
        )}
      </section>

      {/* Mapa principal: el repartidor puede orientarse desde Inicio, incluso sin viaje activo. */}
      <section className="relative isolate h-[clamp(240px,34dvh,360px)] sm:h-[min(58dvh,520px)] overflow-hidden rounded-card border border-white/10 bg-suya-carbon shadow-card">
        <MapProvider
          points={mapPoints}
          origin={mapOrigin}
          destination={mapDestination}
          rider={reading?.position ?? null}
          label="Mapa de tu ubicación y zona de reparto"
          navigation={guidingToDelivery}
        />
        <div className="pointer-events-none absolute inset-x-3 bottom-3 z-[500] flex items-center justify-between gap-3 rounded-2xl bg-suya-carbon px-3.5 py-3 text-white shadow-card">
          <span className="flex min-w-0 items-center gap-2 text-sm font-semibold">
            <span
              aria-hidden="true"
              className={cn(
                'h-2.5 w-2.5 shrink-0 rounded-full',
                reading ? 'bg-suya-lime' : 'bg-white/50',
              )}
            />
            <span className="truncate">
              {!reading
                ? 'Activa el GPS para ubicarte'
                : guidingToDelivery ? 'Siguiendo tu ruta de entrega' : 'Ubicación activa'}
            </span>
          </span>
          <span className="shrink-0 text-xs text-white/65">Sullana</span>
        </div>
      </section>

      <Link
        to="/rider/safety"
        className="press flex min-h-12 items-center gap-3 rounded-card border border-suya-border bg-white/95 p-4 text-suya-carbon shadow-card"
      >
        <ShieldCheck className="h-6 w-6 text-suya-green" aria-hidden="true" />
        <span className="flex-1">
          <span className="block font-display text-[15px] font-bold">Seguridad en ruta</span>
          <span className="block text-sm text-suya-muted">
            Comparte tu ubicación, registra tu contacto de confianza y activa el SOS.
          </span>
        </span>
      </Link>

      <Link
        to="/rider/history"
        className="press suya-lens-dark flex min-h-12 items-center gap-3 rounded-card p-4 text-white"
      >
        <Bike className="h-5 w-5 text-suya-lime" aria-hidden="true" />
        <span className="flex-1">
          <span className="block font-display text-[15px] font-bold">Historial de entregas</span>
          <span className="block text-sm text-white/70">Revisa tus viajes completados.</span>
        </span>
      </Link>
    </div>
  );
}
