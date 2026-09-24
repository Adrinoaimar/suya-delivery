import { describe, expect, it } from 'vitest';
import { inspectMobileQaEnv } from '../scripts/lib/mobile-qa-env.mjs';

const staging = {
  VITE_BACKEND: 'supabase',
  VITE_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co',
  VITE_EXPECTED_SUPABASE_PROJECT_REF: 'abcdefghijklmnopqrst',
  VITE_SUPABASE_PUBLISHABLE_KEY: 'synthetic-public-key',
  VITE_CULQI_GATEWAY_ENABLED: 'false',
  VITE_ROUTING_URL: 'https://abcdefghijklmnopqrst.supabase.co/functions/v1/route-driving',
  VITE_CUSTOMER_APP_URL: 'https://customer.staging.example.test',
  VITE_RIDER_APP_URL: 'https://rider.staging.example.test',
  VITE_BACKOFFICE_APP_URL: 'https://panel.staging.example.test',
  VITE_LIVE_UPDATE_BASE_URL: '',
};

describe('configuración Android QA', () => {
  it('acepta solo staging coherente y permite OTA desactivada', () => {
    expect(inspectMobileQaEnv(staging)).toEqual([]);
  });

  it('rechaza backend productivo y OTA productiva', () => {
    expect(inspectMobileQaEnv({
      ...staging,
      VITE_SUPABASE_URL: 'https://cggxooilzhqlcnofgtmi.supabase.co',
      VITE_EXPECTED_SUPABASE_PROJECT_REF: 'cggxooilzhqlcnofgtmi',
      VITE_LIVE_UPDATE_BASE_URL: 'https://suyadelivery.com',
    })).not.toEqual([]);
  });

  it('rechaza variables faltantes y pasarela activada', () => {
    const failures = inspectMobileQaEnv({
      ...staging,
      VITE_SUPABASE_PUBLISHABLE_KEY: '',
      VITE_CULQI_GATEWAY_ENABLED: 'true',
    });
    expect(failures).toEqual(expect.arrayContaining([
      expect.stringContaining('VITE_SUPABASE_PUBLISHABLE_KEY'),
      expect.stringContaining('VITE_CULQI_GATEWAY_ENABLED'),
    ]));
  });
});
