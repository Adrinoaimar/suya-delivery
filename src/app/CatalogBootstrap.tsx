import { useEffect } from 'react';
import { useCatalogStore } from '@/store/catalogStore';

/** Starts the customer catalog while the intro is still visible on cold start. */
export function CatalogBootstrap() {
  const loadStores = useCatalogStore((state) => state.loadStores);
  const loadCategories = useCatalogStore((state) => state.loadCategories);

  // HomePage calls the same methods. The store's loading guard makes that call a
  // no-op while this one overlaps the first network round-trip with the intro.
  useEffect(() => {
    void loadStores();
    void loadCategories();
  }, [loadCategories, loadStores]);

  return null;
}
