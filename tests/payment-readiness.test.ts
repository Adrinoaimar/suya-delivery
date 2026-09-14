import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const script = 'scripts/verify-payment-readiness.mjs';
const baseEnv = {
  ...process.env,
  VITE_BACKEND: 'supabase',
  VITE_MAP_PROVIDER: 'osm',
  VITE_SUPABASE_URL: 'https://cggxooilzhqlcnofgtmi.supabase.co',
  VITE_EXPECTED_SUPABASE_PROJECT_REF: 'cggxooilzhqlcnofgtmi',
  VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_key_1234567890',
  VITE_CULQI_GATEWAY_ENABLED: 'true',
  VITE_CULQI_PUBLIC_KEY: 'pk_test_public_key_1234567890',
  ALLOWED_ORIGINS:
    'https://suyadelivery.com,https://rider.suyadelivery.com,https://panel.suyadelivery.com',
};

describe('verify-payment-readiness', () => {
  it('valida configuración de prueba sin hacer llamadas de red', () => {
    const output = execFileSync(process.execPath, [script], {
      env: baseEnv,
      encoding: 'utf8',
    });
    expect(output).toContain('no se ejecutaron cargos');
  });

  it('rechaza una clave secreta en la configuración pública de Culqi', () => {
    expect(() =>
      execFileSync(process.execPath, [script], {
        env: { ...baseEnv, VITE_CULQI_PUBLIC_KEY: 'sk_test_should_never_be_public' },
        encoding: 'utf8',
      }),
    ).toThrow(/VITE_CULQI_PUBLIC_KEY/);
  });

  it('rechaza un proveedor de mapas ausente o simulado', () => {
    expect(() =>
      execFileSync(process.execPath, [script], {
        env: { ...baseEnv, VITE_MAP_PROVIDER: 'mock' },
        encoding: 'utf8',
      }),
    ).toThrow(/VITE_MAP_PROVIDER/);
  });
});
