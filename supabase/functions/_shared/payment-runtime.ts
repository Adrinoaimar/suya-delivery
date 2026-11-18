import type { PaymentRuntime } from './payment-handlers.ts';

export function readPaymentRuntime(get: (key: string) => string | undefined): PaymentRuntime {
  return {
    supabaseUrl: (get('SUPABASE_URL') ?? '').replace(/\/$/, ''),
    anonKey: get('SUPABASE_ANON_KEY') ?? '',
    serviceRoleKey: get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    credentialsKey: get('PAYMENT_CREDENTIALS_KEY') ?? '',
    allowedOrigins: (get('ALLOWED_ORIGINS') ?? '').split(',').map((value) => value.trim()).filter(Boolean),
    customerOrigin: get('PAYMENT_CUSTOMER_ORIGIN') ?? 'https://suyadelivery.com',
    reconcileToken: get('PAYMENT_RECONCILE_TOKEN'),
  };
}
