import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { storeService } from '@/lib/services';
import {
  CATALOG_ERROR_MESSAGE,
  CATALOG_LOAD_TIMEOUT_MS,
  CATALOG_OFFLINE_MESSAGE,
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

  it('revalida negocios, categorías y productos ya abiertos', async () => {
    const stores = await storeService.listStores();
    const storeId = stores[0]!.id;
    await useCatalogStore.getState().loadProducts(storeId);
    const storesSpy = vi.spyOn(storeService, 'listStores');
    const categoriesSpy = vi.spyOn(storeService, 'listCategories');
    const productsSpy = vi.spyOn(storeService, 'listProducts');

    await useCatalogStore.getState().refreshCatalog();

    expect(storesSpy).toHaveBeenCalledTimes(1);
    expect(categoriesSpy).toHaveBeenCalledTimes(1);
    expect(productsSpy).toHaveBeenCalledWith(storeId);
  });

  it('carga una ficha sin depender del catálogo completo', async () => {
    const expected = (await storeService.listStores())[0]!;
    const detail = vi.spyOn(storeService, 'getStore').mockResolvedValue(expected);
    const catalog = vi.spyOn(storeService, 'listStores').mockRejectedValue(new Error('catálogo lento'));

    await useCatalogStore.getState().loadStore(expected.id);

    expect(useCatalogStore.getState().getStore(expected.id)).toEqual(expected);
    expect(useCatalogStore.getState().storeStatus[expected.id]).toBe('ready');
    expect(detail).toHaveBeenCalledWith(expected.id);
    expect(catalog).not.toHaveBeenCalled();
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

  it('no se queda cargando cuando el catálogo nunca responde', async () => {
    vi.useFakeTimers();
    // Petición que jamás se resuelve: el caso observado sin salida a internet.
    vi.spyOn(storeService, 'listStores').mockReturnValueOnce(new Promise(() => {}));

    const pending = useCatalogStore.getState().loadStores();
    expect(useCatalogStore.getState().storesStatus).toBe('loading');

    await vi.advanceTimersByTimeAsync(CATALOG_LOAD_TIMEOUT_MS + 1);
    await pending;

    expect(useCatalogStore.getState()).toMatchObject({
      storesStatus: 'error',
      storesError: CATALOG_ERROR_MESSAGE,
    });
    vi.useRealTimers();
  });

  it('avisa de falta de conexión en lugar del error genérico', async () => {
    const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    vi.spyOn(storeService, 'listStores').mockRejectedValueOnce(new Error('sin red'));

    await useCatalogStore.getState().loadStores();

    expect(useCatalogStore.getState().storesError).toBe(CATALOG_OFFLINE_MESSAGE);
    onLine.mockRestore();
  });
});
