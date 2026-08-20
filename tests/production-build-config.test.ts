import { describe, expect, it } from 'vitest';
import { inspectProductionBuildConfig } from '../scripts/lib/production-build-config.mjs';

const valid = {
  VITE_BACKEND: 'supabase',
  VITE_MAP_PROVIDER: 'osm',
  VITE_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co',
  VITE_EXPECTED_SUPABASE_PROJECT_REF: 'abcdefghijklmnopqrst',
  VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_12345678901234567890',
};

describe('configuración de build productivo', () => {
  it('acepta configuración Supabase completa y coincidente', () => {
    expect(inspectProductionBuildConfig(valid)).toMatchObject({ ok: true, failures: [] });
  });

  it('rechaza configuración ausente o backend demo', () => {
    const result = inspectProductionBuildConfig({});
    expect(result.ok).toBe(false);
    expect(result.failures).toContain('VITE_BACKEND=supabase');
    expect(result.failures).toContain('VITE_SUPABASE_URL válida');

    const demo = inspectProductionBuildConfig({ ...valid, VITE_BACKEND: 'mock' });
    expect(demo.failures).toContain('VITE_BACKEND=supabase');
  });

  it('rechaza ref distinta y clave service_role', () => {
    const result = inspectProductionBuildConfig({
      ...valid,
      VITE_EXPECTED_SUPABASE_PROJECT_REF: 'otro-proyecto',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.firma',
    });
    expect(result.failures).toContain('VITE_EXPECTED_SUPABASE_PROJECT_REF coincidente');
    expect(result.failures).toContain('VITE_SUPABASE_PUBLISHABLE_KEY pública válida');
  });
});

