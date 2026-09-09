import { beforeEach, describe, expect, it, vi } from 'vitest';

const { signInWithOAuth } = vi.hoisted(() => ({
  signInWithOAuth: vi.fn(),
}));

vi.mock('@/lib/supabase/client', () => ({
  isSupabaseConfigured: true,
  supabase: { auth: { signInWithOAuth } },
}));

import { SupabaseAuthService } from '@/lib/auth/SupabaseAuthService';

describe('Google Auth', () => {
  beforeEach(() => {
    signInWithOAuth.mockReset();
    signInWithOAuth.mockResolvedValue({ data: { provider: 'google', url: 'https://accounts.google.com' }, error: null });
  });

  it('inicia OAuth con Google y vuelve a la ruta actual', async () => {
    await new SupabaseAuthService().signInWithGoogle();

    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}${window.location.pathname}` },
    });
  });

  it('propaga el error del proveedor para que la interfaz lo traduzca', async () => {
    signInWithOAuth.mockResolvedValueOnce({ data: { provider: 'google', url: null }, error: new Error('Provider not enabled') });

    await expect(new SupabaseAuthService().signInWithGoogle()).rejects.toThrow('Provider not enabled');
  });
});
