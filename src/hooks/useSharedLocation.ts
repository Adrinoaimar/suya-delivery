import { useEffect, useState } from 'react';
import { locationSharingService } from '@/lib/services';
import type { SharedLocationSnapshot } from '@/types';

/**
 * DEMO LOCAL — escucha la ubicación compartida por el repartidor.
 * Funciona entre pestañas del mismo navegador (BroadcastChannel + evento `storage`).
 */
export function useSharedLocation(token?: string) {
  const [snapshot, setSnapshot] = useState<SharedLocationSnapshot | null>(() =>
    locationSharingService.getSnapshot(),
  );

  useEffect(() => {
    setSnapshot(locationSharingService.getSnapshot());
    return locationSharingService.subscribe(setSnapshot);
  }, []);

  const matchesToken = !token || !snapshot || snapshot.token === token;
  return { snapshot: matchesToken ? snapshot : null, tokenMismatch: !matchesToken };
}

/** Reloj de 1 s para textos del tipo «actualizado hace 4 segundos». */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}
