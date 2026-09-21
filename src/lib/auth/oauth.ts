import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';

const nativeOAuthScheme = import.meta.env.VITE_NATIVE_OAUTH_SCHEME?.trim() || 'com.suya.app';

export const NATIVE_OAUTH_CALLBACK_URL = `${nativeOAuthScheme}://auth/callback`;

const OAUTH_RETURN_PATH_KEY = 'suya.oauth.return-path';
const DEFAULT_RETURN_PATH = '/profile';

export interface NativeOAuthCallback {
  code: string | null;
  error: string | null;
  returnTo: string;
}

export function safeReturnPath(candidate: string | null | undefined, fallback = DEFAULT_RETURN_PATH): string {
  const safeFallback = fallback.startsWith('/') && !fallback.startsWith('//') ? fallback : DEFAULT_RETURN_PATH;
  if (!candidate || !candidate.startsWith('/') || candidate.startsWith('//') || candidate.includes('\\')) {
    return safeFallback;
  }

  try {
    const base = new URL('https://suya.local');
    const parsed = new URL(candidate, base);
    if (parsed.origin !== base.origin || !parsed.pathname.startsWith('/')) return safeFallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return safeFallback;
  }
}

export function googleOAuthRedirectTo(returnTo: string): string {
  const safePath = safeReturnPath(returnTo);
  rememberOAuthReturnPath(safePath);

  if (Capacitor.isNativePlatform()) return NATIVE_OAUTH_CALLBACK_URL;

  const callback = new URL('/login', window.location.origin);
  callback.searchParams.set('oauth', 'google');
  callback.searchParams.set('next', safePath);
  return callback.toString();
}

export function parseNativeOAuthCallback(url: string): NativeOAuthCallback | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  if (parsed.protocol !== `${nativeOAuthScheme}:` || parsed.hostname !== 'auth' || parsed.pathname !== '/callback') {
    return null;
  }

  const providerError = parsed.searchParams.get('error_description') ?? parsed.searchParams.get('error');
  return {
    code: parsed.searchParams.get('code'),
    error: providerError,
    returnTo: consumeOAuthReturnPath(),
  };
}

export async function openOAuthBrowser(url: string): Promise<void> {
  await Browser.open({ url, presentationStyle: 'popover' });
}

export async function closeOAuthBrowser(): Promise<void> {
  try {
    await Browser.close();
  } catch {
    // Android cierra Custom Tabs al volver por deep link; `close` puede no estar disponible.
  }
}

export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform();
}

function rememberOAuthReturnPath(returnTo: string): void {
  try {
    window.sessionStorage.setItem(OAUTH_RETURN_PATH_KEY, safeReturnPath(returnTo));
  } catch {
    // OAuth sigue funcionando; solo se pierde el destino solicitado.
  }
}

function consumeOAuthReturnPath(): string {
  try {
    const returnTo = safeReturnPath(window.sessionStorage.getItem(OAUTH_RETURN_PATH_KEY));
    window.sessionStorage.removeItem(OAUTH_RETURN_PATH_KEY);
    return returnTo;
  } catch {
    return DEFAULT_RETURN_PATH;
  }
}
