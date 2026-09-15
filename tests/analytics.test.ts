import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  analyticsConfigured,
  captureCampaign,
  getAnalyticsConsent,
  setAnalyticsConsent,
  track,
} from '@/lib/analytics';
describe('analítica desactivada por privacidad', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_ANALYTICS_PROVIDER', 'ga4');
    vi.stubEnv('VITE_GA4_MEASUREMENT_ID', 'G-TEST123');
    document.getElementById('suya-ga4-script')?.remove();
  });

  it('no carga etiquetas ni registra eventos sin consentimiento', () => {
    expect(analyticsConfigured()).toBe(false);
    track('page_view', { page_path: '/stores' });
    expect(getAnalyticsConsent()).toBeNull();
    expect(document.getElementById('suya-ga4-script')).toBeNull();
  });

  it('no persiste campañas ni activa etiquetas aunque haya configuración heredada', () => {
    const campaign = captureCampaign('?utm_source=ads&utm_campaign=' + 'x'.repeat(200) + '&email=private@example.com');
    expect(campaign).toEqual({});

    setAnalyticsConsent('granted');
    track('add_to_cart', { item_id: 'p-1', value: 12.5 });
    expect(getAnalyticsConsent()).toBeNull();
    expect(document.getElementById('suya-ga4-script')).toBeNull();
  });
});
