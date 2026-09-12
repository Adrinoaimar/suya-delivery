import { storeService } from '@/lib/services';
import type { StoreService, PublishedMenu } from '@/lib/services';
import type { Product } from '@/types';

export const PUBLIC_MENU_LOAD_TIMEOUT_MS = 12_000;

export interface PublicMenuPayload {
  menu: PublishedMenu | null;
  products: Product[];
}

/** Carga acotada: una red que no responde nunca deja la carta en skeleton infinito. */
export async function loadPublicMenu(
  slug: string,
  service: StoreService = storeService,
  timeoutMs = PUBLIC_MENU_LOAD_TIMEOUT_MS,
): Promise<PublicMenuPayload> {
  const work = (async () => {
    const menu = await service.getPublishedMenu(slug);
    if (!menu) return { menu: null, products: [] };
    return { menu, products: await service.listProducts(menu.store.id) };
  })();

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('public-menu-load-timeout')), timeoutMs);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error('public-menu-load-failed'));
      },
    );
  });
}
