import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import StoreDetailPage from '@/pages/customer/StoreDetailPage';
import { createCatalogInitialState, useCatalogStore } from '@/store/catalogStore';
import { useCartStore } from '@/store/cartStore';
import { stores } from '@/data';

describe('StoreDetailPage', () => {
  const store = stores.find((candidate) => candidate.id === 'don-pizza')!;

  beforeEach(() => {
    useCatalogStore.setState({
      ...createCatalogInitialState(),
      stores: [store],
      storesStatus: 'ready',
      storeStatus: { [store.id]: 'ready' },
      productsByStore: { [store.id]: [] },
      productsStatus: { [store.id]: 'ready' },
    });
    useCartStore.setState({
      items: [],
      storeId: null,
      origin: 'suya_menu',
      menuSlug: 'stale-menu',
      offerCode: null,
    });
    sessionStorage.setItem(
      'suya.tableContext',
      JSON.stringify({ tableId: 'table-1', restaurantId: store.id, tableNumber: '4' }),
    );
  });

  it('limpia el contexto de mesa al entrar por delivery', async () => {
    render(
      <MemoryRouter initialEntries={[`/store/${store.id}`]}>
        <Routes>
          <Route path="/store/:id" element={<StoreDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: store.name })).toBeInTheDocument();
    expect(sessionStorage.getItem('suya.tableContext')).toBeNull();
    expect(useCartStore.getState().origin).toBe('delivery');
    expect(useCartStore.getState().menuSlug).toBeNull();
  });
});
