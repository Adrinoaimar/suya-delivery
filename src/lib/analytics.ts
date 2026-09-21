import { STORAGE_KEYS, type StorageKey } from '@/lib/storage';

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
  // Suya no usa cookies, campañas persistentes ni telemetría de terceros.
  // Se conserva la interfaz para que las pantallas existentes sigan siendo puras.
  return false;
}

export function getAnalyticsConsent(): AnalyticsConsent {
  return null;
}

export function setAnalyticsConsent(value: Exclude<AnalyticsConsent, null>): void {
  void value;
}

export function track(name: AnalyticsEventName, params: AnalyticsParams = {}): void {
  void name;
  void params;
}

export function captureCampaign(search: string): Record<string, string> {
  void search;
  return {};
}

export function analyticsStorageKey(): StorageKey {
  return STORAGE_KEYS.analyticsConsent;
}
