import type { MapAdapterInfo, MapService } from './types';

/**
 * Selección del proveedor de mapa.
 *
 * `mock` es el proveedor por defecto: dibuja la ciudad en SVG y no requiere red ni API key.
 * `leaflet` usa OpenStreetMap (necesita conexión a internet).
 * `google` queda declarado pero deshabilitado hasta que exista `VITE_GOOGLE_MAPS_KEY`.
 */
const GOOGLE_KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY as string | undefined;
// Por defecto se usa un mapa real (OpenStreetMap); sin conexión, `MapProvider` cae a `mock`.
const CONFIGURED = (import.meta.env.VITE_MAP_PROVIDER as string | undefined) ?? 'leaflet';

export class MapServiceImpl implements MapService {
  listAdapters(): MapAdapterInfo[] {
    return [
      { id: 'mock', label: 'Mapa Suya (sin conexión)', requiresApiKey: false, available: true },
      { id: 'leaflet', label: 'OpenStreetMap (Leaflet)', requiresApiKey: false, available: true },
      {
        id: 'google',
        label: 'Google Maps',
        requiresApiKey: true,
        available: Boolean(GOOGLE_KEY),
      },
    ];
  }

  getActiveAdapterId(): MapAdapterInfo['id'] {
    const adapter = this.listAdapters().find((item) => item.id === CONFIGURED);
    return adapter?.available ? adapter.id : 'mock';
  }
}

export const MapServiceLocal = new MapServiceImpl();
