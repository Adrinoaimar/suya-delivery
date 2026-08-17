/**
 * Acceso centralizado al almacenamiento del navegador.
 * Ningún componente debe llamar a `localStorage` directamente: todo pasa por aquí.
 */

export const STORAGE_KEYS = {
  cart: 'suya_cart',
  orders: 'suya_orders',
  user: 'suya_user',
  rider: 'suya_rider',
  preferences: 'suya_preferences',
  locationShare: 'suya_location_share',
  recentSearches: 'suya_recent_searches',
  favorites: 'suya_favorites',
  safety: 'suya_safety',
  introSeen: 'suya_intro_seen',
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

function safeParse<T>(raw: string | null, fallback: T): T {
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** Lee un valor de localStorage. Devuelve `fallback` si no existe o está corrupto. */
export function readLocal<T>(key: StorageKey, fallback: T): T {
  if (!isBrowser()) return fallback;
  try {
    return safeParse(window.localStorage.getItem(key), fallback);
  } catch {
    return fallback;
  }
}

/** Escribe un valor en localStorage. Silencioso si el navegador lo bloquea (modo privado, cuota). */
export function writeLocal<T>(key: StorageKey, value: T): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* almacenamiento no disponible: la sesión sigue funcionando en memoria */
  }
}

export function removeLocal(key: StorageKey): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* noop */
  }
}

export function readSession<T>(key: StorageKey, fallback: T): T {
  if (!isBrowser()) return fallback;
  try {
    return safeParse(window.sessionStorage.getItem(key), fallback);
  } catch {
    return fallback;
  }
}

export function writeSession<T>(key: StorageKey, value: T): void {
  if (!isBrowser()) return;
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* noop */
  }
}

/** Borra todos los datos de la demo. Usado por Perfil → «Reiniciar datos demo». */
export function clearSuyaStorage(): void {
  if (!isBrowser()) return;
  Object.values(STORAGE_KEYS).forEach((key) => {
    try {
      window.localStorage.removeItem(key);
      window.sessionStorage.removeItem(key);
    } catch {
      /* noop */
    }
  });
}
