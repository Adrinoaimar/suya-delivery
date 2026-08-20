import type { LocationPermission, LocationReading, LocationService } from './types';

/**
 * Ubicación real del navegador (`navigator.geolocation.watchPosition`).
 * Si permiso se rechaza o dispositivo no tiene GPS, reporta error; nunca inventa ubicación.
 */
export class BrowserLocationServiceImpl implements LocationService {
  isSupported(): boolean {
    return typeof navigator !== 'undefined' && navigator.geolocation != null;
  }

  async getPermission(): Promise<LocationPermission> {
    if (!this.isSupported()) return 'unsupported';
    if (typeof navigator.permissions?.query !== 'function') return 'unknown';
    try {
      const status = await navigator.permissions.query({ name: 'geolocation' });
      if (status.state === 'granted') return 'granted';
      if (status.state === 'denied') return 'denied';
      return 'unknown';
    } catch {
      return 'unknown';
    }
  }

  watch(
    onReading: (reading: LocationReading) => void,
    onError: (message: string) => void,
  ): () => void {
    if (!this.isSupported()) {
      onError('Este navegador no permite acceder a la ubicación.');
      return () => undefined;
    }

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        onReading({
          position: { lat: position.coords.latitude, lng: position.coords.longitude },
          accuracy: position.coords.accuracy,
          timestamp: position.timestamp,
          simulated: false,
        });
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          onError('No tenemos permiso para acceder a tu ubicación.');
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          onError('No pudimos obtener tu ubicación. Revisa el GPS de tu dispositivo.');
        } else {
          onError('La ubicación tardó demasiado en responder.');
        }
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }
}

export const BrowserLocationService = new BrowserLocationServiceImpl();
