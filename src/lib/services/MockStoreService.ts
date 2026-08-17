import { products, stores } from '@/data';
import { normalize } from '@/utils/format';
import type { Product, Store } from '@/types';
import type { StoreService } from './types';

/** Implementación local sobre los JSON de `src/data`. */
export class MockStoreServiceImpl implements StoreService {
  listStores(): Store[] {
    return stores;
  }

  getStore(id: string): Store | undefined {
    return stores.find((store) => store.id === id);
  }

  listProducts(storeId: string): Product[] {
    return products.filter((product) => product.storeId === storeId);
  }

  getProduct(id: string): Product | undefined {
    return products.find((product) => product.id === id);
  }

  search(query: string): { stores: Store[]; products: Product[] } {
    const term = normalize(query).trim();
    if (term.length === 0) return { stores: [], products: [] };

    const matchedStores = stores.filter((store) => {
      const haystack = normalize(
        [store.name, store.description, store.categoryId, ...store.tags].join(' '),
      );
      return haystack.includes(term);
    });

    const matchedProducts = products.filter((product) =>
      normalize(`${product.name} ${product.description} ${product.section}`).includes(term),
    );

    return { stores: matchedStores, products: matchedProducts };
  }
}

export const MockStoreService = new MockStoreServiceImpl();
