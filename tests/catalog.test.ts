import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { storeService } from '@/lib/services';
import {
  CATALOG_ERROR_MESSAGE,
  createCatalogInitialState,
  useCatalogStore,
} from '@/store/catalogStore';

describe('catálogo asíncrono', () => {
  beforeEach(() => {
    useCatalogStore.setState(createCatalogInitialState());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('carga y conserva en caché los negocios', async () => {
    const spy = vi.spyOn(storeService, 'listStores');

    await useCatalogStore.getState().loadStores();
    await useCatalogStore.getState().loadStores();

    const state = useCatalogStore.getState();
    expect(state.storesStatus).toBe('ready');
    expect(state.stores.length).toBeGreaterThan(0);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('carga categorías desde el servicio y evita solicitudes repetidas', async () => {
    const spy = vi.spyOn(storeService, 'listCategories');

    await useCatalogStore.getState().loadCategories();
    await useCatalogStore.getState().loadCategories();

    expect(useCatalogStore.getState().categoriesStatus).toBe('ready');
    expect(useCatalogStore.getState().categories.length).toBeGreaterThan(0);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('expone error y permite reintentar', async () => {
    vi.spyOn(storeService, 'listStores').mockRejectedValueOnce(new Error('sin red'));

    await useCatalogStore.getState().loadStores();
    expect(useCatalogStore.getState()).toMatchObject({
      storesStatus: 'error',
      storesError: CATALOG_ERROR_MESSAGE,
    });

    await useCatalogStore.getState().loadStores(true);
    expect(useCatalogStore.getState().storesStatus).toBe('ready');
  });

  it('carga productos por negocio sin repetir solicitudes', async () => {
    const stores = await storeService.listStores();
    const storeId = stores[0]!.id;
    const spy = vi.spyOn(storeService, 'listProducts');

    await useCatalogStore.getState().loadProducts(storeId);
    await useCatalogStore.getState().loadProducts(storeId);

    expect(useCatalogStore.getState().productsStatus[storeId]).toBe('ready');
    expect(useCatalogStore.getState().productsByStore[storeId]).toBeDefined();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('descarta una respuesta de búsqueda obsoleta', async () => {
    let resolveFirst!: (value: { stores: []; products: [] }) => void;
    const first = new Promise<{ stores: []; products: [] }>((resolve) => {
      resolveFirst = resolve;
    });
    const latest = { stores: [], products: [] };

    vi.spyOn(storeService, 'search')
      .mockReturnValueOnce(first)
      .mockResolvedValueOnce(latest);

    const staleRequest = useCatalogStore.getState().search('primero');
    await useCatalogStore.getState().search('segundo');
    resolveFirst({ stores: [], products: [] });
    await staleRequest;

    expect(useCatalogStore.getState()).toMatchObject({
      searchQuery: 'segundo',
      searchStatus: 'ready',
      searchResults: latest,
    });
  });
});
