import { STORAGE_KEYS, readLocal, writeLocal } from '@/lib/storage';
import type { SharedLocationSnapshot, SharingStatus } from '@/types';
import type { LocationSharingService } from './types';

export const SHARING_CHANNEL = 'suya-rider-location';

type Listener = (snapshot: SharedLocationSnapshot | null) => void;

/**
 * DEMO LOCAL — compartir ubicación entre pestañas del MISMO navegador.
 *
 * Usa BroadcastChannel y, como respaldo, el evento `storage` de localStorage. Esto permite
 * abrir `/rider/safety` y `/share/:token` en dos pestañas y ver la posición actualizarse.
 *
 * FUTURE: replace local implementation with realtime backend (WebSocket/WebRTC) para que el
 * enlace funcione entre dispositivos distintos.
 */
export class LocalLocationSharingServiceImpl implements LocationSharingService {
  private channel: BroadcastChannel | null = null;

  private listeners = new Set<Listener>();

  private storageBound = false;

  private get bc(): BroadcastChannel | null {
    if (typeof BroadcastChannel === 'undefined') return null;
    if (!this.channel) {
      this.channel = new BroadcastChannel(SHARING_CHANNEL);
      this.channel.onmessage = (event: MessageEvent<SharedLocationSnapshot | null>) => {
        this.emit(event.data);
      };
    }
    return this.channel;
  }

  async start(payload: { token: string; riderName: string; simulated: boolean }): Promise<void> {
    const now = Date.now();
    const snapshot: SharedLocationSnapshot = {
      token: payload.token,
      riderName: payload.riderName,
      position: null,
      accuracy: null,
      updatedAt: now,
      status: 'sharing',
      battery: this.getSnapshot()?.battery ?? 86,
      sos: false,
      startedAt: now,
      simulated: payload.simulated,
    };
    this.write(snapshot);
  }

  /**
   * Detener revoca el acceso: el enlace deja de mostrar dónde está el repartidor.
   * Se conserva solo el estado «detenido» para que el contacto entienda qué pasó,
   * nunca la última posición.
   */
  async stop(): Promise<void> {
    const current = this.getSnapshot();
    if (!current) return;
    this.write({
      ...current,
      status: 'stopped',
      position: null,
      accuracy: null,
      sos: false,
      updatedAt: Date.now(),
    });
  }

  /**
   * Genera un enlace nuevo e invalida el anterior en el mismo paso: si el token
   * cambiara solo en el panel, el enlace antiguo seguiría mostrando la ubicación.
   */
  async rotateToken(token: string): Promise<void> {
    const current = this.getSnapshot();
    if (!current) return;
    this.write({
      ...current,
      token,
      position: null,
      accuracy: null,
      startedAt: Date.now(),
      updatedAt: Date.now(),
    });
  }

  publish(partial: Partial<SharedLocationSnapshot>): void {
    const current = this.getSnapshot();
    if (!current) return;
    this.write({ ...current, ...partial, updatedAt: partial.updatedAt ?? Date.now() });
  }

  getStatus(): SharingStatus {
    return this.getSnapshot()?.status ?? 'idle';
  }

  getSnapshot(): SharedLocationSnapshot | null {
    return readLocal<SharedLocationSnapshot | null>(STORAGE_KEYS.locationShare, null);
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    void this.bc; // asegura que el canal esté abierto
    this.bindStorage();
    return () => {
      this.listeners.delete(listener);
    };
  }

  private bindStorage(): void {
    if (this.storageBound || typeof window === 'undefined') return;
    this.storageBound = true;
    window.addEventListener('storage', (event) => {
      if (event.key !== STORAGE_KEYS.locationShare) return;
      this.emit(this.getSnapshot());
    });
  }

  private write(snapshot: SharedLocationSnapshot): void {
    writeLocal(STORAGE_KEYS.locationShare, snapshot);
    this.emit(snapshot);
    this.bc?.postMessage(snapshot);
  }

  private emit(snapshot: SharedLocationSnapshot | null): void {
    this.listeners.forEach((listener) => listener(snapshot));
  }
}

export const LocalLocationSharingService = new LocalLocationSharingServiceImpl();
