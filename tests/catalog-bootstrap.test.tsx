import { render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CatalogBootstrap } from '@/app/CatalogBootstrap';
import { storeService } from '@/lib/services';
import { createCatalogInitialState, useCatalogStore } from '@/store/catalogStore';

describe('precarga del catálogo', () => {
  beforeEach(() => {
    useCatalogStore.setState(createCatalogInitialState());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('inicia negocios y categorías al montar, antes de la pantalla principal', async () => {
    const stores = vi.spyOn(storeService, 'listStores');
    const categories = vi.spyOn(storeService, 'listCategories');

    render(<CatalogBootstrap />);

    await waitFor(() => {
      expect(useCatalogStore.getState().storesStatus).toBe('ready');
      expect(useCatalogStore.getState().categoriesStatus).toBe('ready');
    });

    expect(stores).toHaveBeenCalledTimes(1);
    expect(categories).toHaveBeenCalledTimes(1);
  });
});
