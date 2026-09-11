import { categories, products, stores } from '@/data';
import { menuSlugFromName, normalize } from '@/utils/format';
import type { Category, Product, Store } from '@/types';
import type { MenuSettings, PublishedMenu, StoreService } from './types';

/** Implementación local asíncrona sobre los JSON de `src/data`. */
export class MockStoreServiceImpl implements StoreService {
  async listCategories(): Promise<Category[]> {
    return categories;
  }

  async listStores(): Promise<Store[]> {
    return stores;
  }

  async getStore(id: string): Promise<Store | undefined> {
    return stores.find((store) => store.id === id);
  }

  async getPublishedMenu(slug: string): Promise<PublishedMenu | undefined> {
    const normalizedSlug = slug.trim().toLowerCase();
    if (!normalizedSlug) return undefined;
    const store = stores.find((candidate) => menuSlugFromName(candidate.name) === normalizedSlug);
    if (!store) return undefined;

    return {
      store,
      slug: normalizedSlug,
      brand: {
        logoUrl: store.logo,
        heroImageUrl: store.image,
        primaryColor: store.theme?.primary ?? '#EF6C3B',
        accentColor: store.theme?.accent ?? '#183B3B',
        fontFamily: 'Montserrat',
      },
    };
  }

  async getMenuSettings(restaurantId: string): Promise<MenuSettings | undefined> {
    const store = stores.find((candidate) => candidate.id === restaurantId);
    if (!store) return undefined;
    return {
      restaurantId: store.id,
      slug: menuSlugFromName(store.name),
      published: true,
      logoUrl: store.logo,
      heroImageUrl: store.image,
      primaryColor: store.theme?.primary ?? '#EF6C3B',
      accentColor: store.theme?.accent ?? '#183B3B',
      fontFamily: 'Montserrat',
    };
  }

  async saveMenuSettings(_settings: MenuSettings): Promise<MenuSettings> {
    throw new Error('La publicación de menús requiere Supabase.');
  }

  async uploadMenuImage(_restaurantId: string, _kind: 'logo' | 'hero', _file: File): Promise<string> {
    throw new Error('La carga de imágenes requiere Supabase.');
  }

  async listProducts(storeId: string): Promise<Product[]> {
    return products.filter((product) => product.storeId === storeId);
  }

  async getProduct(id: string): Promise<Product | undefined> {
    return products.find((product) => product.id === id);
  }

  async search(query: string): Promise<{ stores: Store[]; products: Product[] }> {
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
