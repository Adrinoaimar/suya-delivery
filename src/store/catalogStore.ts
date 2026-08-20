import { create } from 'zustand';
import { storeService } from '@/lib/services';
import type { Product, Store } from '@/types';

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
export const PRODUCTS_ERROR_MESSAGE = 'No pudimos cargar el menú de este negocio.';
export const SEARCH_ERROR_MESSAGE = 'No pudimos completar la búsqueda.';

interface CatalogState {
  stores: Store[];
  storesStatus: CatalogLoadStatus;
  storesError: string | null;
  productsByStore: Record<string, Product[]>;
  productsStatus: Record<string, CatalogLoadStatus>;
  productsError: Record<string, string | null>;
  searchQuery: string;
  searchStatus: CatalogLoadStatus;
  searchError: string | null;
  searchResults: CatalogSearchResults;
  /** Carga la lista de negocios. Con `force` reintenta aunque ya esté lista o fallando. */
  loadStores: (force?: boolean) => Promise<void>;
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
  | 'storesStatus'
  | 'storesError'
  | 'productsByStore'
  | 'productsStatus'
  | 'productsError'
  | 'searchQuery'
  | 'searchStatus'
  | 'searchError'
  | 'searchResults'
> {
  return {
    stores: [],
    storesStatus: 'idle',
    storesError: null,
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
      const stores = await storeService.listStores();
      set({ stores, storesStatus: 'ready', storesError: null });
    } catch {
      set({ storesStatus: 'error', storesError: CATALOG_ERROR_MESSAGE });
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
      const products = await storeService.listProducts(storeId);
      set((state) => ({
        productsByStore: { ...state.productsByStore, [storeId]: products },
        productsStatus: { ...state.productsStatus, [storeId]: 'ready' },
      }));
    } catch {
      set((state) => ({
        productsStatus: { ...state.productsStatus, [storeId]: 'error' },
        productsError: { ...state.productsError, [storeId]: PRODUCTS_ERROR_MESSAGE },
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
      const results = await storeService.search(term);
      if (token !== searchToken) return;
      set({ searchResults: results, searchStatus: 'ready', searchError: null });
    } catch {
      if (token !== searchToken) return;
      set({ searchStatus: 'error', searchError: SEARCH_ERROR_MESSAGE });
    }
  },

  getStore(id) {
    return get().stores.find((store) => store.id === id);
  },
}));
