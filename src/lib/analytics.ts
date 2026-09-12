import { readLocal, writeLocal, STORAGE_KEYS, type StorageKey } from '@/lib/storage';

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
type Gtag = (...args: unknown[]) => void;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: Gtag;
  }
}

let initialized = false;

function env(name: string): string {
  return String(import.meta.env[name] ?? '').trim();
}

function measurementId(): string {
  return env('VITE_GA4_MEASUREMENT_ID');
}

export function analyticsConfigured(): boolean {
  return env('VITE_ANALYTICS_PROVIDER').toLowerCase() === 'ga4' && /^G-[A-Z0-9]+$/i.test(measurementId());
}

export function getAnalyticsConsent(): AnalyticsConsent {
  const stored = readLocal<unknown>(STORAGE_KEYS.analyticsConsent, null);
  return stored === 'granted' || stored === 'denied' ? stored : null;
}

function safeParams(params: AnalyticsParams): Record<string, string | number | boolean> {
  const result: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    result[key.slice(0, 40)] = typeof value === 'string' ? value.slice(0, 120) : value;
  }
  return result;
}

function initializeGoogleTag(): void {
  if (!analyticsConfigured() || initialized || typeof document === 'undefined') return;
  const id = measurementId();
  window.dataLayer = window.dataLayer ?? [];
  window.gtag = window.gtag ?? ((...args: unknown[]) => window.dataLayer?.push(args));
  window.gtag('js', new Date());
  window.gtag('config', id, {
    send_page_view: false,
    anonymize_ip: true,
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
  });
  const script = document.createElement('script');
  script.id = 'suya-ga4-script';
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
  document.head.appendChild(script);
  initialized = true;
}

export function setAnalyticsConsent(value: Exclude<AnalyticsConsent, null>): void {
  if (!analyticsConfigured()) return;
  writeLocal(STORAGE_KEYS.analyticsConsent, value);
  if (value === 'granted') initializeGoogleTag();
}

export function track(name: AnalyticsEventName, params: AnalyticsParams = {}): void {
  if (!analyticsConfigured() || getAnalyticsConsent() !== 'granted') return;
  initializeGoogleTag();
  window.gtag?.('event', name, safeParams(params));
}

function campaignFromSearch(search: string): Record<string, string> {
  const query = new URLSearchParams(search);
  const keys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
  return Object.fromEntries(
    keys.flatMap((key) => {
      const value = query.get(key)?.trim().slice(0, 120);
      return value ? [[key, value]] : [];
    }),
  );
}

export function captureCampaign(search: string): Record<string, string> {
  const existing = readLocal<Record<string, string>>(STORAGE_KEYS.analyticsCampaign, {});
  if (Object.keys(existing).length > 0) return existing;
  const campaign = campaignFromSearch(search);
  if (Object.keys(campaign).length > 0) writeLocal(STORAGE_KEYS.analyticsCampaign, campaign);
  return campaign;
}

export function analyticsStorageKey(): StorageKey {
  return STORAGE_KEYS.analyticsConsent;
}
