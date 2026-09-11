import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/client';
import type { RestaurantAccount, RestaurantAccountService, RestaurantAccountStatus } from './types';

type RestaurantAccountRow = {
  restaurant_id?: unknown;
  account_status?: unknown;
  contact_name?: unknown;
  contact_email?: unknown;
  owner_user_id?: unknown;
  invited_at?: unknown;
  activated_at?: unknown;
  notes?: unknown;
  updated_at?: unknown;
  restaurants?: { name?: unknown } | { name?: unknown }[] | null;
};

const statuses = new Set<RestaurantAccountStatus>([
  'pending_contact',
  'ready_to_invite',
  'invited',
  'active',
  'suspended',
]);

function requireClient(): SupabaseClient {
  if (!supabase) throw new Error('La gestión de cuentas requiere Supabase configurado.');
  return supabase;
}

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : value == null ? fallback : String(value);
}

function nullableText(value: unknown): string | null {
  const result = text(value).trim();
  return result || null;
}

function status(value: unknown): RestaurantAccountStatus {
  const candidate = text(value);
  return statuses.has(candidate as RestaurantAccountStatus)
    ? candidate as RestaurantAccountStatus
    : 'pending_contact';
}

function restaurantName(value: RestaurantAccountRow['restaurants']): string {
  const row = Array.isArray(value) ? value[0] : value;
  return text(row?.name, 'Restaurante sin nombre');
}

function mapRow(row: RestaurantAccountRow): RestaurantAccount {
  const restaurantId = text(row.restaurant_id);
  if (!restaurantId) throw new Error('Supabase devolvió una cuenta sin restaurante.');
  return {
    restaurantId,
    restaurantName: restaurantName(row.restaurants),
    status: status(row.account_status),
    contactName: text(row.contact_name),
    contactEmail: text(row.contact_email),
    ownerUserId: nullableText(row.owner_user_id),
    invitedAt: nullableText(row.invited_at),
    activatedAt: nullableText(row.activated_at),
    notes: text(row.notes),
    updatedAt: text(row.updated_at, new Date(0).toISOString()),
  };
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function validateContact(contactName: string, contactEmail: string): void {
  if (contactName.length > 120) throw new Error('El nombre del representante no puede superar 120 caracteres.');
  if (contactEmail && !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(contactEmail)) {
    throw new Error('Escribe un correo válido para preparar la invitación.');
  }
}

export class SupabaseRestaurantAccountService implements RestaurantAccountService {
  private readonly client: SupabaseClient;

  constructor(client: SupabaseClient = requireClient()) {
    this.client = client;
  }

  async list(): Promise<RestaurantAccount[]> {
    const { data, error } = await this.client
      .from('restaurant_account_registry')
      .select('restaurant_id, account_status, contact_name, contact_email, owner_user_id, invited_at, activated_at, notes, updated_at, restaurants(name)')
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map((row) => mapRow(row as RestaurantAccountRow));
  }

  async saveContact(input: {
    restaurantId: string;
    contactName: string;
    contactEmail: string;
    notes: string;
  }): Promise<RestaurantAccount> {
    const contactName = input.contactName.trim();
    const contactEmail = normalizeEmail(input.contactEmail);
    const notes = input.notes.trim();
    if (!input.restaurantId) throw new Error('Selecciona un restaurante.');
    validateContact(contactName, contactEmail);

    const { data: current, error: currentError } = await this.client
      .from('restaurant_account_registry')
      .select('account_status')
      .eq('restaurant_id', input.restaurantId)
      .maybeSingle();
    if (currentError) throw currentError;
    const currentStatus = status((current as RestaurantAccountRow | null)?.account_status);
    const nextStatus = currentStatus === 'pending_contact' || currentStatus === 'ready_to_invite'
      ? contactEmail ? 'ready_to_invite' : 'pending_contact'
      : currentStatus;
    const { data, error } = await this.client
      .from('restaurant_account_registry')
      .update({
        contact_name: contactName || null,
        contact_email: contactEmail || null,
        account_status: nextStatus,
        notes,
      })
      .eq('restaurant_id', input.restaurantId)
      .select('restaurant_id, account_status, contact_name, contact_email, owner_user_id, invited_at, activated_at, notes, updated_at, restaurants(name)')
      .single();
    if (error) throw error;
    return mapRow(data as RestaurantAccountRow);
  }

  async invite(restaurantId: string): Promise<RestaurantAccount> {
    if (!restaurantId) throw new Error('Selecciona un restaurante.');
    const { data, error } = await this.client.functions.invoke('invite-restaurant-owner', {
      body: { restaurantId },
    });
    if (error) throw error;
    if (data?.ok !== true) throw new Error('No se pudo enviar la invitación segura.');
    const rows = await this.list();
    const updated = rows.find((row) => row.restaurantId === restaurantId);
    if (!updated) throw new Error('La invitación se envió, pero no se pudo actualizar el estado.');
    return updated;
  }

  async activate(restaurantId: string): Promise<RestaurantAccount> {
    if (!restaurantId) throw new Error('Selecciona un restaurante.');
    const { data, error } = await this.client.functions.invoke('invite-restaurant-owner', {
      body: { restaurantId, action: 'activate' },
    });
    if (error) throw error;
    if (data?.ok !== true) throw new Error('No se pudo activar el propietario.');
    const rows = await this.list();
    const updated = rows.find((row) => row.restaurantId === restaurantId);
    if (!updated) throw new Error('Propietario activado, pero no se pudo actualizar la pantalla.');
    return updated;
  }
}
