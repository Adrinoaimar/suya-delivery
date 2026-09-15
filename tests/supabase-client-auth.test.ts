import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  capacitor: { isNativePlatform: vi.fn() },
  createClient: vi.fn(
    (_url: string, _key: string, _options?: { auth?: Record<string, unknown> }) => ({}),
  ),
}));

vi.mock('@capacitor/core', () => ({ Capacitor: mocks.capacitor }));
vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }));

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

async function loadClient(native: boolean) {
  vi.resetModules();
  vi.stubEnv('VITE_BACKEND', 'supabase');
  vi.stubEnv('VITE_SUPABASE_URL', 'https://cggxooilzhqlcnofgtmi.supabase.co');
  vi.stubEnv('VITE_EXPECTED_SUPABASE_PROJECT_REF', 'cggxooilzhqlcnofgtmi');
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_synthetic_suya_public_key');
  mocks.capacitor.isNativePlatform.mockReturnValue(native);

  const clientModule = await import('@/lib/supabase/client');
  const options = mocks.createClient.mock.calls.at(-1)?.[2] as {
    auth?: Record<string, unknown>;
  } | undefined;
  return { clientModule, auth: options?.auth };
}

describe('configuración de sesión Supabase', () => {
  it('no persiste refresh tokens ni detecta callbacks web dentro de Android', async () => {
    const { clientModule, auth } = await loadClient(true);

    expect(clientModule.supabase).not.toBeNull();
    expect(auth).toMatchObject({
      persistSession: false,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      flowType: 'pkce',
    });
  });

  it('mantiene la sesión web y el callback PKCE en el navegador', async () => {
    const { clientModule, auth } = await loadClient(false);

    expect(clientModule.supabase).not.toBeNull();
    expect(auth).toMatchObject({
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
    });
  });
});
