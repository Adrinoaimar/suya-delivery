import { useEffect } from 'react';
import { locationSharingService, notificationService } from '@/lib/services';
import { useRiderStore } from '@/store/riderStore';
import { useGeolocation } from './useGeolocation';

/**
 * La ubicación del repartidor es obligatoria mientras está disponible.
 *
 * Mantiene el rastreo activo durante toda la conexión (no solo al compartir con un
 * contacto), publica la última posición conocida y, si el permiso se pierde o se
 * rechaza, retira la disponibilidad: sin ubicación no se reparte.
 */
export function useRiderLocationGuard() {
  const available = useRiderStore((state) => state.available);
  const simulated = useRiderStore((state) => state.simulatedLocation);
  const setAvailable = useRiderStore((state) => state.setAvailable);

  const { reading, error, permission, active } = useGeolocation(available, simulated);

  useEffect(() => {
    if (!available || !reading) return;
    // Mantiene fresca la posición para el enlace de seguimiento, si está activo.
    if (locationSharingService.getStatus() === 'sharing') {
      locationSharingService.publish({
        position: reading.position,
        accuracy: reading.accuracy,
        updatedAt: reading.timestamp,
        simulated: reading.simulated,
      });
    }
  }, [available, reading]);

  useEffect(() => {
    if (!available || !error) return;
    setAvailable(false);
    notificationService.notify(
      'Sin ubicación no puedes estar disponible. Activa el GPS o usa el modo simulado.',
      'danger',
    );
  }, [available, error, setAvailable]);

  return {
    required: available,
    tracking: available && active && reading !== null,
    reading,
    error,
    permission,
    simulated,
  };
}
