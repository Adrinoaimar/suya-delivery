import { useEffect, useRef, useState } from 'react';
import { BrowserLocationService } from '@/lib/services';
import type { LocationPermission, LocationReading } from '@/lib/services';

interface GeolocationState {
  reading: LocationReading | null;
  error: string | null;
  permission: LocationPermission;
  active: boolean;
}

/**
 * Ubicación del repartidor.
 * `simulated` fuerza el modo de ubicación simulada (útil sin GPS o en escritorio).
 */
export function useGeolocation(enabled: boolean) {
  const [state, setState] = useState<GeolocationState>({
    reading: null,
    error: null,
    permission: 'unknown',
    active: false,
  });
  const stopRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let cancelled = false;
    BrowserLocationService.getPermission().then((permission) => {
      if (!cancelled) setState((prev) => ({ ...prev, permission }));
    });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      stopRef.current?.();
      stopRef.current = null;
      setState((prev) => ({ ...prev, active: false }));
      return undefined;
    }

    const service = BrowserLocationService;
    setState((prev) => ({ ...prev, error: null, active: true }));

    const stop = service.watch(
      (reading) => setState((prev) => ({ ...prev, reading, error: null, active: true })),
      (message) => setState((prev) => ({ ...prev, error: message, active: false })),
    );
    stopRef.current = stop;

    return () => {
      stop();
      stopRef.current = null;
    };
  }, [enabled]);

  return state;
}
