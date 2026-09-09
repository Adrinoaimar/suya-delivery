import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/client';
import type {
  CreatedWalletObserverDevice,
  WalletObservation,
  WalletObserverDevice,
  WalletObserverService,
} from './types';

type DeviceRow = {
  id?: unknown;
  device_id?: unknown;
  restaurant_id?: unknown;
  label?: unknown;
  device_label?: unknown;
  active?: unknown;
  last_seen_at?: unknown;
  device_token?: unknown;
  token?: unknown;
};

type ObservationRow = {
  id?: unknown;
  restaurant_id?: unknown;
  device_id?: unknown;
  provider?: unknown;
  sender_name?: unknown;
  sender?: unknown;
  code?: unknown;
  code_last4?: unknown;
  amount_cents?: unknown;
  amount?: unknown;
  currency?: unknown;
  observed_at?: unknown;
  verification?: unknown;
  verification_status?: unknown;
  status?: unknown;
};

function requireClient(): SupabaseClient {
  if (!supabase) throw new Error('La conexión de billeteras requiere Supabase configurado.');
  return supabase;
}

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : value == null ? fallback : String(value);
}

function nullableText(value: unknown): string | null {
  const result = text(value).trim();
  return result || null;
}

function booleanValue(value: unknown, fallback = true): boolean {
  return typeof value === 'boolean' ? value : value == null ? fallback : value === 'true';
}

function numberValue(value: unknown, fallback = 0): number {
  const result = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(result) ? result : fallback;
}

function mapDevice(row: DeviceRow): WalletObserverDevice {
  return {
    id: text(row.id ?? row.device_id),
    restaurantId: text(row.restaurant_id),
    label: text(row.label ?? row.device_label, 'Dispositivo móvil'),
    active: booleanValue(row.active),
    lastSeenAt: nullableText(row.last_seen_at),
  };
}

function mapCreatedDevice(row: DeviceRow): CreatedWalletObserverDevice {
  const device = mapDevice(row);
  const deviceToken = text(row.device_token ?? row.token);
  if (!device.id || !device.restaurantId || !deviceToken) {
    throw new Error('Supabase no devolvió las credenciales completas del dispositivo.');
  }
  return { ...device, deviceToken };
}

function mapObservation(row: ObservationRow): WalletObservation {
  const code = nullableText(row.code_last4 ?? row.code);
  const rawAmount = numberValue(row.amount_cents ?? row.amount);
  // La tabla usa céntimos; el fallback de amount permite leer instalaciones antiguas
  // que todavía expongan el monto en soles.
  const amountCents = row.amount_cents == null ? Math.round(rawAmount * 100) : Math.round(rawAmount);
  return {
    id: text(row.id),
    restaurantId: text(row.restaurant_id),
    deviceId: nullableText(row.device_id),
    provider: text(row.provider, 'billetera'),
    senderName: nullableText(row.sender_name ?? row.sender),
    codeLast4: code ? code.slice(-4) : null,
    amountCents,
    currency: text(row.currency, 'PEN'),
    observedAt: text(row.observed_at, new Date(0).toISOString()),
    verification: text(row.verification_status ?? row.verification ?? row.status, 'unverified'),
  };
}

export class SupabaseWalletObserverService implements WalletObserverService {
  private readonly client: SupabaseClient;

  constructor(client: SupabaseClient = requireClient()) {
    this.client = client;
  }

  async listDevices(restaurantIds: string[]): Promise<WalletObserverDevice[]> {
    if (restaurantIds.length === 0) return [];
    const responses = await Promise.all(restaurantIds.map(async (restaurantId) => {
      const { data, error } = await this.client.rpc('list_wallet_observer_devices', {
        p_restaurant_id: restaurantId,
      });
      if (error) throw error;
      return (Array.isArray(data) ? data : []).map((row) => ({
        ...(row as DeviceRow),
        restaurant_id: restaurantId,
      }));
    }));
    return responses.flat().map((row) => mapDevice(row));
  }

  async createDevice(restaurantId: string, label: string): Promise<CreatedWalletObserverDevice> {
    if (!restaurantId) throw new Error('Selecciona un restaurante.');
    if (!label.trim()) throw new Error('Escribe un nombre para el dispositivo.');
    const { data, error } = await this.client.rpc('create_wallet_observer_device', {
      p_restaurant_id: restaurantId,
      p_label: label.trim(),
    });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    return mapCreatedDevice({
      ...((row ?? {}) as DeviceRow),
      restaurant_id: restaurantId,
      label: (row as DeviceRow | null)?.label ?? (row as DeviceRow | null)?.device_label,
    });
  }

  async listObservations(restaurantIds: string[]): Promise<WalletObservation[]> {
    if (restaurantIds.length === 0) return [];
    const { data, error } = await this.client
      .from('wallet_observations')
      .select('id, restaurant_id, device_id, provider, sender_name, code_last4, amount_cents, currency, observed_at, verification_status')
      .in('restaurant_id', restaurantIds)
      .order('observed_at', { ascending: false })
      .limit(100);
    if (error) throw error;
    return (data ?? []).map((row) => mapObservation(row as ObservationRow));
  }
}
