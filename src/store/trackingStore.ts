import { create } from 'zustand';
import type { LocationPermission, LocationReading } from '@/lib/services';

/**
 * Última lectura de ubicación del repartidor.
 *
 * Existe un único rastreador (montado en el layout del repartidor) que escribe aquí;
 * todas las pantallas leen de este store. Antes, el panel de seguridad y el guard de
 * disponibilidad abrían cada uno su propio `watchPosition`, lo que duplicaba el trabajo
 * del GPS y hacía que dos rutas simuladas se pisaran entre sí.
 */
interface TrackingState {
  reading: LocationReading | null;
  error: string | null;
  permission: LocationPermission;
  active: boolean;
  /** Compartiendo con el contacto de confianza (independiente de la disponibilidad). */
  sharing: boolean;
  setSnapshot: (snapshot: {
    reading: LocationReading | null;
    error: string | null;
    permission: LocationPermission;
    active: boolean;
  }) => void;
  setSharing: (value: boolean) => void;
}

export const useTrackingStore = create<TrackingState>((set) => ({
  reading: null,
  error: null,
  permission: 'unknown',
  active: false,
  sharing: false,

  setSnapshot(snapshot) {
    set(snapshot);
  },

  setSharing(value) {
    set({ sharing: value });
  },
}));
