import { MapPin, Satellite, ShieldAlert } from 'lucide-react';
import { Card } from '@/components/common/Card';
import { MapProvider } from '@/components/map/MapProvider';
import { useRiderLocation } from '@/hooks/useRiderLocationGuard';

/** GPS real. Enlaces públicos esperan token, TTL y revocación server-side. */
export function LocationShareCard() {
  const { reading, error, permission, required } = useRiderLocation();
  const denied = permission === 'denied' || Boolean(error);

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="font-display text-lg font-bold">Ubicación operativa</h2>
        <p className="mt-1 text-sm text-[#6B7076]">
          GPS se sincroniza durante entregas activas. Solo participantes autorizados ven la posición.
        </p>
      </div>
      {denied && (
        <div className="rounded-btn border border-suya-danger bg-suya-danger-soft p-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-suya-danger">
            <ShieldAlert className="h-4 w-4" aria-hidden="true" /> Ubicación no disponible
          </p>
          <p className="mt-1 text-sm text-[#4A4F55]">{error ?? 'Activa permiso de ubicación.'}</p>
        </div>
      )}
      <div className="overflow-hidden rounded-card border border-suya-mist">
        <div className="h-40">
          {reading ? (
            <MapProvider points={[reading.position]} rider={reading.position} label="Tu ubicación GPS actual" />
          ) : (
            <div className="flex h-full items-center justify-center bg-suya-ivory p-5 text-center text-sm text-[#6B7076]">
              {required ? 'Esperando lectura GPS…' : 'Activa disponibilidad para iniciar GPS operativo.'}
            </div>
          )}
        </div>
        <dl className="grid grid-cols-2 gap-3 border-t border-suya-mist p-3 text-sm">
          <div><dt className="text-xs text-[#6B7076]">Coordenadas</dt><dd className="font-medium tabular-nums">{reading ? `${reading.position.lat.toFixed(5)}, ${reading.position.lng.toFixed(5)}` : '—'}</dd></div>
          <div><dt className="text-xs text-[#6B7076]">Precisión</dt><dd className="font-medium tabular-nums">{reading ? `${Math.round(reading.accuracy)} m` : '—'}</dd></div>
          <div className="col-span-2">
            <dt className="text-xs text-[#6B7076]">Estado</dt>
            <dd className="flex items-center gap-1.5 font-medium">
              {reading ? <Satellite className="h-4 w-4 text-suya-green" aria-hidden="true" /> : <MapPin className="h-4 w-4 text-[#6B7076]" aria-hidden="true" />}
              {reading ? 'GPS real activo' : permission === 'unsupported' ? 'Geolocalización no disponible' : 'Sin lectura'}
            </dd>
          </div>
        </dl>
      </div>
      <p className="text-xs text-[#6B7076]">
        Enlace público deshabilitado hasta implementar token criptográfico, vencimiento y revocación en servidor.
      </p>
    </Card>
  );
}
