import { useEffect, useRef } from 'react';
import { notificationService, safetyOperationsService } from '@/lib/services';
import { useRiderStore } from '@/store/riderStore';
import { useTrackingStore } from '@/store/trackingStore';
import { selectActiveOrder, useOrderStore } from '@/store/orderStore';
import { useGeolocation } from './useGeolocation';

/**
 * Rastreador único del repartidor. Se monta UNA sola vez, en el layout del área
 * del repartidor, y escribe en `trackingStore`; las pantallas solo leen de ahí.
 *
 * La ubicación es obligatoria mientras el repartidor está disponible y se mantiene
 * también mientras comparte su posición con un contacto de confianza. Si el permiso
 * se pierde o se rechaza, se retira la disponibilidad: sin ubicación no se reparte.
 */
export function useRiderTrackingRunner(): void {
  const available = useRiderStore((state) => state.available);
  const setAvailable = useRiderStore((state) => state.setAvailable);
  const setSnapshot = useTrackingStore((state) => state.setSnapshot);
  const activeOrder = useOrderStore((state) => selectActiveOrder(state.orders));
  const lastPublishedRef = useRef(0);

  // Un rider asignado pasa a `busy`; el GPS debe seguir activo durante el viaje.
  const tripInProgress = Boolean(activeOrder && ['picked_up', 'on_the_way'].includes(activeOrder.status));
  const enabled = available || tripInProgress;
  const { reading, error, permission, active } = useGeolocation(enabled);

  useEffect(() => {
    setSnapshot({ reading, error, permission, active });
  }, [reading, error, permission, active, setSnapshot]);

  useEffect(() => {
    if (!reading || reading.simulated || !activeOrder ||
        !['picked_up', 'on_the_way'].includes(activeOrder.status)) return;
    if (reading.timestamp - lastPublishedRef.current < 8_000) return;
    lastPublishedRef.current = reading.timestamp;
    void safetyOperationsService.publishLocation(activeOrder.id, reading).catch(() => {
      notificationService.notify('No pudimos sincronizar tu GPS. Revisa la conexión.', 'danger');
    });
  }, [activeOrder, reading]);

  useEffect(() => {
    if (!available || !error) return;
    setAvailable(false);
    notificationService.notify(
      'Sin ubicación no puedes estar disponible. Activa el GPS y su permiso.',
      'danger',
    );
  }, [available, error, setAvailable]);
}

/** Estado de ubicación para las pantallas del repartidor (solo lectura). */
export function useRiderLocation() {
  const available = useRiderStore((state) => state.available);
  const { reading, error, permission, active } = useTrackingStore();

  return {
    required: available,
    tracking: available && active && reading !== null,
    reading,
    error,
    permission,
  };
}
