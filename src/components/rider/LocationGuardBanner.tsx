import { LocateFixed, LocateOff, ShieldAlert } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/cn';
import { useRiderLocationGuard } from '@/hooks/useRiderLocationGuard';
import { useRiderStore } from '@/store/riderStore';
import { formatRelative } from '@/utils/format';
import { useNow } from '@/hooks/useSharedLocation';

/**
 * Estado permanente de la ubicación en el área del repartidor.
 * Suya exige ubicación activa durante toda la conexión, no solo al compartirla.
 */
export function LocationGuardBanner() {
  const { required, tracking, reading, error, simulated } = useRiderLocationGuard();
  const setSimulatedLocation = useRiderStore((state) => state.setSimulatedLocation);
  const now = useNow(5000);

  if (!required) {
    return (
      <div className="flex items-start gap-2.5 border-b border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white/75">
        <LocateOff aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          Rastreo en pausa. Al activar <strong>Disponible</strong>, Suya mantiene tu ubicación
          activa durante todo el turno.
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-wrap items-center gap-2.5 border-b border-suya-danger/50 bg-suya-danger/15 px-4 py-2.5 text-sm text-white">
        <ShieldAlert aria-hidden="true" className="h-4 w-4 shrink-0 text-suya-danger" />
        <p className="flex-1 min-w-[200px]">{error} Sin ubicación no puedes recibir pedidos.</p>
        <button
          type="button"
          onClick={() => setSimulatedLocation(true)}
          className="press h-9 rounded-btn bg-white px-3 text-sm font-semibold text-suya-carbon"
        >
          Usar modo simulado
        </button>
        <Link
          to="/rider/safety"
          className="press h-9 rounded-btn border border-white/40 px-3 text-sm font-semibold leading-9"
        >
          Cómo activarla
        </Link>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-2 border-b px-4 py-2.5 text-sm',
        tracking
          ? 'border-suya-lime/30 bg-suya-lime/10 text-white'
          : 'border-white/10 bg-white/5 text-white/75',
      )}
    >
      <LocateFixed
        aria-hidden="true"
        className={cn('h-4 w-4 shrink-0', tracking ? 'text-suya-lime' : 'text-white/60')}
      />
      <p className="flex-1 min-w-[200px]">
        {tracking ? 'Ubicación activa' : 'Buscando tu ubicación…'}
        {reading && (
          <span className="text-white/70">
            {' '}
            · {reading.position.lat.toFixed(4)}, {reading.position.lng.toFixed(4)} ·{' '}
            {formatRelative(reading.timestamp, now)}
          </span>
        )}
      </p>
      {simulated && (
        <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-[11px] font-semibold">
          Modo simulado
        </span>
      )}
    </div>
  );
}
