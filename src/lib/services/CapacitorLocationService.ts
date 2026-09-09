import { Geolocation } from '@capacitor/geolocation';
import type { LocationPermission, LocationReading, LocationService } from './types';

/** Adaptador de ubicación nativa para Capacitor. Nunca inventa lecturas. */
export class CapacitorLocationServiceImpl implements LocationService {
  isSupported(): boolean {
    return true;
  }

  async getPermission(): Promise<LocationPermission> {
    try {
      const permissions = await Geolocation.checkPermissions();
      if (permissions.location === 'granted' || permissions.coarseLocation === 'granted') {
        return 'granted';
      }
      if (permissions.location === 'denied' || permissions.coarseLocation === 'denied') {
        return 'denied';
      }
      return 'unknown';
    } catch {
      return 'unknown';
    }
  }

  private async ensurePermission(): Promise<void> {
    let permissions = await Geolocation.checkPermissions();
    if (permissions.location !== 'granted' && permissions.coarseLocation !== 'granted') {
      permissions = await Geolocation.requestPermissions();
    }
    if (permissions.location !== 'granted' && permissions.coarseLocation !== 'granted') {
      throw new Error('No tenemos permiso para acceder a tu ubicación.');
    }
  }

  async getCurrent(): Promise<LocationReading> {
    await this.ensurePermission();
    const position = await Geolocation.getCurrentPosition({
      enableHighAccuracy: true,
      maximumAge: 30_000,
      timeout: 15_000,
    });
    return {
      position: { lat: position.coords.latitude, lng: position.coords.longitude },
      accuracy: position.coords.accuracy ?? 0,
      timestamp: position.timestamp,
      simulated: false,
    };
  }

  watch(
    onReading: (reading: LocationReading) => void,
    onError: (message: string) => void,
  ): () => void {
    let cancelled = false;
    let watchId: string | null = null;

    void this.ensurePermission().then(() => Geolocation.watchPosition(
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
      (position, error) => {
        if (cancelled) return;
        if (error || !position) {
          onError(error?.message || 'No pudimos obtener tu ubicación. Revisa el GPS de tu dispositivo.');
          return;
        }
        onReading({
          position: { lat: position.coords.latitude, lng: position.coords.longitude },
          accuracy: position.coords.accuracy ?? 0,
          timestamp: position.timestamp,
          simulated: false,
        });
      },
    )).then((id) => {
      if (cancelled) {
        void Geolocation.clearWatch({ id });
        return;
      }
      watchId = id;
    }).catch((error: unknown) => {
      if (!cancelled) onError(error instanceof Error ? error.message : 'No pudimos activar la ubicación.');
    });

    return () => {
      cancelled = true;
      if (watchId) void Geolocation.clearWatch({ id: watchId });
    };
  }
}

export const CapacitorLocationService = new CapacitorLocationServiceImpl();
