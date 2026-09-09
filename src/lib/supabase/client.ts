import { createClient } from '@supabase/supabase-js';
import { Capacitor } from '@capacitor/core';

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
const expectedProjectRef = import.meta.env.VITE_EXPECTED_SUPABASE_PROJECT_REF?.trim();
const localE2e = expectedProjectRef === 'local' && /^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?$/i.test(url ?? '');
const actualProjectRef = localE2e
  ? 'local'
  : url?.match(/^https:\/\/([a-z0-9]+)\.supabase\.co$/i)?.[1];

export const isSupabaseConfigured = Boolean(
  import.meta.env.VITE_BACKEND === 'supabase' &&
    url &&
    publishableKey &&
    expectedProjectRef &&
    actualProjectRef === expectedProjectRef &&
    !url.includes('PROJECT_REF') &&
    !publishableKey.includes('REPLACE_ME') &&
    expectedProjectRef !== 'PROJECT_REF',
);

export const supabase = isSupabaseConfigured
  ? createClient(url!, publishableKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: !Capacitor.isNativePlatform(),
        flowType: 'pkce',
      },
    })
  : null;

/** Consulta configuración pública de Auth para no ofrecer un proveedor deshabilitado. */
export async function isGoogleAuthEnabled(): Promise<boolean> {
  if (!isSupabaseConfigured || !url || !publishableKey) return false;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);

  try {
    const response = await fetch(`${url}/auth/v1/settings`, {
      headers: { apikey: publishableKey },
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!response.ok) return false;
    const settings = (await response.json()) as { external?: { google?: boolean } };
    return settings.external?.google === true;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

