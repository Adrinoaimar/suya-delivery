import { isSupabaseConfigured, supabase } from '@/lib/supabase/client';

/** Evento interno para que las cartas públicas se vuelvan a consultar sin recargar la página. */
export const CATALOG_INVALIDATED_EVENT = 'suya:catalog-invalidated';

export const CATALOG_REFRESH_INTERVAL_MS = 15_000;

type CatalogListener = () => void;
type CatalogInvalidationSource = 'mutation' | 'sync';

export function notifyCatalogInvalidated(source: CatalogInvalidationSource = 'mutation'): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(CATALOG_INVALIDATED_EVENT, { detail: { source } }));
  }
}

/**
 * Escucha cambios de catálogo cuando Supabase Realtime está disponible.
 * El polling de CatalogBootstrap queda como respaldo para instalaciones donde el canal
 * WebSocket esté bloqueado o todavía no se haya aplicado la publicación de tablas.
 */
export function subscribeToCatalogChanges(listener: CatalogListener): () => void {
  const client = supabase;
  // Vitest runs in a Node environment where Supabase Realtime's undici WebSocket
  // can emit a cross-realm Event error after the test has completed. Realtime is
  // exercised by the browser smoke flow; unit tests keep the polling fallback.
  if (!isSupabaseConfigured || !client || import.meta.env.MODE === 'test') return () => undefined;

  const channel = client
    .channel(`catalog-${crypto.randomUUID()}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'restaurants' }, listener)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'restaurant_menu_settings' },
      listener,
    )
    .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, listener)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'categories' }, listener)
    .subscribe();

  return () => {
    void client.removeChannel(channel);
  };
}
