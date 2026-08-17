import { Suspense, lazy } from 'react';
import { mapService } from '@/lib/services';
import { Skeleton } from '@/components/common/Skeleton';
import { MockMap } from './MockMap';
import type { MapViewProps } from './types';

const LeafletMap = lazy(() => import('./LeafletMap'));
const GoogleMapAdapter = lazy(() => import('./GoogleMapAdapter'));

/**
 * Punto único de acceso al mapa.
 *
 * La aplicación siempre renderiza `<MapProvider />`; el proveedor concreto se elige por
 * configuración (`VITE_MAP_PROVIDER`) sin tocar las pantallas:
 *   - `mock`    → SVG local, sin red (predeterminado).
 *   - `leaflet` → OpenStreetMap.
 *   - `google`  → requiere `VITE_GOOGLE_MAPS_KEY`.
 */
export function MapProvider(props: MapViewProps) {
  const adapter = mapService.getActiveAdapterId();
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;

  // Sin conexión los tiles no cargarían: se dibuja el mapa local en su lugar.
  if (adapter === 'mock' || offline) return <MockMap {...props} />;

  return (
    <Suspense fallback={<Skeleton className="h-full w-full rounded-none" />}>
      {adapter === 'leaflet' ? <LeafletMap {...props} /> : <GoogleMapAdapter {...props} />}
    </Suspense>
  );
}
