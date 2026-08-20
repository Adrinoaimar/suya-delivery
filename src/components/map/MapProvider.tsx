import { Suspense, lazy } from 'react';
import { Skeleton } from '@/components/common/Skeleton';
import type { MapViewProps } from './types';

const LeafletMap = lazy(() => import('./LeafletMap'));

/**
 * Punto único de acceso al mapa.
 *
 * La aplicación siempre renderiza `<MapProvider />`; el proveedor concreto se elige por
 * Producción usa OpenStreetMap mediante Leaflet. Sin conexión no inventa posiciones.
 */
export function MapProvider(props: MapViewProps) {
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;

  if (offline) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-suya-ivory p-6 text-center text-sm text-[#6B7076]" role="status">
        Mapa no disponible sin conexión. Dirección y referencia siguen visibles abajo.
      </div>
    );
  }

  return (
    <Suspense fallback={<Skeleton className="h-full w-full rounded-none" />}>
      <LeafletMap {...props} />
    </Suspense>
  );
}
