import { useCallback, useEffect } from 'react';
import {
  CATALOG_INVALIDATED_EVENT,
  CATALOG_REFRESH_INTERVAL_MS,
  notifyCatalogInvalidated,
  subscribeToCatalogChanges,
} from '@/lib/catalogSync';
import { useCatalogStore } from '@/store/catalogStore';

/** Starts the customer catalog while the intro is still visible on cold start. */
export function CatalogBootstrap() {
  const loadStores = useCatalogStore((state) => state.loadStores);
  const loadCategories = useCatalogStore((state) => state.loadCategories);
  const refreshCatalog = useCatalogStore((state) => state.refreshCatalog);

  // HomePage calls the same methods. The store's loading guard makes that call a
  // no-op while this one overlaps the first network round-trip with the intro.
  useEffect(() => {
    void loadStores();
    void loadCategories();
  }, [loadCategories, loadStores]);

  const refresh = useCallback(async () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    await refreshCatalog();
    notifyCatalogInvalidated('sync');
  }, [refreshCatalog]);

  useEffect(() => {
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;

    const scheduleRefresh = () => {
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        if (!disposed) void refresh();
      }, 150);
    };
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') scheduleRefresh();
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key?.startsWith('suya.mock.')) scheduleRefresh();
    };
    const onCatalogInvalidated = (event: Event) => {
      const source = (event as CustomEvent<{ source?: string }>).detail?.source;
      if (source !== 'sync') scheduleRefresh();
    };
    const unsubscribe = subscribeToCatalogChanges(scheduleRefresh);
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, CATALOG_REFRESH_INTERVAL_MS);

    window.addEventListener('focus', refreshWhenVisible);
    window.addEventListener('storage', onStorage);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    window.addEventListener(CATALOG_INVALIDATED_EVENT, onCatalogInvalidated);

    return () => {
      disposed = true;
      clearTimeout(refreshTimer);
      window.clearInterval(interval);
      unsubscribe();
      window.removeEventListener('focus', refreshWhenVisible);
      window.removeEventListener('storage', onStorage);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
      window.removeEventListener(CATALOG_INVALIDATED_EVENT, onCatalogInvalidated);
    };
  }, [refresh]);

  return null;
}
