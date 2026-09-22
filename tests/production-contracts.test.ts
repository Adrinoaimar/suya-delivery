import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function source(file: string) {
  return readFileSync(resolve(process.cwd(), file), 'utf8');
}

describe('contratos de configuración productiva', () => {
  it('mantiene el ejemplo local alineado con el verificador productivo', () => {
    const envExample = source('.env.example');

    for (const variable of [
      'VITE_BACKEND',
      'VITE_SUPABASE_URL',
      'VITE_SUPABASE_PUBLISHABLE_KEY',
      'VITE_EXPECTED_SUPABASE_PROJECT_REF',
      'VITE_MAP_PROVIDER',
      'VITE_ANALYTICS_PROVIDER',
    ]) {
      expect(envExample).toMatch(new RegExp(`^${variable}=`, 'm'));
    }

    expect(envExample).toMatch(/^VITE_ANALYTICS_PROVIDER=suya$/m);
  });

  it('mantiene las variables críticas declaradas en los workflows productivos', () => {
    const cloudflareWorkflow = source('.github/workflows/cloudflare-pages.yml');
    const androidWorkflow = source('.github/workflows/mobile-android.yml');

    for (const variable of [
      'VITE_BACKEND',
      'VITE_MAP_PROVIDER',
      'VITE_SUPABASE_URL',
      'VITE_SUPABASE_PUBLISHABLE_KEY',
      'VITE_EXPECTED_SUPABASE_PROJECT_REF',
    ]) {
      expect(cloudflareWorkflow).toContain(`${variable}:`);
      expect(androidWorkflow).toContain(`${variable}:`);
    }

    expect(cloudflareWorkflow).toContain('VITE_ANALYTICS_PROVIDER: suya');
    expect(androidWorkflow).toContain('VITE_ANALYTICS_PROVIDER: suya');
  });

  it('no reintroduce la opción incompatible de Vitest', () => {
    for (const file of [
      'package.json',
      'README.md',
      '.github/workflows/deploy.yml',
      '.github/workflows/e2e.yml',
    ]) {
      expect(source(file)).not.toContain('--runInBand');
    }
  });
});
