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

  it('marca como próximamente las fichas que no están en los tres negocios publicados', async () => {
    const listed = await service.listStores();
    expect(listed.filter((store) => !store.isComingSoon).map((store) => store.id)).toEqual([
      'donde-joel',
      'anda-paya',
      'anda-paya-cevicheria',
    ]);
    expect(listed.filter((store) => store.isComingSoon)).toHaveLength(12);
    expect(listed.find((store) => store.id === 'kfc')).toMatchObject({
      isComingSoon: true,
      acceptingOrders: false,
    });
    expect(listed.find((store) => store.id === 'inkafarma')).toMatchObject({
      isComingSoon: true,
      acceptingOrders: false,
    });
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

  it('persiste la configuración local y respeta publicación y branding', async () => {
    const store = stores.find((candidate) => candidate.id === 'kfc')!;
    const saved = await service.saveMenuSettings({
      restaurantId: store.id,
      slug: 'kfc-especial-menu',
      published: false,
      logoUrl: '/brand/stores/kfc-logo.png',
      heroImageUrl: null,
      primaryColor: '#123456',
      accentColor: '#abcdef',
      fontFamily: 'Inter',
    });

    expect(saved.slug).toBe('kfc-especial-menu');
    await expect(service.getPublishedMenu('kfc-menu')).resolves.toBeUndefined();
    await expect(service.getPublishedMenu('kfc-especial-menu')).resolves.toBeUndefined();

    await service.saveMenuSettings({ ...saved, published: true });
    await expect(service.getPublishedMenu('kfc-especial-menu')).resolves.toMatchObject({
      brand: {
        logoUrl: '/brand/stores/kfc-logo.png',
        primaryColor: '#123456',
        accentColor: '#abcdef',
        fontFamily: 'Inter',
      },
    });
  });

  it('lee una imagen local para el editor de branding', async () => {
    const file = new File(['logo'], 'logo.png', { type: 'image/png' });
    await expect(service.uploadMenuImage('kfc', 'logo', file)).resolves.toMatch(
      /^data:image\/png;base64,/,
    );
  });

  it('propaga el logo guardado a la ficha, búsqueda y carta pública', async () => {
    await service.saveStoreLogo('kfc', '/brand/stores/kfc-logo.png');

    await expect(service.getStore('kfc')).resolves.toMatchObject({
      logo: '/brand/stores/kfc-logo.png',
    });
    await expect(service.search('kfc')).resolves.toMatchObject({
      stores: [{ id: 'kfc', logo: '/brand/stores/kfc-logo.png' }],
    });
    await expect(service.getPublishedMenu('kfc-menu')).resolves.toMatchObject({
      store: { logo: '/brand/stores/kfc-logo.png' },
      brand: { logoUrl: '/brand/stores/kfc-logo.png' },
    });
  });

  it('rechaza activos con esquemas no renderizables', async () => {
    const store = stores.find((candidate) => candidate.id === 'kfc')!;
    await expect(
      service.saveMenuSettings({
        restaurantId: store.id,
        slug: 'kfc-seguro-menu',
        published: true,
        logoUrl: 'javascript:alert(1)',
        heroImageUrl: store.image,
        primaryColor: '#EF6C3B',
        accentColor: '#183B3B',
        fontFamily: 'Montserrat',
      }),
    ).rejects.toThrow('La imagen debe usar');
  });

  it('aplica la misma regla de slug que Supabase', async () => {
    const store = stores.find((candidate) => candidate.id === 'kfc')!;
    await expect(
      service.saveMenuSettings({
        restaurantId: store.id,
        slug: 'KFC menú',
        published: true,
        logoUrl: store.logo,
        heroImageUrl: store.image,
        primaryColor: '#EF6C3B',
        accentColor: '#183B3B',
        fontFamily: 'Montserrat',
      }),
    ).rejects.toThrow('El enlace solo admite');
  });
});
