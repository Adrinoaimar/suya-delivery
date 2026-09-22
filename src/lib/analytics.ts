import { supabase } from '@/lib/supabase/client';
import { STORAGE_KEYS, readLocal, type StorageKey, writeLocal } from '@/lib/storage';

export type AnalyticsConsent = 'granted' | 'denied' | null;
export type AnalyticsEventName =
  | 'page_view'
  | 'link_click'
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
  if (!supabase) return;
  if (!analyticsConfigured()) return;

  if (name === 'page_view' || name === 'link_click') {
    const value = name === 'page_view' ? params.page_key ?? params.page_path : params.link_key;
    const eventKey = normalizeAnalyticsKey(value);
    if (eventKey) {
      void Promise.resolve(
        supabase.rpc('record_suya_analytics_event', {
          p_event_name: name,
          p_event_key: eventKey,
        }),
      ).catch(() => undefined);
    }

    if (name === 'page_view' && getAnalyticsConsent() === 'granted') {
      recordConsentVisitor();
    }
    return;
  }

  // Los eventos de negocio siguen siendo opt-in y no envían PII.
  if (getAnalyticsConsent() !== 'granted') return;
  void params;
}

/** Registra el navegador único solo después de que el usuario acepta. */
export function recordConsentVisitor(): void {
  if (!analyticsConfigured() || getAnalyticsConsent() !== 'granted' || !supabase) return;
  const visitorId = getVisitorId();
  if (!visitorId) return;
  void Promise.resolve(supabase.rpc('record_suya_analytics_visit', { p_visitor_id: visitorId })).catch(
    () => undefined,
  );
}

/** Normaliza rutas y claves antes de enviarlas; nunca conserva query strings ni ids dinámicos. */
export function normalizeAnalyticsKey(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  if (!raw) return null;
  let pathname = raw;
  try {
    const url = new URL(raw, window.location.origin);
    pathname = url.origin === window.location.origin ? url.pathname : '/external';
  } catch {
    pathname = raw.split(/[?#]/u, 1)[0] ?? '';
  }
  pathname = `/${pathname.replace(/^\/+|\/+$/gu, '')}`;
  if (pathname === '/') return '/';
  if (/^\/store\/[^/]+$/u.test(pathname)) return '/store/:id';
  if (/^\/(?:orders?|pedido|table)\/[^/]+(?:\/[^/]+)?$/u.test(pathname)) return '/dynamic';
  if (/^\/menu\/[^/]+(?:\/pedido\/[^/]+)?$/u.test(pathname)) return '/menu/:slug';
  const safe = pathname.toLowerCase().replace(/[^a-z0-9/_:-]/gu, '').slice(0, 100);
  return safe || null;
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
