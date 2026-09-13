import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MobileRoutes } from '@/routes/MobileRoutes';
import { useAuthStore } from '@/store/authStore';
import type { AuthIdentity } from '@/lib/auth/types';
import type { Store } from '@/types';

const mocks = vi.hoisted(() => ({
  listStores: vi.fn(),
  listRiders: vi.fn(),
  notify: vi.fn(),
}));

vi.mock('@/lib/services', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services')>()),
  storeService: { listStores: mocks.listStores },
  restaurantRiderService: { list: mocks.listRiders },
  notificationService: { notify: mocks.notify },
}));

const restaurant: Store = {
  id: 'restaurant-1',
  name: 'Donde Joel',
  categoryId: 'restaurants',
  tags: [],
  description: '',
  rating: 5,
  reviews: 0,
  etaMin: 20,
  etaMax: 45,
  deliveryFee: 0,
  minOrder: 0,
  distanceKm: 0,
  isLocal: true,
  isFeatured: true,
  isRealBrand: true,
  promoLabel: null,
  schedule: { opens: '00:00', closes: '23:59' },
  address: 'Sullana',
  phone: '',
  image: null,
  logo: null,
  sections: [],
};

const identity: AuthIdentity = {
  id: 'user-1',
  email: 'owner@example.test',
  displayName: 'Propietario',
  phone: '',
  defaultAddress: '',
  defaultReference: '',
  access: ['restaurant_staff'],
  restaurantIds: [restaurant.id],
};

describe('MobileRoutes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ status: 'authenticated', identity, error: null });
    mocks.listStores.mockResolvedValue([restaurant]);
    mocks.listRiders.mockResolvedValue([]);
  });

  afterEach(() => useAuthStore.setState({ status: 'idle', identity: null, error: null }));

  it('monta la gestión real de repartidores en la ruta móvil', async () => {
    render(
      <MemoryRouter initialEntries={['/backoffice/riders']}>
        <MobileRoutes />
      </MemoryRouter>,
    );

    expect(
      await screen.findByText('Invita y habilita repartidores para que la cuenta pueda asignarles pedidos.'),
    ).toBeInTheDocument();
    expect(await screen.findByText('Agregar a Donde Joel')).toBeInTheDocument();
  });
});
