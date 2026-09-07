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
  if (/provider.*not enabled|unsupported provider/i.test(message)) return 'Acceso con Google aún no está habilitado.';
  if (/cancel|access_denied/i.test(message)) return 'Acceso con Google cancelado.';
  if (/rate limit|too many/i.test(message)) return 'Demasiados intentos. Espera unos minutos.';
  return fallback;
}

interface AuthState {
  status: AuthStatus;
  identity: AuthIdentity | null;
  error: string | null;
  initialize: () => Promise<() => void>;
  signIn: (credentials: AuthCredentials) => Promise<void>;
  signInWithGoogle: (returnTo: string) => Promise<void>;
  completeOAuthCallback: (url: string) => Promise<string | null>;
  signUpCustomer: (input: SignUpInput) => Promise<boolean>;
  signOut: () => Promise<void>;
  updateProfile: (input: ProfileUpdate) => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
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

  async signInWithGoogle(returnTo) {
    set({ status: 'loading', error: null });
    try {
      await authService.signInWithGoogle(returnTo);
      // Web abandona esta página. En móvil, el deep link completa la sesión.
      if (get().status === 'loading') set({ status: 'anonymous' });
    } catch (error) {
      set({ status: 'anonymous', error: safeAuthMessage(error, 'No se pudo continuar con Google.') });
      throw error;
    }
  },

  async completeOAuthCallback(url) {
    set({ status: 'loading', error: null });
    try {
      const result = await authService.completeOAuthCallback(url);
      if (!result) {
        const identity = get().identity;
        set({ status: identity ? 'authenticated' : 'anonymous' });
        return null;
      }
      authRevision += 1;
      set({ identity: result.identity, status: 'authenticated', error: null });
      return result.returnTo;
    } catch (error) {
      set({ identity: null, status: 'anonymous', error: safeAuthMessage(error, 'No se pudo completar el acceso con Google.') });
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
