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

export class SupabaseSafetyServiceImpl implements SafetyOperationsService {
  private readonly client: SupabaseClient;

  constructor(client: SupabaseClient = requireClient()) {
    this.client = client;
  }

  async publishLocation(orderId: string, reading: Parameters<SafetyOperationsService['publishLocation']>[1]) {
    if (reading.simulated) return false;
    const { data, error } = await this.client.rpc('publish_rider_location', {
      target_order: orderId,
      latitude: reading.position.lat,
      longitude: reading.position.lng,
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
}
