import { describe, expect, it, vi } from 'vitest';
import { loadPublicMenu, PUBLIC_MENU_LOAD_TIMEOUT_MS } from '@/lib/loadPublicMenu';
import type { PublishedMenu, StoreService } from '@/lib/services';

describe('carga del menú público', () => {
  it('descarga la ficha y sus productos una sola vez', async () => {
    const menu = { store: { id: 'r1' }, slug: 'carta' } as PublishedMenu;
    const service = {
      getPublishedMenu: vi.fn().mockResolvedValue(menu),
      listProducts: vi.fn().mockResolvedValue([{ id: 'p1' }]),
    } as unknown as StoreService;

    await expect(loadPublicMenu('carta', service)).resolves.toMatchObject({
      menu,
      products: [{ id: 'p1' }],
    });
    expect(service.getPublishedMenu).toHaveBeenCalledTimes(1);
    expect(service.listProducts).toHaveBeenCalledTimes(1);
  });

  it('abandona una red colgada para que la interfaz permita reintentar', async () => {
    vi.useFakeTimers();
    const service = {
      getPublishedMenu: vi.fn().mockReturnValue(new Promise(() => {})),
    } as unknown as StoreService;

    const pending = loadPublicMenu('carta', service);
    const expectation = expect(pending).rejects.toThrow('public-menu-load-timeout');
    await vi.advanceTimersByTimeAsync(PUBLIC_MENU_LOAD_TIMEOUT_MS + 1);
    await expectation;
    vi.useRealTimers();
  });
});
