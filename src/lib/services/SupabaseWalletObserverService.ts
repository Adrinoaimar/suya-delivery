import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/client';
import type {
  CreatedWalletObserverDevice,
  WalletObservation,
  WalletObserverDevice,
  WalletObserverService,
  WalletPaymentCandidate,
  RestaurantPaymentAccount,
} from './types';

type DeviceRow = {
  id?: unknown;
  device_id?: unknown;
  restaurant_id?: unknown;
  label?: unknown;
  device_label?: unknown;
  active?: unknown;
  device_active?: unknown;
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

type CandidateRow = {
  payment_attempt_id?: unknown;
  order_id?: unknown;
  order_code?: unknown;
  customer_name?: unknown;
  checkout_reference?: unknown;
  method?: unknown;
  amount?: unknown;
  created_at?: unknown;
  expires_at?: unknown;
  sender_name?: unknown;
};

type PaymentAccountRow = {
  id?: unknown;
  restaurant_id?: unknown;
  provider?: unknown;
  account_label?: unknown;
  qr_payload?: unknown;
  active?: unknown;
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
    active: booleanValue(row.active ?? row.device_active),
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
  const amountCents =
    row.amount_cents == null ? Math.round(rawAmount * 100) : Math.round(rawAmount);
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
    const responses = await Promise.all(
      restaurantIds.map(async (restaurantId) => {
        const { data, error } = await this.client.rpc('list_wallet_observer_devices', {
          p_restaurant_id: restaurantId,
        });
        if (error) throw error;
        return (Array.isArray(data) ? data : []).map((row) => ({
          ...(row as DeviceRow),
          restaurant_id: restaurantId,
        }));
      }),
    );
    return responses.flat().map((row) => mapDevice(row));
  }

  async createDevice(
    restaurantId: string,
    label: string,
    receiverAccountId?: string | null,
  ): Promise<CreatedWalletObserverDevice> {
    if (!restaurantId) throw new Error('Selecciona un restaurante.');
    if (!label.trim()) throw new Error('Escribe un nombre para el dispositivo.');
    const rpcName = receiverAccountId
      ? 'create_wallet_observer_device_for_account'
      : 'create_wallet_observer_device';
    const { data, error } = await this.client.rpc(rpcName, receiverAccountId
      ? {
          p_restaurant_id: restaurantId,
          p_receiver_account_id: receiverAccountId,
          p_label: label.trim(),
        }
      : { p_restaurant_id: restaurantId, p_label: label.trim() });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    return mapCreatedDevice({
      ...((row ?? {}) as DeviceRow),
      restaurant_id: restaurantId,
      label: (row as DeviceRow | null)?.label ?? (row as DeviceRow | null)?.device_label,
    });
  }

  async setDeviceActive(deviceId: string, active: boolean): Promise<boolean> {
    if (!deviceId) throw new Error('Selecciona un dispositivo.');
    const { data, error } = await this.client.rpc('set_wallet_observer_device_active', {
      p_device_id: deviceId,
      p_active: active,
    });
    if (error) throw new Error(error.message);
    return data === true;
  }

  async rotateDevice(deviceId: string): Promise<CreatedWalletObserverDevice> {
    if (!deviceId) throw new Error('Selecciona un dispositivo.');
    const { data, error } = await this.client.rpc('rotate_wallet_observer_device', {
      p_device_id: deviceId,
    });
    if (error) throw new Error(error.message);
    const row = Array.isArray(data) ? data[0] : data;
    return mapCreatedDevice((row ?? {}) as DeviceRow);
  }

  async listObservations(restaurantIds: string[]): Promise<WalletObservation[]> {
    if (restaurantIds.length === 0) return [];
    const { data, error } = await this.client
      .from('wallet_observations')
      .select(
        'id, restaurant_id, device_id, provider, sender_name, code_last4, amount_cents, currency, observed_at, verification_status',
      )
      .in('restaurant_id', restaurantIds)
      .order('observed_at', { ascending: false })
      .limit(100);
    if (error) throw error;
    return (data ?? []).map((row) => mapObservation(row as ObservationRow));
  }

  async listPaymentCandidates(observationId: string): Promise<WalletPaymentCandidate[]> {
    const { data, error } = await this.client.rpc('list_wallet_payment_candidates', {
      p_observation_id: observationId,
    });
    if (error) throw new Error(error.message);
    return (Array.isArray(data) ? data : []).flatMap((row) => {
      const candidate = row as CandidateRow;
      if (
        typeof candidate.payment_attempt_id !== 'string' ||
        typeof candidate.order_id !== 'string' ||
        typeof candidate.order_code !== 'string' ||
        typeof candidate.checkout_reference !== 'string'
      )
        return [];
      return [
        {
          paymentAttemptId: candidate.payment_attempt_id,
          orderId: candidate.order_id,
          orderCode: candidate.order_code,
          customerName: text(candidate.customer_name, 'Cliente'),
          checkoutReference: candidate.checkout_reference,
          method: candidate.method === 'lemon' ? 'lemon' : 'yape',
          amount: numberValue(candidate.amount),
          createdAt: text(candidate.created_at),
          expiresAt: text(candidate.expires_at),
          senderName: nullableText(candidate.sender_name),
        },
      ];
    });
  }

  async setObservationCode(observationId: string, code: string): Promise<boolean> {
    const normalized = code.trim();
    if (!observationId || !/^[a-z0-9-]{3,64}$/iu.test(normalized)) {
      throw new Error('Escribe un código de operación válido.');
    }
    const { data, error } = await this.client.rpc('set_wallet_observation_code', {
      p_observation_id: observationId,
      p_code: normalized,
    });
    if (error) throw new Error(error.message);
    return data === true;
  }

  async verifyObservation(observationId: string, paymentAttemptId: string): Promise<boolean> {
    const { data, error } = await this.client.rpc('verify_wallet_payment', {
      p_observation_id: observationId,
      p_payment_attempt_id: paymentAttemptId,
    });
    if (error) throw new Error(error.message);
    return data === true;
  }

  async listPaymentAccounts(restaurantId: string): Promise<RestaurantPaymentAccount[]> {
    if (!restaurantId) return [];
    const { data, error } = await this.client.rpc('list_restaurant_payment_accounts', {
      p_restaurant_id: restaurantId,
    });
    if (error) throw new Error(error.message);
    return (Array.isArray(data) ? data : []).flatMap((row) => {
      const account = row as PaymentAccountRow;
      if (typeof account.id !== 'string' || typeof account.provider !== 'string') return [];
      return [
        {
          id: account.id,
          restaurantId: text(account.restaurant_id, restaurantId),
          provider: account.provider === 'lemon' ? 'lemon' : 'yape',
          accountLabel: text(account.account_label, 'Cuenta digital'),
          qrPayload: nullableText(account.qr_payload),
          active: booleanValue(account.active, false),
        },
      ];
    });
  }

  async savePaymentAccount(input: {
    restaurantId: string;
    provider: 'yape' | 'lemon';
    accountLabel: string;
    qrPayload: string | null;
    active: boolean;
  }): Promise<RestaurantPaymentAccount> {
    const { data, error } = await this.client.rpc('upsert_restaurant_payment_account', {
      p_restaurant_id: input.restaurantId,
      p_provider: input.provider,
      p_account_label: input.accountLabel.trim(),
      p_qr_payload: input.qrPayload?.trim() || null,
      p_active: input.active,
    });
    if (error) throw new Error(error.message);
    const row = (Array.isArray(data) ? data[0] : data) as PaymentAccountRow | null;
    if (!row || typeof row.id !== 'string')
      throw new Error('Supabase no devolvió la cuenta de pago.');
    return {
      id: row.id,
      restaurantId: text(row.restaurant_id, input.restaurantId),
      provider: row.provider === 'lemon' ? 'lemon' : 'yape',
      accountLabel: text(row.account_label, input.accountLabel),
      qrPayload: nullableText(row.qr_payload),
      active: booleanValue(row.active, input.active),
    };
  }
}
