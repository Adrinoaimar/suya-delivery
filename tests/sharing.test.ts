import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalLocationSharingServiceImpl } from '@/lib/services/LocalLocationSharingService';
import { STORAGE_KEYS, readLocal } from '@/lib/storage';
import type { SharedLocationSnapshot } from '@/types';

/** Mock de BroadcastChannel: jsdom no siempre lo expone. */
class FakeBroadcastChannel {
  static instances: FakeBroadcastChannel[] = [];

  onmessage: ((event: MessageEvent) => void) | null = null;

  posted: unknown[] = [];

  name: string;

  constructor(name: string) {
    this.name = name;
    FakeBroadcastChannel.instances.push(this);
  }

  postMessage(data: unknown) {
    this.posted.push(data);
    FakeBroadcastChannel.instances
      .filter((channel) => channel !== this && channel.name === this.name)
      .forEach((channel) => channel.onmessage?.({ data } as MessageEvent));
  }

  close() {
    /* noop */
  }
}

describe('compartir ubicación (demo local)', () => {
  beforeEach(() => {
    FakeBroadcastChannel.instances = [];
    vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel);
  });

  it('empieza sin compartir', () => {
    const service = new LocalLocationSharingServiceImpl();
    expect(service.getStatus()).toBe('idle');
    expect(service.getSnapshot()).toBeNull();
  });

  it('guarda el estado al iniciar y avisa a los suscriptores', async () => {
    const service = new LocalLocationSharingServiceImpl();
    const listener = vi.fn();
    service.subscribe(listener);

    await service.start({ token: 'demo-ABC1234', riderName: 'Carlos Ramírez', simulated: true });

    expect(service.getStatus()).toBe('sharing');
    expect(listener).toHaveBeenCalled();

    const stored = readLocal<SharedLocationSnapshot | null>(STORAGE_KEYS.locationShare, null);
    expect(stored?.token).toBe('demo-ABC1234');
    expect(stored?.riderName).toBe('Carlos Ramírez');
    expect(stored?.simulated).toBe(true);
  });

  it('publica posiciones sucesivas conservando el token', async () => {
    const service = new LocalLocationSharingServiceImpl();
    await service.start({ token: 'demo-XYZ0001', riderName: 'Lucía Cornejo', simulated: false });

    service.publish({ position: { lat: -4.8941, lng: -80.6899 }, accuracy: 12 });

    const snapshot = service.getSnapshot();
    expect(snapshot?.position).toEqual({ lat: -4.8941, lng: -80.6899 });
    expect(snapshot?.accuracy).toBe(12);
    expect(snapshot?.token).toBe('demo-XYZ0001');
    expect(snapshot?.status).toBe('sharing');
  });

  it('propaga los cambios a otra pestaña por BroadcastChannel', async () => {
    const emisor = new LocalLocationSharingServiceImpl();
    const receptor = new LocalLocationSharingServiceImpl();
    const listener = vi.fn();
    receptor.subscribe(listener);

    await emisor.start({ token: 'demo-TAB1234', riderName: 'Carlos Ramírez', simulated: true });
    emisor.publish({ position: { lat: -4.89, lng: -80.69 } });

    const received = listener.mock.calls.at(-1)?.[0] as SharedLocationSnapshot;
    expect(received.token).toBe('demo-TAB1234');
    expect(received.position).toEqual({ lat: -4.89, lng: -80.69 });
  });

  it('marca el SOS y luego lo desactiva', async () => {
    const service = new LocalLocationSharingServiceImpl();
    await service.start({ token: 'demo-SOS9999', riderName: 'José Palacios', simulated: true });

    service.publish({ sos: true });
    expect(service.getSnapshot()?.sos).toBe(true);

    service.publish({ sos: false });
    expect(service.getSnapshot()?.sos).toBe(false);
  });

  it('detiene el envío y deja el estado en «stopped»', async () => {
    const service = new LocalLocationSharingServiceImpl();
    await service.start({ token: 'demo-STOP111', riderName: 'Carlos Ramírez', simulated: true });

    await service.stop();

    expect(service.getStatus()).toBe('stopped');
  });
});
