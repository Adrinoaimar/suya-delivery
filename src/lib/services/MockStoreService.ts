import { categories, products, stores } from '@/data';
import { menuSlugFromName, normalize } from '@/utils/format';
import type { Category, Product, Store } from '@/types';
import type { MenuSettings, PublishedMenu, StoreService } from './types';

const MOCK_MENU_SETTINGS_KEY = 'suya.mock.menu-settings';
const DEFAULT_PRIMARY = '#EF6C3B';
const DEFAULT_ACCENT = '#183B3B';

function hexColor(value: unknown, fallback: string): string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/iu.test(value) ? value : fallback;
}

function fontFamily(value: unknown): MenuSettings['fontFamily'] {
  return value === 'Inter' ? 'Inter' : 'Montserrat';
}

function storedSettings(): Record<string, MenuSettings> {
  if (typeof localStorage === 'undefined') return {};
  try {
    const value: unknown = JSON.parse(localStorage.getItem(MOCK_MENU_SETTINGS_KEY) ?? '{}');
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, MenuSettings>
      : {};
  } catch {
    return {};
  }
}

function persistSettings(settings: Record<string, MenuSettings>): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(MOCK_MENU_SETTINGS_KEY, JSON.stringify(settings));
}

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
    const match = await Promise.all(stores.map(async (store) => ({ store, settings: await this.getMenuSettings(store.id) })))
      .then((entries) => entries.find(({ settings }) => settings?.published && settings.slug === normalizedSlug));
    if (!match?.settings) return undefined;

    return {
      store: match.store,
      slug: normalizedSlug,
      brand: {
        logoUrl: match.settings.logoUrl,
        heroImageUrl: match.settings.heroImageUrl,
        primaryColor: match.settings.primaryColor,
        accentColor: match.settings.accentColor,
        fontFamily: match.settings.fontFamily,
      },
    };
  }

  async getMenuSettings(restaurantId: string): Promise<MenuSettings | undefined> {
    const store = stores.find((candidate) => candidate.id === restaurantId);
    if (!store) return undefined;
    const defaults: MenuSettings = {
      restaurantId: store.id,
      slug: menuSlugFromName(store.name),
      published: true,
      logoUrl: store.logo,
      heroImageUrl: store.image,
      primaryColor: store.theme?.primary ?? DEFAULT_PRIMARY,
      accentColor: store.theme?.accent ?? DEFAULT_ACCENT,
      fontFamily: 'Montserrat',
    };
    const saved = storedSettings()[store.id];
    if (!saved) return defaults;
    return {
      ...defaults,
      ...saved,
      restaurantId: store.id,
      slug: typeof saved.slug === 'string' && saved.slug.trim() ? saved.slug.trim().toLowerCase() : defaults.slug,
      published: saved.published !== false,
      primaryColor: hexColor(saved.primaryColor, defaults.primaryColor),
      accentColor: hexColor(saved.accentColor, defaults.accentColor),
      fontFamily: fontFamily(saved.fontFamily),
    };
  }

  async saveMenuSettings(settings: MenuSettings): Promise<MenuSettings> {
    const store = stores.find((candidate) => candidate.id === settings.restaurantId);
    if (!store) throw new Error('El restaurante no existe en el catálogo local.');
    const slug = settings.slug.trim().toLowerCase();
    if (!/^[a-z0-9-]{3,80}$/.test(slug)) {
      throw new Error('El enlace solo admite letras minúsculas, números y guiones.');
    }
    const saved: MenuSettings = {
      restaurantId: store.id,
      slug,
      published: settings.published,
      logoUrl: settings.logoUrl,
      heroImageUrl: settings.heroImageUrl,
      primaryColor: hexColor(settings.primaryColor, DEFAULT_PRIMARY),
      accentColor: hexColor(settings.accentColor, DEFAULT_ACCENT),
      fontFamily: fontFamily(settings.fontFamily),
    };
    const all = storedSettings();
    all[store.id] = saved;
    persistSettings(all);
    return saved;
  }

  async uploadMenuImage(restaurantId: string, _kind: 'logo' | 'hero', file: File): Promise<string> {
    if (!stores.some((store) => store.id === restaurantId)) throw new Error('El restaurante no existe en el catálogo local.');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      throw new Error('Usa una imagen JPG, PNG o WebP.');
    }
    if (file.size > 1.5 * 1024 * 1024) throw new Error('La imagen local no puede superar 1.5 MB.');
    if (typeof FileReader === 'undefined') throw new Error('El navegador no permite leer imágenes locales.');
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('No se pudo leer la imagen local.'));
      reader.onload = () => typeof reader.result === 'string'
        ? resolve(reader.result)
        : reject(new Error('La imagen local no devolvió datos.'));
      reader.readAsDataURL(file);
    });
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
