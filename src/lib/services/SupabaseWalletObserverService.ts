import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/client';
import type {
  CreatedWalletObserverDevice,
  WalletObserverPairing,
  WalletObservation,
  WalletObserverDevice,
  WalletObserverService,
  WalletObserverRoute,
  WalletObserverRouteAction,
  WalletPaymentCandidate,
  RestaurantPaymentAccount,
  WalletObservationOrigin,
  GatewayConfigRecord,
  SaveGatewayConfigRecordInput,
  PaymentReconciliationExceptionItem,
  ExpiredWalletClaim,
} from './types';

type DeviceRow = {
  id?: unknown;
  device_id?: unknown;
  restaurant_id?: unknown;
  label?: unknown;
  device_label?: unknown;
  active?: unknown;
  device_active?: unknown;
  auto_settle_orders?: unknown;
  last_seen_at?: unknown;
  device_token?: unknown;
  token?: unknown;
};

type PairingRow = {
  pairing_id?: unknown;
  pairing_code?: unknown;
  expires_at?: unknown;
  restaurant_id?: unknown;
  receiver_account_id?: unknown;
  device_label?: unknown;
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
  created_at?: unknown;
  verification?: unknown;
  verification_status?: unknown;
  status?: unknown;
  origin_metadata?: unknown;
  observer_route_id?: unknown;
};

type CandidateRow = {
  payment_attempt_id?: unknown;
  order_id?: unknown;
  order_code?: unknown;
  restaurant_name?: unknown;
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

function nullableNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

function mapObservationOrigin(value: unknown): WalletObservationOrigin {
  const source = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  return {
    packageName: nullableText(source.packageName),
    appLabel: nullableText(source.appLabel),
    channelId: nullableText(source.channelId),
    category: nullableText(source.category),
    groupKey: nullableText(source.groupKey),
    tag: nullableText(source.tag),
    notificationId: nullableNumber(source.notificationId),
    flags: nullableNumber(source.flags),
    contentFingerprint: nullableText(source.contentFingerprint),
    operationKind: nullableText(source.operationKind),
    notificationWhen: nullableText(source.notificationWhen),
  };
}

function mapDevice(row: DeviceRow): WalletObserverDevice {
  return {
    id: text(row.id ?? row.device_id),
    restaurantId: text(row.restaurant_id),
    label: text(row.label ?? row.device_label, 'Dispositivo móvil'),
    active: booleanValue(row.active ?? row.device_active),
    autoSettleOrders: booleanValue(row.auto_settle_orders, false),
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

function mapPairing(row: PairingRow): WalletObserverPairing {
  const pairing = {
    pairingId: text(row.pairing_id),
    pairingCode: text(row.pairing_code).toUpperCase(),
    expiresAt: text(row.expires_at),
    restaurantId: text(row.restaurant_id),
    receiverAccountId: text(row.receiver_account_id),
    deviceLabel: text(row.device_label, 'Dispositivo móvil'),
  };
  if (!pairing.pairingId || !/^[A-F0-9]{8}$/.test(pairing.pairingCode) || !pairing.expiresAt) {
    throw new Error('Supabase no devolvió un código de emparejamiento válido.');
  }
  return pairing;
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
    receivedAt: nullableText(row.created_at),
    verification: text(row.verification_status ?? row.verification ?? row.status, 'unverified'),
    observerRouted: Boolean(row.observer_route_id),
    origin: mapObservationOrigin(row.origin_metadata),
  };
}

export class SupabaseWalletObserverService implements WalletObserverService {
  private readonly client: SupabaseClient;

  constructor(client: SupabaseClient = requireClient()) {
    this.client = client;
  }

  async listExpiredWalletClaims(restaurantId: string): Promise<ExpiredWalletClaim[]> {
    const { data, error } = await this.client.rpc('list_expired_wallet_qr_claims', { p_restaurant_id: restaurantId });
    if (error) throw new Error(error.message);
    return (data ?? []).map((row: Record<string, unknown>) => ({
      attemptId: text(row.attempt_id), orderCode: text(row.order_code),
      restaurantName: nullableText(row.restaurant_name),
      method: row.method === 'lemon' ? 'lemon' : 'yape', amount: Number(row.amount),
      payerName: text(row.payer_name), receiptReference: text(row.receipt_reference) || null,
      reportedAt: text(row.reported_at),
    }));
  }

  async reviewExpiredWalletClaim(restaurantId: string, attemptId: string): Promise<boolean> {
    const { data, error } = await this.client.rpc('review_expired_wallet_qr_claim', {
      p_restaurant_id: restaurantId, p_payment_attempt_id: attemptId,
    });
    if (error) throw new Error(error.message);
    return data === true;
  }

  async listObserverRoutes(restaurantId: string): Promise<WalletObserverRoute[]> {
    const { data, error } = await this.client.rpc('list_wallet_observer_routes', {
      p_restaurant_id: restaurantId,
    });
    if (error) throw new Error(error.message);
    return (Array.isArray(data) ? data : []).map((row: Record<string, unknown>) => ({
      priority: Number(row.priority),
      provider: row.provider === 'lemon' ? 'lemon' : 'yape',
      deviceId: nullableText(row.device_id),
      heartbeatAt: nullableText(row.heartbeat_at),
      autoSettle: row.auto_settle === true,
      recipient: nullableText(row.recipient),
      qrPayload: nullableText(row.qr_payload),
      version: nullableText(row.version),
      phone: nullableText(row.phone),
      centralCollectorName: nullableText(row.central_collector_name),
      enabled: row.enabled === true,
      checkoutEnabled: row.checkout_enabled === true,
      health: text(row.health),
    }));
  }

  async changeObserverRoute(restaurantId: string, action: WalletObserverRouteAction): Promise<string | null> {
    const scope = { p_restaurant_id: restaurantId };
    const invoke = (rpc: string, params: Record<string, unknown>) =>
      this.client.rpc(rpc, { ...scope, ...params });
    const response = await (() => {
      switch (action.kind) {
        case 'save':
          return invoke('save_wallet_observer_route_with_phone', {
            p_priority: action.priority, p_provider: action.provider,
            p_recipient: action.recipient, p_qr_payload: action.qrPayload,
            p_expected_version: action.expectedVersion, p_phone: action.phone,
          });
        case 'enable':
          return invoke('set_wallet_observer_route_enabled', {
            p_priority: action.route.priority, p_provider: action.route.provider,
            p_version: action.route.version, p_enabled: action.enabled,
          });
        case 'bind':
          return invoke('bind_wallet_observer_slot', {
            p_priority: action.priority, p_device_id: action.deviceId,
          });
        case 'pair':
          return invoke('create_routed_wallet_observer_pairing', {
            p_priority: action.priority, p_label: action.label,
          });
        case 'checkout':
          return invoke('set_wallet_observer_checkout', { p_enabled: action.enabled });
      }
    })();
    if (response.error) throw new Error(response.error.message);
    return action.kind === 'pair' ? nullableText(response.data?.[0]?.pairing_code) : null;
  }

  async verifyRoutedObservation(observationId: string, paymentAttemptId: string): Promise<boolean> {
    const { data, error } = await this.client.rpc('verify_routed_wallet_payment', {
      p_observation_id: observationId, p_payment_attempt_id: paymentAttemptId,
    });
    if (error) throw new Error(error.message);
    return data === true;
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

  async createPairing(
    restaurantId: string,
    label: string,
    receiverAccountId: string,
  ): Promise<WalletObserverPairing> {
    if (!restaurantId) throw new Error('Selecciona un restaurante.');
    if (!receiverAccountId) throw new Error('Selecciona la cuenta receptora.');
    if (!label.trim()) throw new Error('Escribe un nombre para el dispositivo.');
    const { data, error } = await this.client.rpc('create_wallet_observer_pairing', {
      p_restaurant_id: restaurantId,
      p_receiver_account_id: receiverAccountId,
      p_label: label.trim(),
    });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    return mapPairing((row ?? {}) as PairingRow);
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
    const { data, error } = await this.client.rpc(
      rpcName,
      receiverAccountId
        ? {
            p_restaurant_id: restaurantId,
            p_receiver_account_id: receiverAccountId,
            p_label: label.trim(),
          }
        : { p_restaurant_id: restaurantId, p_label: label.trim() },
    );
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

  async setDeviceAutoSettle(deviceId: string, enabled: boolean): Promise<boolean> {
    if (!deviceId) throw new Error('Selecciona un dispositivo.');
    const { data, error } = await this.client.rpc('set_wallet_observer_device_auto_settle', {
      p_device_id: deviceId,
      p_enabled: enabled,
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
    const baseColumns =
      'id, restaurant_id, device_id, provider, sender_name, code_last4, amount_cents, currency, observed_at, created_at, verification_status';
    const withOrigin = await this.client
      .from('wallet_observations')
      .select(`${baseColumns}, origin_metadata, observer_route_id`)
      .in('restaurant_id', restaurantIds)
      .order('observed_at', { ascending: false })
      .limit(100);
    if (!withOrigin.error) {
      const observations = (withOrigin.data ?? []).map((row) => mapObservation(row as ObservationRow));
      const resolved = observations.filter((row) => row.observerRouted && row.verification === 'verified').map((row) => row.id);
      if (resolved.length === 0) return observations;

      const { data, error } = await this.client.rpc('list_wallet_observation_orders', { p_observation_ids: resolved });
      if (error) return observations;
      const attributed = new Map<string, NonNullable<WalletObservation['attributedOrder']>>();
      for (const row of Array.isArray(data) ? data : []) {
        if (typeof row.observation_id === 'string' && typeof row.order_code === 'string' && typeof row.restaurant_name === 'string') {
          attributed.set(row.observation_id, { code: row.order_code, restaurantName: row.restaurant_name });
        }
      }
      return observations.map((row) => ({ ...row, attributedOrder: attributed.get(row.id) }));
    }

    // Durante el rollout puede existir un panel actualizado contra un proyecto
    // cuya migración todavía no fue aplicada. En ese caso conservamos la lectura
    // histórica y mostramos el origen vacío hasta que la columna esté disponible.
    const missingOriginColumn = /observer_route_id|origin_metadata|column .* does not exist|PGRST204/i.test(
      withOrigin.error.message,
    );
    if (!missingOriginColumn) throw withOrigin.error;

    const legacy = await this.client
      .from('wallet_observations')
      .select(baseColumns)
      .in('restaurant_id', restaurantIds)
      .order('observed_at', { ascending: false })
      .limit(100);
    if (legacy.error) throw legacy.error;
    return (legacy.data ?? []).map((row) => mapObservation(row as ObservationRow));
  }

  async listPaymentCandidates(observationId: string): Promise<WalletPaymentCandidate[]> {
    const { data, error } = await this.client.rpc('list_wallet_payment_candidates_with_store', {
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
          restaurantName: nullableText(candidate.restaurant_name) ?? undefined,
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

  async verifyObservationByName(observationId: string, payerName: string): Promise<boolean> {
    const normalizedName = payerName.trim();
    if (!observationId || normalizedName.length < 2 || normalizedName.length > 120) {
      throw new Error('Escribe el nombre completo del pagador.');
    }
    const { data, error } = await this.client.rpc('verify_wallet_payment_by_name', {
      p_observation_id: observationId,
      p_payer_name: normalizedName,
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

  async listGatewayConfigs(restaurantId: string): Promise<GatewayConfigRecord[]> {
    if (!restaurantId) return [];
    const { data, error } = await this.client.rpc('list_payment_gateway_configs', {
      p_restaurant_id: restaurantId,
    });
    if (error) throw new Error(error.message);
    return (Array.isArray(data) ? data : []).map((raw) => {
      const row = raw as Record<string, unknown>;
      const providerRaw = text(row.provider, 'mercado_pago');
      const provider = (
        ['mercado_pago', 'taypi_qr', 'culqi', 'izipay', 'static_qr'].includes(providerRaw)
          ? providerRaw
          : 'mercado_pago'
      ) as GatewayConfigRecord['provider'];
      const envRaw = text(row.environment, 'sandbox');
      const connRaw = text(row.connection_status, 'untested');
      return {
        id: text(row.id),
        restaurantId: text(row.restaurant_id, restaurantId),
        provider,
        environment: envRaw === 'production' ? 'production' : 'sandbox',
        active: booleanValue(row.active, false),
        verificationMode:
          row.verification_mode === 'assisted_manual'
            ? 'assisted_manual'
            : 'automatic_cloud',
        accountLabel: text(row.account_label, 'Cuenta principal'),
        publicKey: nullableText(row.public_key),
        merchantCode: nullableText(row.merchant_code),
        qrPayload: nullableText(row.qr_payload),
        hasSecretKey: booleanValue(row.has_secret_key, false),
        secretKeyLast4: nullableText(row.secret_key_last4),
        hasWebhookSecret: booleanValue(row.has_webhook_secret, false),
        webhookSecretLast4: nullableText(row.webhook_secret_last4),
        connectionStatus:
          connRaw === 'connected' || connRaw === 'failed' ? connRaw : 'untested',
        lastVerifiedAt: nullableText(row.last_verified_at),
        lastSafeTestPassed: booleanValue(row.last_safe_test_passed, false),
        lastSafeTestAt: nullableText(row.last_safe_test_at),
        updatedAt: text(row.updated_at, new Date().toISOString()),
      };
    });
  }

  async saveGatewayConfig(input: SaveGatewayConfigRecordInput): Promise<GatewayConfigRecord> {
    const { data, error } = await this.client.rpc('upsert_payment_gateway_config', {
      p_restaurant_id: input.restaurantId,
      p_provider: input.provider,
      p_environment: input.environment,
      p_account_label: input.accountLabel.trim(),
      p_public_key: input.publicKey?.trim() || null,
      p_secret_key: input.secretKey?.trim() || null,
      p_webhook_secret: input.webhookSecret?.trim() || null,
      p_merchant_code: input.merchantCode?.trim() || null,
      p_qr_payload: input.qrPayload?.trim() || null,
      p_active: input.active,
    });
    if (error) throw new Error(error.message);
    const rows = Array.isArray(data) ? data : data ? [data] : [];
    const first = rows[0] as Record<string, unknown> | undefined;
    if (!first) throw new Error('Supabase no devolvió la configuración guardada.');
    const list = await this.listGatewayConfigs(input.restaurantId);
    const matched = list.find((item) => item.provider === input.provider);
    if (matched) return matched;
    return {
      id: text(first.id, 'cfg-1'),
      restaurantId: input.restaurantId,
      provider: input.provider,
      environment: input.environment,
      active: input.active,
      verificationMode:
        input.provider === 'static_qr' && !input.webhookSecret?.trim()
          ? 'assisted_manual'
          : 'automatic_cloud',
      accountLabel: input.accountLabel.trim(),
      publicKey: input.publicKey?.trim() || null,
      merchantCode: input.merchantCode?.trim() || null,
      qrPayload: input.qrPayload?.trim() || null,
      hasSecretKey: Boolean(input.secretKey?.trim()) || booleanValue(first.has_secret_key, false),
      secretKeyLast4:
        input.secretKey?.trim().slice(-4) ?? nullableText(first.secret_key_last4),
      hasWebhookSecret:
        Boolean(input.webhookSecret?.trim()) || booleanValue(first.has_webhook_secret, false),
      webhookSecretLast4:
        input.webhookSecret?.trim().slice(-4) ?? nullableText(first.webhook_secret_last4),
      connectionStatus: 'untested',
      lastVerifiedAt: null,
      lastSafeTestPassed: false,
      lastSafeTestAt: null,
      updatedAt: new Date().toISOString(),
    };
  }

  async testGatewayConnection(
    restaurantId: string,
    provider: GatewayConfigRecord['provider'],
  ): Promise<{ ok: boolean; message: string }> {
    const { data, error } = await this.client.functions.invoke('payment-gateway', {
      body: {
        action: 'test_connection',
        restaurantId,
        provider,
      },
    });
    if (error) throw new Error(error.message);
    const payload = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
    const ok = Boolean(payload.ok ?? payload.connected);
    const message = text(
      payload.message,
      ok ? 'Conexión verificada correctamente.' : 'No se pudo comprobar la conexión.',
    );
    await this.recordGatewayTestResult(restaurantId, provider, ok, false).catch(() => false);
    return { ok, message };
  }

  async recordGatewayTestResult(
    restaurantId: string,
    provider: GatewayConfigRecord['provider'],
    connectionOk: boolean,
    safeTestOk: boolean,
  ): Promise<boolean> {
    const { data, error } = await this.client.rpc('record_payment_gateway_test_result', {
      p_restaurant_id: restaurantId,
      p_provider: provider,
      p_connection_ok: connectionOk,
      p_safe_test_ok: safeTestOk,
    });
    if (error) throw new Error(error.message);
    return data === true;
  }

  async listReconciliationExceptions(
    restaurantId: string,
  ): Promise<PaymentReconciliationExceptionItem[]> {
    if (!restaurantId) return [];
    const { data, error } = await this.client.rpc('list_payment_reconciliation_exceptions', {
      p_restaurant_id: restaurantId,
    });
    if (error) throw new Error(error.message);
    return (Array.isArray(data) ? data : []).map((raw) => {
      const row = raw as Record<string, unknown>;
      const statusRaw = text(row.resolution_status, 'open');
      return {
        id: text(row.id),
        restaurantId: text(row.restaurant_id, restaurantId),
        orderId: nullableText(row.order_id),
        paymentAttemptId: nullableText(row.payment_attempt_id),
        provider: text(row.provider, 'mercado_pago'),
        externalTransactionId: nullableText(row.external_transaction_id),
        expectedAmountCents: nullableNumber(row.expected_amount_cents),
        receivedAmountCents: nullableNumber(row.received_amount_cents),
        exceptionType: text(row.exception_type, 'amount_mismatch'),
        resolutionStatus: (
          ['open', 'refund_pending', 'refunded', 'resolved_dismissed'].includes(statusRaw)
            ? statusRaw
            : 'open'
        ) as PaymentReconciliationExceptionItem['resolutionStatus'],
        resolutionNote: nullableText(row.resolution_note),
        createdAt: text(row.created_at, new Date().toISOString()),
        resolvedAt: nullableText(row.resolved_at),
      };
    });
  }

  async resolveReconciliationException(
    exceptionId: string,
    resolutionStatus: 'refund_pending' | 'refunded' | 'resolved_dismissed',
    resolutionNote: string,
  ): Promise<boolean> {
    const { data, error } = await this.client.rpc('resolve_payment_reconciliation_exception', {
      p_exception_id: exceptionId,
      p_resolution_status: resolutionStatus,
      p_resolution_note: resolutionNote.trim(),
    });
    if (error) throw new Error(error.message);
    return data === true;
  }
}
