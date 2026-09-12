import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  analyticsConfigured,
  captureCampaign,
  getAnalyticsConsent,
  setAnalyticsConsent,
  track,
} from '@/lib/analytics';
import { STORAGE_KEYS } from '@/lib/storage';

describe('analítica web opt-in', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_ANALYTICS_PROVIDER', 'ga4');
    vi.stubEnv('VITE_GA4_MEASUREMENT_ID', 'G-TEST123');
    document.getElementById('suya-ga4-script')?.remove();
    delete window.gtag;
    delete window.dataLayer;
  });

  it('no carga etiquetas ni registra eventos sin consentimiento', () => {
    expect(analyticsConfigured()).toBe(true);
    track('page_view', { page_path: '/stores' });
    expect(getAnalyticsConsent()).toBeNull();
    expect(document.getElementById('suya-ga4-script')).toBeNull();
    expect(window.dataLayer).toBeUndefined();
  });

  it('sanitiza UTM y registra eventos solo después de aceptar', () => {
    const campaign = captureCampaign('?utm_source=ads&utm_campaign=' + 'x'.repeat(200) + '&email=private@example.com');
    expect(campaign).toMatchObject({ utm_source: 'ads' });
    expect(campaign.utm_campaign).toHaveLength(120);
    expect(campaign).not.toHaveProperty('email');
    expect(localStorage.getItem(STORAGE_KEYS.analyticsCampaign)).toContain('utm_source');

    setAnalyticsConsent('granted');
    track('add_to_cart', { item_id: 'p-1', value: 12.5 });
    expect(getAnalyticsConsent()).toBe('granted');
    expect(document.getElementById('suya-ga4-script')).not.toBeNull();
    expect(window.dataLayer?.some((entry) => JSON.stringify(entry).includes('add_to_cart'))).toBe(true);
  });
});

