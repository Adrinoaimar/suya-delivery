import { supabase } from '@/lib/supabase/client';
import { STORAGE_KEYS, readLocal, type StorageKey, writeLocal } from '@/lib/storage';

export type AnalyticsConsent = 'granted' | 'denied' | null;
export type AnalyticsEventName =
  | 'page_view'
  | 'store_view'
  | 'menu_view'
  | 'add_to_cart'
  | 'checkout_start'
  | 'order_created'
  | 'lead_submitted';

type AnalyticsParams = Record<string, string | number | boolean | undefined>;

export function analyticsConfigured(): boolean {
  return (
    import.meta.env.VITE_ANALYTICS_PROVIDER?.trim().toLowerCase() === 'suya' && supabase !== null
  );
}

export function getAnalyticsConsent(): AnalyticsConsent {
  if (!analyticsConfigured()) return null;
  const value = readLocal<string>(STORAGE_KEYS.analyticsConsent, '');
  return value === 'granted' || value === 'denied' ? value : null;
}

export function setAnalyticsConsent(value: Exclude<AnalyticsConsent, null>): void {
  if (!analyticsConfigured()) return;
  writeLocal(STORAGE_KEYS.analyticsConsent, value);
}

export function track(name: AnalyticsEventName, params: AnalyticsParams = {}): void {
  // Solo se mide visita única diaria. No se envían rutas, nombres, pedidos ni campañas.
  if (!analyticsConfigured() || getAnalyticsConsent() !== 'granted' || name !== 'page_view') return;
  const visitorId = getVisitorId();
  if (!visitorId) return;
  void params;
  void supabase?.rpc('record_suya_analytics_visit', { p_visitor_id: visitorId });
}

export function captureCampaign(search: string): Record<string, string> {
  void search;
  return {};
}

export function analyticsStorageKey(): StorageKey {
  return STORAGE_KEYS.analyticsConsent;
}

function getVisitorId(): string | null {
  const stored = readLocal<string>(STORAGE_KEYS.analyticsVisitor, '');
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(stored)) {
    return stored.toLowerCase();
  }
  try {
    const visitorId = crypto.randomUUID();
    writeLocal(STORAGE_KEYS.analyticsVisitor, visitorId);
    return visitorId;
  } catch {
    return null;
  }
}
