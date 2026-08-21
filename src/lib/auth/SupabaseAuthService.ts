import type { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/client';
import type { AccessRole, AuthCredentials, AuthIdentity, AuthService, ProfileUpdate, SignUpInput } from './types';
import { resolveAccess } from './access';

async function identityFor(user: User): Promise<AuthIdentity> {
  if (!supabase) throw new Error('Supabase no está configurado.');

  const [profileResult, riderResult, membershipsResult] = await Promise.all([
    supabase
      .from('profiles')
      .select('display_name, phone, default_address, default_reference')
      .eq('id', user.id)
      .maybeSingle(),
    supabase
      .from('rider_profiles')
      .select('user_id, status, verified_at')
      .eq('user_id', user.id)
      .maybeSingle(),
    supabase.from('restaurant_members').select('restaurant_id').eq('user_id', user.id).eq('active', true),
  ]);

  const firstError = profileResult.error ?? riderResult.error ?? membershipsResult.error;
  if (firstError) throw new Error(firstError.message);

  const restaurantIds = (membershipsResult.data ?? []).map((item) => item.restaurant_id as string);
  const access: AccessRole[] = resolveAccess({
    riderStatus: riderResult.data?.status,
    riderVerifiedAt: riderResult.data?.verified_at,
    restaurantIds,
    platformRole: user.app_metadata.role,
  });

  return {
    id: user.id,
    email: user.email ?? '',
    displayName: profileResult.data?.display_name ?? user.email?.split('@')[0] ?? 'Usuario',
    phone: profileResult.data?.phone ?? '',
    defaultAddress: profileResult.data?.default_address ?? '',
    defaultReference: profileResult.data?.default_reference ?? '',
    access,
    restaurantIds,
  };
}

export class SupabaseAuthService implements AuthService {
  async getIdentity(): Promise<AuthIdentity | null> {
    if (!supabase) return null;
    const { data, error } = await supabase.auth.getUser();
    if (error) {
      if (/session|token/i.test(error.message)) return null;
      throw new Error(error.message);
    }
    return data.user ? identityFor(data.user) : null;
  }

  subscribe(listener: (identity: AuthIdentity | null) => void): () => void {
    if (!supabase) return () => undefined;
    let revision = 0;
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      const currentRevision = ++revision;
      if (!session?.user) {
        listener(null);
        return;
      }
      // Un fallo transitorio de red/RLS no equivale a cerrar sesión.
      void identityFor(session.user)
        .then((identity) => {
          if (currentRevision === revision) listener(identity);
        })
        .catch(() => undefined);
    });
    return () => {
      revision += 1;
      data.subscription.unsubscribe();
    };
  }

  async signIn(credentials: AuthCredentials): Promise<AuthIdentity> {
    if (!supabase) throw new Error('Supabase no está configurado.');
    const { data, error } = await supabase.auth.signInWithPassword(credentials);
    if (error) throw new Error(error.message);
    return identityFor(data.user);
  }

  async signUpCustomer(input: SignUpInput) {
    if (!supabase) throw new Error('Supabase no está configurado.');
    const { data, error } = await supabase.auth.signUp({
      email: input.email,
      password: input.password,
      options: { data: { display_name: input.displayName.trim() } },
    });
    if (error) throw new Error(error.message);
    return { requiresEmailConfirmation: data.session === null };
  }

  async signOut(): Promise<void> {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) throw new Error(error.message);
  }

  async updateProfile(input: ProfileUpdate): Promise<AuthIdentity> {
    if (!supabase) throw new Error('Supabase no está configurado.');
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) throw new Error(userError?.message ?? 'Sesión no válida.');
    const { error } = await supabase
      .from('profiles')
      .update({
        display_name: input.displayName.trim(),
        phone: input.phone.trim() || null,
        default_address: input.defaultAddress.trim() || null,
        default_reference: input.defaultReference.trim() || null,
      })
      .eq('id', userData.user.id);
    if (error) throw new Error(error.message);
    return identityFor(userData.user);
  }
}

export const authService = new SupabaseAuthService();
