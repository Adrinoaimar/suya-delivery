import { createClient } from '@supabase/supabase-js';

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
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;
