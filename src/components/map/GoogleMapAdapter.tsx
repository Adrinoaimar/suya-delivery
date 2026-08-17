import { MockMap } from './MockMap';
import type { MapViewProps } from './types';

/**
 * Adaptador de Google Maps.
 *
 * La demo local NO depende de una API key. Este archivo deja lista la superficie de integración:
 * cuando exista `VITE_GOOGLE_MAPS_KEY`, aquí se monta `@vis.gl/react-google-maps` (o el SDK oficial)
 * respetando exactamente la misma interfaz `MapViewProps` que usan MockMap y LeafletMap.
 *
 * FUTURE: replace local implementation with the Google Maps JavaScript API.
 */
export default function GoogleMapAdapter(props: MapViewProps) {
  return <MockMap {...props} />;
}
