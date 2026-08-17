import { demoRoute } from '@/data';
import { pointAtProgress } from '@/utils/geo';
import type { LocationPermission, LocationReading, LocationService } from './types';

/**
 * Ubicación real del navegador (`navigator.geolocation.watchPosition`).
 * Si el permiso se rechaza o el dispositivo no tiene GPS, la interfaz ofrece el modo simulado.
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

/**
 * Modo ubicación simulada: recorre la ruta demo de Sullana.
 * Permite probar toda la pantalla de seguridad sin GPS ni permisos.
 */
export class SimulatedLocationServiceImpl implements LocationService {
  isSupported(): boolean {
    return true;
  }

  async getPermission(): Promise<LocationPermission> {
    return 'granted';
  }

  watch(
    onReading: (reading: LocationReading) => void,
    _onError?: (message: string) => void,
  ): () => void {
    const startedAt = Date.now();
    const emit = () => {
      const elapsed = (Date.now() - startedAt) / 1000;
      const progress = (elapsed % 90) / 90;
      onReading({
        position: pointAtProgress(demoRoute.points, progress),
        accuracy: 12 + Math.round(Math.sin(elapsed) * 4),
        timestamp: Date.now(),
        simulated: true,
      });
    };

    emit();
    const timer = window.setInterval(emit, 2000);
    return () => window.clearInterval(timer);
  }
}

export const BrowserLocationService = new BrowserLocationServiceImpl();
export const SimulatedLocationService = new SimulatedLocationServiceImpl();
