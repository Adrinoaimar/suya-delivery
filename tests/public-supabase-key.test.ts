import { describe, expect, it } from 'vitest';
import { isSafeSupabasePublishableKey } from '../scripts/lib/public-supabase-key.mjs';

function jwt(role: string) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ role })).toString('base64url');
  return `${header}.${payload}.firma`;
}

describe('clave pública Supabase', () => {
  it('acepta publishable moderna y JWT legacy anon', () => {
    expect(isSafeSupabasePublishableKey('sb_publishable_12345678901234567890')).toBe(true);
    expect(isSafeSupabasePublishableKey(jwt('anon'))).toBe(true);
  });

  it('rechaza service_role, JWT inválido y placeholders', () => {
    expect(isSafeSupabasePublishableKey(jwt('service_role'))).toBe(false);
    expect(isSafeSupabasePublishableKey('eyJ-no-es-jwt')).toBe(false);
    expect(isSafeSupabasePublishableKey('sb_publishable_REPLACE_ME')).toBe(false);
  });
});
