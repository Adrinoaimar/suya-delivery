const GUEST_TOKEN_PREFIX = 'suya.guest-order-token:';
const TOKEN_PATTERN = /^[a-z0-9_-]{32,128}$/i;
const TOKEN_BYTES = 32;

export function isGuestOrderAccessToken(value: unknown): value is string {
  return typeof value === 'string' && TOKEN_PATTERN.test(value);
}

/** Generates the client-held credential used to recover a guest retry. */
export function createGuestOrderAccessToken(): string {
  const bytes = new Uint8Array(TOKEN_BYTES);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function saveGuestOrderToken(orderId: string, token: string | null | undefined): void {
  if (!orderId || !isGuestOrderAccessToken(token)) return;
  try {
    sessionStorage.setItem(`${GUEST_TOKEN_PREFIX}${orderId}`, token);
  } catch {
    /* storage unavailable */
  }
}

export function readGuestOrderToken(orderId: string): string | null {
  if (!orderId) return null;
  try {
    const token = sessionStorage.getItem(`${GUEST_TOKEN_PREFIX}${orderId}`);
    return isGuestOrderAccessToken(token) ? token : null;
  } catch {
    return null;
  }
}

/** Consume the one-time URL fragment and remove it from browser history. */
export function consumeGuestOrderTokenFromHash(orderId: string, hash: string): string | null {
  if (!orderId || !hash) return readGuestOrderToken(orderId);
  const params = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
  const token = params.get('access');
  if (isGuestOrderAccessToken(token)) saveGuestOrderToken(orderId, token);
  try {
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}`);
  } catch {
    /* history unavailable in non-browser environments */
  }
  return readGuestOrderToken(orderId);
}

export function guestOrderAccessFragment(orderId: string): string {
  const token = readGuestOrderToken(orderId);
  return token ? `#access=${encodeURIComponent(token)}` : '';
}
