import { describe, expect, it } from 'vitest';
import { stores, products } from '@/data';
import { menuSlugFromName } from '@/utils/format';
import { MockStoreServiceImpl } from '@/lib/services/MockStoreService';

describe('menús públicos del catálogo local', () => {
  const service = new MockStoreServiceImpl();

  it.each(stores)('publica una carta resoluble para $name', async (store) => {
    const menu = await service.getPublishedMenu(menuSlugFromName(store.name));

    expect(menu).toMatchObject({
      slug: menuSlugFromName(store.name),
      store: { id: store.id },
      brand: {
        logoUrl: store.logo,
        heroImageUrl: store.image,
        primaryColor: store.theme?.primary ?? '#EF6C3B',
        accentColor: store.theme?.accent ?? '#183B3B',
        fontFamily: 'Montserrat',
      },
    });
    expect(products.filter((product) => product.storeId === store.id)).not.toHaveLength(0);
  });

  it('no expone una carta para un enlace inexistente', async () => {
    await expect(service.getPublishedMenu('restaurante-inexistente-menu')).resolves.toBeUndefined();
  });

  it('devuelve ajustes publicados para el catálogo de backoffice', async () => {
    const store = stores[0]!;
    await expect(service.getMenuSettings(store.id)).resolves.toMatchObject({
      restaurantId: store.id,
      slug: menuSlugFromName(store.name),
      published: true,
      logoUrl: store.logo,
    });
  });
});
