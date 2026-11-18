import { supabase } from '@/lib/supabase/client';

export interface PaymentGatewayAvailability {
  provider: string | null;
  available: boolean;
  automatic: boolean;
  testAvailable?: boolean;
  environment?: 'test' | 'live';
}

export interface PaymentGatewayConfig {
  restaurant_id: string;
  provider: string;
  environment: 'test' | 'live';
  version: number;
  collector_id: string | null;
  enabled: boolean;
  verified_at: string | null;
  webhook_verified_at: string | null;
  production_permissions_confirmed: boolean;
  has_credentials: boolean;
  webhook_url?: string;
}

export interface GatewayPaymentRow {
  attempt_id: string;
  order_id: string;
  checkout_reference: string;
  amount_cents: number;
  status: string;
  gateway_state: string | null;
  failure_code: string | null;
  updated_at: string;
}

export interface GatewayAuditEvent {
  id: number;
  attempt_id: string;
  transaction_id: string;
  outcome: string;
  received_at: string;
}

export interface GatewayAdminResult {
  config?: PaymentGatewayConfig | null;
  payments?: { payments: GatewayPaymentRow[]; events: GatewayAuditEvent[] };
  sandboxCheckoutUrl?: string;
  message?: string;
  results?: unknown;
}

export interface PaymentGatewayService {
  availability(restaurantId: string): Promise<PaymentGatewayAvailability>;
  admin(action: 'admin-read' | 'admin-save' | 'admin-check' | 'admin-safe-test' | 'admin-activate' | 'admin-reconcile',
    body: Record<string, unknown>): Promise<GatewayAdminResult>;
}

function publicGatewayError(status?: number): Error {
  if (status === 401 || status === 403) return new Error('Tu sesión no permite configurar los cobros de este restaurante. Vuelve a iniciar sesión o consulta al administrador.');
  if (status === 409) return new Error('La configuración cambió. Actualiza los datos antes de continuar.');
  if (status === 400 || status === 422) return new Error('Revisa las credenciales, el entorno, la firma de Webhooks y los permisos de la cuenta antes de continuar.');
  return new Error('No pudimos completar la configuración. Comprueba tu conexión y tus permisos.');
}

export class SupabasePaymentGatewayService implements PaymentGatewayService {
  async availability(restaurantId: string): Promise<PaymentGatewayAvailability> {
    if (!supabase || !restaurantId) return { provider: null, available: false, automatic: false };
    try {
      const { data, error } = await supabase.rpc('gateway_config_public', { p_restaurant_id: restaurantId });
      if (error) return { provider: null, available: false, automatic: false };
      const row = data as (Partial<PaymentGatewayAvailability> & { test_available?: unknown }) | null;
      return { provider: row?.provider ?? null, available: row?.available === true,
        automatic: row?.automatic === true, environment: row?.environment,
        testAvailable: row?.test_available === true };
    } catch {
      return { provider: null, available: false, automatic: false };
    }
  }

  async admin(action: Parameters<PaymentGatewayService['admin']>[0], body: Record<string, unknown>): Promise<GatewayAdminResult> {
    if (!supabase) throw new Error('La configuración de cobros requiere conexión con SUYA.');
    let response: Awaited<ReturnType<typeof supabase.functions.invoke>>;
    try {
      response = await supabase.functions.invoke('payment-gateway', { body: { ...body, action } });
    } catch {
      throw publicGatewayError();
    }
    const { data, error } = response;
    if (error) {
      // Ningún cuerpo, error del proveedor o token devuelto se refleja en la interfaz.
      const context: unknown = 'context' in error ? error.context : null;
      throw publicGatewayError(context instanceof Response ? context.status : undefined);
    }
    if (!data || typeof data !== 'object' || ('error' in data && data.error)) throw publicGatewayError();
    const result = data as GatewayAdminResult;
    // La UI usa mensajes propios; se descartan mensajes arbitrarios y campos extra.
    return { config: result.config, payments: result.payments,
      sandboxCheckoutUrl: result.sandboxCheckoutUrl, results: result.results };
  }
}
