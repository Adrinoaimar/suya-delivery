import { describe, expect, it } from 'vitest';
import {
  googleOAuthRedirectTo,
  NATIVE_OAUTH_CALLBACK_URL,
  parseNativeOAuthCallback,
  safeReturnPath,
} from '@/lib/auth/oauth';

describe('OAuth de Google', () => {
  it('solo acepta destinos locales', () => {
    expect(safeReturnPath('/checkout?from=cart')).toBe('/checkout?from=cart');
    expect(safeReturnPath('https://evil.example/phishing')).toBe('/profile');
    expect(safeReturnPath('//evil.example/phishing')).toBe('/profile');
    expect(safeReturnPath('/\\evil.example/phishing')).toBe('/profile');
  });

  it('conserva destino local en callback web', () => {
    const redirect = new URL(googleOAuthRedirectTo('/orders/abc?tab=status'));
    expect(redirect.pathname).toBe('/login');
    expect(redirect.searchParams.get('oauth')).toBe('google');
    expect(redirect.searchParams.get('next')).toBe('/orders/abc?tab=status');
  });

  it('acepta únicamente callback móvil registrado y consume destino seguro', () => {
    googleOAuthRedirectTo('/profile');
    expect(parseNativeOAuthCallback(`${NATIVE_OAUTH_CALLBACK_URL}?code=pkce-code`)).toEqual({
      code: 'pkce-code',
      error: null,
      returnTo: '/profile',
    });
    expect(parseNativeOAuthCallback('https://evil.example/auth/callback?code=stolen')).toBeNull();
  });

  it('propaga cancelación del proveedor sin exigir código', () => {
    const result = parseNativeOAuthCallback(
      `${NATIVE_OAUTH_CALLBACK_URL}?error=access_denied&error_description=Acceso+cancelado`,
    );
    expect(result).toMatchObject({ code: null, error: 'Acceso cancelado' });
  });
});
