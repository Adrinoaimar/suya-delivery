import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthIdentity } from '@/lib/auth/types';

const service = vi.hoisted(() => ({
  getIdentity: vi.fn(),
  subscribe: vi.fn(() => () => undefined),
  signIn: vi.fn(),
  signInWithGoogle: vi.fn(),
  completeOAuthCallback: vi.fn(),
  signUpCustomer: vi.fn(),
  signOut: vi.fn(),
  updateProfile: vi.fn(),
}));

vi.mock('@/lib/auth/SupabaseAuthService', () => ({ authService: service }));

import { useAuthStore } from '@/store/authStore';

const customer: AuthIdentity = {
  id: '00000000-0000-0000-0000-000000000001',
  email: 'ana@example.test',
  displayName: 'Ana',
  phone: '',
  defaultAddress: '',
  defaultReference: '',
  access: ['customer'],
  restaurantIds: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.setState({ status: 'anonymous', identity: null, error: null });
});

describe('authStore con Google', () => {
  it('traduce proveedor deshabilitado a mensaje seguro', async () => {
    service.signInWithGoogle.mockRejectedValueOnce(new Error('Unsupported provider: provider is not enabled'));

    await expect(useAuthStore.getState().signInWithGoogle('/profile')).rejects.toThrow('Unsupported provider');

    expect(useAuthStore.getState()).toMatchObject({
      status: 'anonymous',
      identity: null,
      error: 'Acceso con Google aún no está habilitado.',
    });
  });

  it('completa callback móvil y conserva destino validado por servicio', async () => {
    service.completeOAuthCallback.mockResolvedValueOnce({ identity: customer, returnTo: '/orders' });

    await expect(
      useAuthStore.getState().completeOAuthCallback('com.suya.app://auth/callback?code=pkce-code'),
    ).resolves.toBe('/orders');

    expect(useAuthStore.getState()).toMatchObject({
      status: 'authenticated',
      identity: customer,
      error: null,
    });
  });

  it('ignora URLs ajenas sin autenticar', async () => {
    service.completeOAuthCallback.mockResolvedValueOnce(null);

    await expect(useAuthStore.getState().completeOAuthCallback('https://evil.example/callback')).resolves.toBeNull();
    expect(useAuthStore.getState().identity).toBeNull();
  });
});
