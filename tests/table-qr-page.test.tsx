import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TableQrPage from '@/pages/customer/TableQrPage';
import type { Store } from '@/types';

const mocks = vi.hoisted(() => ({
  resolve: vi.fn(),
  openGuest: vi.fn(),
  listStores: vi.fn(),
}));

vi.mock('@/lib/services', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services')>()),
  tableService: {
    resolve: mocks.resolve,
    openGuest: mocks.openGuest,
  },
  storeService: {
    listStores: mocks.listStores,
  },
}));

const restaurant: Store = {
  id: 'restaurant-1',
  name: 'Donde Joel',
  categoryId: 'restaurants',
  tags: ['Criollo'],
  description: 'Comida casera',
  rating: 4.8,
  reviews: 10,
  etaMin: 20,
  etaMax: 40,
  deliveryFee: 5,
  minOrder: 0,
  distanceKm: 1,
  isLocal: true,
  isFeatured: false,
  isRealBrand: true,
  promoLabel: null,
  schedule: { opens: '00:00', closes: '23:59' },
  address: 'Sullana',
  phone: '',
  image: null,
  logo: null,
  sections: [],
};

describe('TableQrPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolve.mockResolvedValue({
      tableId: 'table-1',
      restaurantId: restaurant.id,
      tableNumber: '12',
      restaurantName: restaurant.name,
      sessionId: null,
    });
    mocks.openGuest.mockResolvedValue('session-1');
    mocks.listStores.mockResolvedValue([restaurant]);
  });

  it('usa la mesa y restaurante resueltos por el token, no los parámetros editables', async () => {
    render(
      <MemoryRouter initialEntries={['/table/real-token?restaurant=other&table=99']}>
        <Routes>
          <Route path="/table/:token" element={<TableQrPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('Mesa 12')).toBeInTheDocument();
    expect(screen.queryByText('Mesa 99')).not.toBeInTheDocument();
    expect(screen.getAllByText('Donde Joel')).not.toHaveLength(0);
    expect(screen.getByRole('link', { name: /Ver carta/ })).toHaveAttribute(
      'href',
      '/store/restaurant-1',
    );
    expect(mocks.resolve).toHaveBeenCalledWith('real-token');
    expect(mocks.openGuest).toHaveBeenCalledWith('real-token');
  });
});
