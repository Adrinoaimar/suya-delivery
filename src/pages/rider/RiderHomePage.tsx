import { Bike, Navigation, ShieldCheck, TrendingUp, Wallet } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Toggle } from '@/components/common/Toggle';
import { riders } from '@/data';
import { cn } from '@/lib/cn';
import { notificationService } from '@/lib/services';
import { selectActiveOrder, useOrderStore } from '@/store/orderStore';
import { useRiderStore } from '@/store/riderStore';
import { formatPrice, orderStatusLabel } from '@/utils/format';

const RIDER = riders[0]!;

export default function RiderHomePage() {
  const available = useRiderStore((state) => state.available);
  const setAvailable = useRiderStore((state) => state.setAvailable);
  const orders = useOrderStore((state) => state.orders);
  const active = selectActiveOrder(orders);

  const deliveredToday = orders.filter((order) => order.status === 'delivered');
  const earnings = deliveredToday.reduce((sum, order) => sum + order.deliveryFee + 2.5, 0);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-5 lg:px-8 lg:py-8">
      <header className="text-white">
        <p className="text-sm text-white/70">Hola,</p>
        <h1 className="font-display text-2xl font-bold">{RIDER.name}</h1>
      </header>

      {/* Disponibilidad */}
      <section
        className={cn(
          'rounded-card border p-4 transition-colors',
          available ? 'border-suya-lime/50 bg-suya-green' : 'border-white/10 bg-white/5',
        )}
      >
        <Toggle
          label={available ? 'Disponible' : 'No disponible'}
          description={
            available
              ? 'Estás recibiendo pedidos en Sullana. Tu ubicación permanece activa mientras dure el turno.'
              : 'Actívalo para recibir pedidos cercanos. Suya necesita tu ubicación durante toda la conexión.'
          }
          checked={available}
          tone="sun"
          className="[&_span]:text-white"
          onChange={(value) => {
            setAvailable(value);
            notificationService.notify(
              value ? 'Ahora estás disponible' : 'Ya no recibirás pedidos',
              value ? 'success' : 'info',
            );
          }}
        />
      </section>

      {/* Viaje activo */}
      <section className="rounded-card border border-white/10 bg-white/5 p-4 text-white">
        <h2 className="flex items-center gap-2 font-display text-[15px] font-bold">
          <Navigation className="h-4 w-4 text-suya-lime" aria-hidden="true" />
          Viaje actual
        </h2>
        {active ? (
          <div className="mt-2">
            <p className="font-display text-lg font-bold">{active.storeName}</p>
            <p className="text-sm text-white/70">
              #{active.code} · {orderStatusLabel(active.status)}
            </p>
            <p className="mt-1 text-sm text-white/70">Entregar en: {active.customer.address}</p>
            <Link
              to="/rider/current"
              className="press mt-3 inline-flex h-11 items-center rounded-btn bg-suya-lime px-4 font-display text-sm font-semibold text-suya-carbon"
            >
              Abrir viaje
            </Link>
          </div>
        ) : (
          <p className="mt-2 text-sm text-white/70">
            No tienes un viaje asignado. Cuando un cliente confirme un pedido en la demo aparecerá
            aquí automáticamente.
          </p>
        )}
      </section>

      {/* Métricas demo */}
      <section className="grid grid-cols-2 gap-3">
        <div className="rounded-card border border-white/10 bg-white/5 p-4 text-white">
          <Wallet className="h-5 w-5 text-suya-lime" aria-hidden="true" />
          <p className="mt-2 text-xs uppercase tracking-wider text-white/60">Ganancia demo</p>
          <p className="font-display text-2xl font-bold">{formatPrice(earnings)}</p>
        </div>
        <div className="rounded-card border border-white/10 bg-white/5 p-4 text-white">
          <TrendingUp className="h-5 w-5 text-suya-lime" aria-hidden="true" />
          <p className="mt-2 text-xs uppercase tracking-wider text-white/60">Entregas</p>
          <p className="font-display text-2xl font-bold">{deliveredToday.length}</p>
        </div>
      </section>

      <Link
        to="/rider/safety"
        className="press flex items-center gap-3 rounded-card border border-suya-lime/40 bg-suya-lime-soft p-4 text-suya-carbon"
      >
        <ShieldCheck className="h-6 w-6 text-suya-green" aria-hidden="true" />
        <span className="flex-1">
          <span className="block font-display text-[15px] font-bold">Seguridad en ruta</span>
          <span className="block text-sm text-[#4A4F55]">
            Comparte tu ubicación, registra tu contacto de confianza y activa el SOS.
          </span>
        </span>
      </Link>

      <Link
        to="/rider/history"
        className="press flex items-center gap-3 rounded-card border border-white/10 bg-white/5 p-4 text-white"
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
