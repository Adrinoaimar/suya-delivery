import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/client';
import type {
  InviteRestaurantRiderInput,
  ManagedRiderStatus,
  RestaurantRider,
  RestaurantRiderService,
} from './types';

type RiderRow = {
  rider_id?: unknown;
  email?: unknown;
  display_name?: unknown;
  phone?: unknown;
  status?: unknown;
  verified_at?: unknown;
  vehicle_type?: unknown;
  vehicle_color?: unknown;
  vehicle_plate?: unknown;
  rating?: unknown;
  deliveries?: unknown;
  active?: unknown;
  created_at?: unknown;
};

const statuses = new Set<ManagedRiderStatus>(['offline', 'available', 'busy', 'suspended']);

function requireClient(): SupabaseClient {
  if (!supabase) throw new Error('La gestión de repartidores requiere Supabase configurado.');
  return supabase;
}

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : value == null ? fallback : String(value);
}

function nullableText(value: unknown): string | null {
  const result = text(value).trim();
  return result || null;
}

function numberValue(value: unknown, fallback = 0): number {
  const result = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(result) ? result : fallback;
}

function status(value: unknown): ManagedRiderStatus {
  const candidate = text(value);
  return statuses.has(candidate as ManagedRiderStatus)
    ? (candidate as ManagedRiderStatus)
    : 'offline';
}

function mapRider(row: RiderRow): RestaurantRider {
  const id = text(row.rider_id);
  if (!id) throw new Error('Supabase devolvió un repartidor sin identidad.');
  return {
    id,
    email: text(row.email),
    name: text(row.display_name, 'Repartidor'),
    phone: text(row.phone),
    status: status(row.status),
    verifiedAt: nullableText(row.verified_at),
    vehicleType: text(row.vehicle_type),
    vehicleColor: text(row.vehicle_color),
    vehiclePlate: text(row.vehicle_plate),
    rating: numberValue(row.rating, 5),
    deliveries: Math.max(0, Math.trunc(numberValue(row.deliveries))),
    active: row.active !== false && row.active !== 'false',
    createdAt: text(row.created_at, new Date(0).toISOString()),
  };
}

function validateInput(input: InviteRestaurantRiderInput): InviteRestaurantRiderInput {
  const normalized = {
    ...input,
    restaurantId: input.restaurantId.trim(),
    email: input.email.trim().toLowerCase(),
    displayName: input.displayName.trim(),
    phone: input.phone.trim(),
    vehicleType: input.vehicleType.trim(),
    vehicleColor: input.vehicleColor.trim(),
    vehiclePlate: input.vehiclePlate.trim().toUpperCase(),
  };
  if (!normalized.restaurantId) throw new Error('No hay un restaurante asignado a esta cuenta.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized.email))
    throw new Error('Escribe un correo válido.');
  if (normalized.displayName.length < 2) throw new Error('Escribe el nombre del repartidor.');
  return normalized;
}

export class SupabaseRestaurantRiderService implements RestaurantRiderService {
  private readonly client: SupabaseClient;

  constructor(client: SupabaseClient = requireClient()) {
    this.client = client;
  }

  async list(restaurantId: string): Promise<RestaurantRider[]> {
    if (!restaurantId) return [];
    const { data, error } = await this.client.rpc('list_restaurant_riders', {
      target_restaurant: restaurantId,
    });
    if (error) throw error;
    return (Array.isArray(data) ? data : []).map((row) => mapRider(row as RiderRow));
  }

  async invite(input: InviteRestaurantRiderInput): Promise<RestaurantRider> {
    const payload = validateInput(input);
    const { data, error } = await this.client.functions.invoke('invite-restaurant-rider', {
      body: payload,
    });
    if (error) throw error;
    if (data?.ok !== true || typeof data.riderId !== 'string') {
      throw new Error(
        typeof data?.error === 'string' ? data.error : 'No se pudo invitar al repartidor.',
      );
    }
    const riders = await this.list(payload.restaurantId);
    const created = riders.find((rider) => rider.id === data.riderId);
    if (!created) throw new Error('La invitación se envió, pero no se pudo actualizar la lista.');
    return created;
  }

  async setActive(restaurantId: string, riderId: string, active: boolean): Promise<boolean> {
    const { data, error } = await this.client.rpc('set_restaurant_rider_active', {
      target_restaurant: restaurantId,
      target_rider: riderId,
      next_active: active,
    });
    if (error) throw error;
    return data === true;
  }
}
