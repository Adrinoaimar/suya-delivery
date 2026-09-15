import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/client';
import type { IncidentCategory } from '@/types';
import type { SafetyOperationsService } from './types';

const DB_CATEGORY: Record<IncidentCategory, string> = {
  accidente: 'accidente',
  mecanico: 'mecanico',
  cliente: 'cliente',
  'zona-insegura': 'zona_insegura',
  robo: 'robo',
  otro: 'otro',
};

function requireClient(): SupabaseClient {
  if (!supabase) throw new Error('Supabase no está configurado para seguridad operativa.');
  return supabase;
}

function normalizePosition(latitude: unknown, longitude: unknown) {
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    return null;
  }
  return { lat, lng };
}

export class SupabaseSafetyServiceImpl implements SafetyOperationsService {
  private readonly client: SupabaseClient;

  constructor(client: SupabaseClient = requireClient()) {
    this.client = client;
  }

  async publishLocation(orderId: string, reading: Parameters<SafetyOperationsService['publishLocation']>[1]) {
    if (reading.simulated) return false;
    const position = normalizePosition(reading.position.lat, reading.position.lng);
    if (!position) return false;
    const { data, error } = await this.client.rpc('publish_rider_location', {
      target_order: orderId,
      latitude: position.lat,
      longitude: position.lng,
      accuracy_meters: reading.accuracy,
    });
    if (error) throw new Error(error.message);
    return data === true;
  }

  async reportIncident(input: Parameters<SafetyOperationsService['reportIncident']>[0]) {
    const { data, error } = await this.client.rpc('report_rider_incident', {
      p_request_id: input.requestId,
      target_order: input.orderId,
      incident_category: DB_CATEGORY[input.category],
      incident_description: input.description,
      latitude: input.position?.lat ?? null,
      longitude: input.position?.lng ?? null,
      is_sos: input.sos,
    });
    if (error) throw new Error(error.message);
    if (typeof data !== 'string') throw new Error('Supabase no devolvió el incidente registrado.');
    return data;
  }

  async resolveSos(incidentId: string) {
    const { data, error } = await this.client.rpc('resolve_rider_sos', {
      target_incident: incidentId,
    });
    if (error) throw new Error(error.message);
    return data === true;
  }

  async latestLocation(orderId: string) {
    const { data, error } = await this.client.from('rider_locations')
      .select('latitude, longitude')
      .eq('order_id', orderId)
      .order('captured_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? normalizePosition(data.latitude, data.longitude) : null;
  }

  async locationHistory(orderId: string) {
    const { data, error } = await this.client.from('rider_locations')
      .select('latitude, longitude')
      .eq('order_id', orderId)
      .order('captured_at', { ascending: false })
      .limit(180);
    if (error) throw new Error(error.message);
    if (!Array.isArray(data)) return [];
    return data.flatMap((reading) => {
      const position = normalizePosition(reading.latitude, reading.longitude);
      return position ? [position] : [];
    }).reverse();
  }

  subscribeLocation(orderId: string, listener: (position: { lat: number; lng: number }) => void) {
    const channel = this.client.channel(`order-location-${orderId}-${crypto.randomUUID()}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'rider_locations', filter: `order_id=eq.${orderId}`,
      }, (payload) => {
        const position = normalizePosition(payload.new.latitude, payload.new.longitude);
        if (position) listener(position);
      })
      .subscribe();
    return () => { void this.client.removeChannel(channel); };
  }
}
