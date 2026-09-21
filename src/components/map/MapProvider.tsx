import { Suspense, lazy, useEffect, useState } from 'react';
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
  const [online, setOnline] = useState(
    () => typeof navigator === 'undefined' || navigator.onLine !== false,
  );

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (!online) {
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
