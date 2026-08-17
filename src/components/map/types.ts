import type { LatLng, RoutePoint } from '@/types';

export interface MapViewProps {
  /** Polilínea de la ruta. */
  points: LatLng[];
  origin?: RoutePoint;
  destination?: RoutePoint;
  /** Posición actual del repartidor. */
  rider?: LatLng | null;
  className?: string;
  /** Etiqueta accesible: el mapa es una imagen, no un control. */
  label?: string;
  /** Permite arrastrar y hacer zoom (solo aplica a proveedores reales). */
  interactive?: boolean;
}
