import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { SupabaseSafetyServiceImpl } from '@/lib/services/SupabaseSafetyService';

function clientWith(data: unknown = true, error: { message: string } | null = null) {
  const rpc = vi.fn(async () => ({ data, error }));
  return { client: { rpc } as unknown as SupabaseClient, rpc };
}

function locationClientWith(data: unknown, error: { message: string } | null = null) {
  const limit = vi.fn(async () => ({ data, error }));
  const order = vi.fn(() => ({ limit }));
  const eq = vi.fn(() => ({ order }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  return { client: { from } as unknown as SupabaseClient, from, select, eq, order, limit };
}

function latestLocationClientWith(data: unknown, error: { message: string } | null = null) {
  const maybeSingle = vi.fn(async () => ({ data, error }));
  const limit = vi.fn(() => ({ maybeSingle }));
  const order = vi.fn(() => ({ limit }));
  const eq = vi.fn(() => ({ order }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  return { client: { from } as unknown as SupabaseClient, maybeSingle };
}

describe('SupabaseSafetyServiceImpl', () => {
  it('no publica lecturas simuladas', async () => {
    const { client, rpc } = clientWith();
    const service = new SupabaseSafetyServiceImpl(client);
    await expect(service.publishLocation('order-1', {
      position: { lat: -4.89, lng: -80.69 }, accuracy: 10, timestamp: 1, simulated: true,
    })).resolves.toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('publica GPS mediante RPC sin aceptar rider ni hora del cliente', async () => {
    const { client, rpc } = clientWith();
    const service = new SupabaseSafetyServiceImpl(client);
    await expect(service.publishLocation('order-1', {
      position: { lat: -4.89, lng: -80.69 }, accuracy: 10, timestamp: 123, simulated: false,
    })).resolves.toBe(true);
    expect(rpc).toHaveBeenCalledWith('publish_rider_location', {
      target_order: 'order-1', latitude: -4.89, longitude: -80.69, accuracy_meters: 10,
    });
  });

  it('descarta coordenadas fuera de rango antes de publicarlas', async () => {
    const { client, rpc } = clientWith();
    await expect(new SupabaseSafetyServiceImpl(client).publishLocation('order-1', {
      position: { lat: 91, lng: -80.69 }, accuracy: 10, timestamp: 123, simulated: false,
    })).resolves.toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('traduce categoría UI y conserva idempotencia del incidente', async () => {
    const { client, rpc } = clientWith('incident-1');
    const service = new SupabaseSafetyServiceImpl(client);
    await expect(service.reportIncident({
      requestId: 'request-1', orderId: 'order-1', category: 'zona-insegura',
      description: 'Zona sin iluminación', position: null, sos: false,
    })).resolves.toBe('incident-1');
    expect(rpc).toHaveBeenCalledWith('report_rider_incident', {
      p_request_id: 'request-1', target_order: 'order-1', incident_category: 'zona_insegura',
      incident_description: 'Zona sin iluminación', latitude: null, longitude: null, is_sos: false,
    });
  });

  it('cierra SOS mediante RPC autorizada', async () => {
    const { client, rpc } = clientWith(true);
    await expect(new SupabaseSafetyServiceImpl(client).resolveSos('incident-1')).resolves.toBe(true);
    expect(rpc).toHaveBeenCalledWith('resolve_rider_sos', { target_incident: 'incident-1' });
  });

  it('carga solo coordenadas válidas del historial reciente del pedido', async () => {
    const query = locationClientWith([
      { latitude: '-4.8910', longitude: '-80.6910' },
      { latitude: '-4.8900', longitude: '-80.6900' },
      { latitude: 91, longitude: -80.692 },
    ]);
    const service = new SupabaseSafetyServiceImpl(query.client);

    await expect(service.locationHistory('order-1')).resolves.toEqual([
      { lat: -4.89, lng: -80.69 },
      { lat: -4.891, lng: -80.691 },
    ]);
    expect(query.from).toHaveBeenCalledWith('rider_locations');
    expect(query.select).toHaveBeenCalledWith('latitude, longitude');
    expect(query.eq).toHaveBeenCalledWith('order_id', 'order-1');
    expect(query.order).toHaveBeenCalledWith('captured_at', { ascending: false });
    expect(query.limit).toHaveBeenCalledWith(180);
  });

  it('no entrega al mapa una última posición fuera de rango', async () => {
    const query = latestLocationClientWith({ latitude: 91, longitude: -80.692 });
    await expect(new SupabaseSafetyServiceImpl(query.client).latestLocation('order-1')).resolves.toBeNull();
  });
});
