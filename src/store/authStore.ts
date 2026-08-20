import { create } from 'zustand';
import { authService } from '@/lib/auth/SupabaseAuthService';
import type { AuthCredentials, AuthIdentity, ProfileUpdate, SignUpInput } from '@/lib/auth/types';

type AuthStatus = 'idle' | 'loading' | 'anonymous' | 'authenticated' | 'error';
let authRevision = 0;

function safeAuthMessage(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : '';
  if (/invalid login credentials/i.test(message)) return 'Correo o contraseña incorrectos.';
  if (/email not confirmed/i.test(message)) return 'Confirma tu correo antes de ingresar.';
  if (/password/i.test(message)) return 'La contraseña no cumple los requisitos de seguridad.';
  if (/rate limit|too many/i.test(message)) return 'Demasiados intentos. Espera unos minutos.';
  return fallback;
}

interface AuthState {
  status: AuthStatus;
  identity: AuthIdentity | null;
  error: string | null;
  initialize: () => Promise<() => void>;
  signIn: (credentials: AuthCredentials) => Promise<void>;
  signUpCustomer: (input: SignUpInput) => Promise<boolean>;
  signOut: () => Promise<void>;
  updateProfile: (input: ProfileUpdate) => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  status: 'idle',
  identity: null,
  error: null,

  async initialize() {
    set({ status: 'loading', error: null });
    const revision = ++authRevision;
    const unsubscribe = authService.subscribe((identity) => {
      authRevision += 1;
      set({ identity, status: identity ? 'authenticated' : 'anonymous', error: null });
    });
    try {
      const identity = await authService.getIdentity();
      if (revision === authRevision) {
        set({ identity, status: identity ? 'authenticated' : 'anonymous' });
      }
    } catch (error) {
      if (revision === authRevision) {
        set({ status: 'error', error: safeAuthMessage(error, 'No se pudo verificar la sesión.') });
      }
    }
    return unsubscribe;
  },

  async signIn(credentials) {
    set({ status: 'loading', error: null });
    try {
      const identity = await authService.signIn(credentials);
      set({ identity, status: 'authenticated' });
    } catch (error) {
      const message = safeAuthMessage(error, 'No se pudo iniciar sesión.');
      set({ status: 'anonymous', error: message });
      throw error;
    }
  },

  async signUpCustomer(input) {
    set({ status: 'loading', error: null });
    try {
      const result = await authService.signUpCustomer(input);
      set({ status: result.requiresEmailConfirmation ? 'anonymous' : 'loading' });
      return result.requiresEmailConfirmation;
    } catch (error) {
      set({ status: 'anonymous', error: safeAuthMessage(error, 'No se pudo crear la cuenta.') });
      throw error;
    }
  },

  async signOut() {
    authRevision += 1;
    await authService.signOut();
    set({ identity: null, status: 'anonymous', error: null });
  },

  async updateProfile(input) {
    const identity = await authService.updateProfile(input);
    set({ identity, status: 'authenticated', error: null });
  },
}));
