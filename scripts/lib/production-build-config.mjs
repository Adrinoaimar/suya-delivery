import { isSafeSupabasePublishableKey } from './public-supabase-key.mjs';

export function inspectProductionBuildConfig(env = process.env) {
  const backend = env.VITE_BACKEND;
  const mapProvider = env.VITE_MAP_PROVIDER;
  const supabaseUrl = env.VITE_SUPABASE_URL;
  const expectedProjectRef = env.VITE_EXPECTED_SUPABASE_PROJECT_REF;
  const publishableKey = env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const localE2e = env.CI_E2E === 'true' && /^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?$/i.test(supabaseUrl ?? '');
  const actualProjectRef = localE2e
    ? 'local'
    : supabaseUrl?.match(/^https:\/\/([a-z0-9]+)\.supabase\.co$/i)?.[1];
  const failures = [];

  if (backend !== 'supabase') failures.push('VITE_BACKEND=supabase');
  if (mapProvider !== 'osm') failures.push('VITE_MAP_PROVIDER=osm');
  if (!actualProjectRef) failures.push('VITE_SUPABASE_URL válida');
  if (!expectedProjectRef || actualProjectRef !== expectedProjectRef) {
    failures.push('VITE_EXPECTED_SUPABASE_PROJECT_REF coincidente');
  }
  if (!isSafeSupabasePublishableKey(publishableKey)) {
    failures.push('VITE_SUPABASE_PUBLISHABLE_KEY pública válida');
  }

  return { actualProjectRef, failures, ok: failures.length === 0 };
}

export function assertProductionBuildConfig(env = process.env) {
  const result = inspectProductionBuildConfig(env);
  if (!result.ok) {
    throw new Error(
      `Build productivo rechazado. Configura ${result.failures.join(', ')}; ` +
        'el modo demo solo puede usarse con npm run dev.',
    );
  }
  return result;
}


