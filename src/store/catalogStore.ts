import { create } from 'zustand';
import { storeService } from '@/lib/services';
import type { Category, Product, Store } from '@/types';

/**
 * Estado del catálogo (negocios y productos).
 *
 * El `StoreService` es asíncrono: este store concentra los estados de carga, error y
 * reintento para que las pantallas nunca consuman el servicio directamente y puedan
 * mostrar skeletons y mensajes claros mientras el catálogo llega.
 */

export type CatalogLoadStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface CatalogSearchResults {
  stores: Store[];
  products: Product[];
}

/** Mensajes en lenguaje claro: el detalle técnico nunca llega a la interfaz. */
export const CATALOG_ERROR_MESSAGE = 'No pudimos cargar el catálogo de negocios.';
export const CATALOG_OFFLINE_MESSAGE = 'Sin conexión. Conéctate para ver los negocios de Sullana.';

/** Espera máxima de una carga antes de ofrecer reintento, en milisegundos. */
export const CATALOG_LOAD_TIMEOUT_MS = 12_000;

/**
 * Una petición que nunca responde dejaba la pantalla en skeleton indefinido, sin
 * forma de salir. El límite la convierte en un estado de error con reintento.
 * No altera ningún contrato del servicio: solo acota lo que la interfaz espera.
 */
function withLoadTimeout<T>(work: Promise<T>, timeoutMs = CATALOG_LOAD_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('catalog-load-timeout')), timeoutMs);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error('catalog-load-failed'));
      },
    );
  });
}

/** Distingue «no hay red» de «el catálogo falló», que piden acciones distintas. */
function loadErrorMessage(fallback: string): string {
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  return offline ? CATALOG_OFFLINE_MESSAGE : fallback;
}
export const PRODUCTS_ERROR_MESSAGE = 'No pudimos cargar el menú de este negocio.';
export const SEARCH_ERROR_MESSAGE = 'No pudimos completar la búsqueda.';

interface CatalogState {
  categories: Category[];
  categoriesStatus: CatalogLoadStatus;
  categoriesError: string | null;
  stores: Store[];
  storesStatus: CatalogLoadStatus;
  storesError: string | null;
  storeStatus: Record<string, CatalogLoadStatus>;
  storeError: Record<string, string | null>;
  productsByStore: Record<string, Product[]>;
  productsStatus: Record<string, CatalogLoadStatus>;
  productsError: Record<string, string | null>;
  searchQuery: string;
  searchStatus: CatalogLoadStatus;
  searchError: string | null;
  searchResults: CatalogSearchResults;
  /** Carga la lista de negocios. Con `force` reintenta aunque ya esté lista o fallando. */
  loadStores: (force?: boolean) => Promise<void>;
  /** Carga una sola ficha, sin bloquearla por el catálogo completo. */
  loadStore: (id: string, force?: boolean) => Promise<void>;
  loadCategories: (force?: boolean) => Promise<void>;
  /** Carga los productos de un negocio. Con `force` reintenta aunque ya estén listos. */
  loadProducts: (storeId: string, force?: boolean) => Promise<void>;
  /** Busca negocios y productos. Una búsqueda nueva descarta la respuesta anterior. */
  search: (query: string) => Promise<void>;
  /** Negocio ya cargado en caché; `undefined` si aún no llega o no existe. */
  getStore: (id: string) => Store | undefined;
}

/** Estado inicial en un factory: las pruebas lo usan para reiniciar sin compartir objetos. */
export function createCatalogInitialState(): Pick<
  CatalogState,
  | 'stores'
  | 'categories'
  | 'categoriesStatus'
  | 'categoriesError'
  | 'storesStatus'
  | 'storesError'
  | 'storeStatus'
  | 'storeError'
  | 'productsByStore'
  | 'productsStatus'
  | 'productsError'
  | 'searchQuery'
  | 'searchStatus'
  | 'searchError'
  | 'searchResults'
> {
  return {
    categories: [],
    categoriesStatus: 'idle',
    categoriesError: null,
    stores: [],
    storesStatus: 'idle',
    storesError: null,
    storeStatus: {},
    storeError: {},
    productsByStore: {},
    productsStatus: {},
    productsError: {},
    searchQuery: '',
    searchStatus: 'idle',
    searchError: null,
    searchResults: { stores: [], products: [] },
  };
}

// Descarta respuestas de búsquedas que el usuario ya reemplazó por un término nuevo.
let searchToken = 0;

export const useCatalogStore = create<CatalogState>((set, get) => ({
  ...createCatalogInitialState(),

  async loadStores(force = false) {
    const status = get().storesStatus;
    if (!force && (status === 'ready' || status === 'loading')) return;

    set({ storesStatus: 'loading', storesError: null });
    try {
      const stores = await withLoadTimeout(storeService.listStores());
      set({ stores, storesStatus: 'ready', storesError: null });
    } catch {
      set({ storesStatus: 'error', storesError: loadErrorMessage(CATALOG_ERROR_MESSAGE) });
    }
  },

  async loadStore(id, force = false) {
    const status = get().storeStatus[id] ?? 'idle';
    if (!force && (status === 'ready' || status === 'loading')) return;

    set((state) => ({
      storeStatus: { ...state.storeStatus, [id]: 'loading' },
      storeError: { ...state.storeError, [id]: null },
    }));
    try {
      const store = await withLoadTimeout(storeService.getStore(id));
      set((state) => ({
        stores: store
          ? [...state.stores.filter((entry) => entry.id !== id), store]
          : state.stores.filter((entry) => entry.id !== id),
        storeStatus: { ...state.storeStatus, [id]: 'ready' },
        storeError: { ...state.storeError, [id]: null },
      }));
    } catch {
      set((state) => ({
        storeStatus: { ...state.storeStatus, [id]: 'error' },
        storeError: { ...state.storeError, [id]: loadErrorMessage(CATALOG_ERROR_MESSAGE) },
      }));
    }
  },

  async loadCategories(force = false) {
    const status = get().categoriesStatus;
    if (!force && (status === 'ready' || status === 'loading')) return;
    set({ categoriesStatus: 'loading', categoriesError: null });
    try {
      const categories = await withLoadTimeout(storeService.listCategories());
      set({ categories, categoriesStatus: 'ready', categoriesError: null });
    } catch {
      set({ categoriesStatus: 'error', categoriesError: loadErrorMessage(CATALOG_ERROR_MESSAGE) });
    }
  },

  async loadProducts(storeId, force = false) {
    const status = get().productsStatus[storeId] ?? 'idle';
    if (!force && (status === 'ready' || status === 'loading')) return;

    set((state) => ({
      productsStatus: { ...state.productsStatus, [storeId]: 'loading' },
      productsError: { ...state.productsError, [storeId]: null },
    }));
    try {
      const products = await withLoadTimeout(storeService.listProducts(storeId));
      set((state) => ({
        productsByStore: { ...state.productsByStore, [storeId]: products },
        productsStatus: { ...state.productsStatus, [storeId]: 'ready' },
      }));
    } catch {
      set((state) => ({
        productsStatus: { ...state.productsStatus, [storeId]: 'error' },
        productsError: { ...state.productsError, [storeId]: loadErrorMessage(PRODUCTS_ERROR_MESSAGE) },
      }));
    }
  },

  async search(query) {
    const term = query.trim();
    const token = ++searchToken;

    if (term.length === 0) {
      set({
        searchQuery: query,
        searchStatus: 'idle',
        searchError: null,
        searchResults: { stores: [], products: [] },
      });
      return;
    }

    set({ searchQuery: query, searchStatus: 'loading', searchError: null });
    try {
      const results = await withLoadTimeout(storeService.search(term));
      if (token !== searchToken) return;
      set({ searchResults: results, searchStatus: 'ready', searchError: null });
    } catch {
      if (token !== searchToken) return;
      set({ searchStatus: 'error', searchError: loadErrorMessage(SEARCH_ERROR_MESSAGE) });
    }
  },

  getStore(id) {
    return get().stores.find((store) => store.id === id);
  },
}));
