import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CatalogPage from '@/pages/backoffice/CatalogPage';
import RidersOperationsPage from '@/pages/backoffice/RidersOperationsPage';
import TablesOperationsPage from '@/pages/backoffice/TablesOperationsPage';
import { useAuthStore } from '@/store/authStore';
import type { AuthIdentity } from '@/lib/auth/types';
import type { Product, Store } from '@/types';
import type { RestaurantRider } from '@/lib/services';

const mocks = vi.hoisted(() => ({
  listStores: vi.fn(),
  listProducts: vi.fn(),
  getMenuSettings: vi.fn(),
  listTables: vi.fn(),
  createTable: vi.fn(),
  regenerateQr: vi.fn(),
  setTableActive: vi.fn(),
  listRiders: vi.fn(),
  inviteRider: vi.fn(),
  setRiderActive: vi.fn(),
  notify: vi.fn(),
}));

vi.mock('@/lib/services', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services')>()),
  storeService: {
    listStores: mocks.listStores,
    listProducts: mocks.listProducts,
    getMenuSettings: mocks.getMenuSettings,
  },
  tableService: {
    list: mocks.listTables,
    create: mocks.createTable,
    regenerateQr: mocks.regenerateQr,
    setActive: mocks.setTableActive,
  },
  restaurantRiderService: {
    list: mocks.listRiders,
    invite: mocks.inviteRider,
    setActive: mocks.setRiderActive,
  },
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
  acceptingOrders: true,
};

const product: Product = {
  id: 'product-1',
  storeId: restaurant.id,
  section: 'Marinos',
  name: 'Arroz con mariscos',
  description: '',
  price: 25,
  image: null,
  imageIsStock: false,
  popular: false,
  extras: [],
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

function reset() {
  vi.clearAllMocks();
  useAuthStore.setState({ status: 'authenticated', identity, error: null });
  mocks.listStores.mockResolvedValue([restaurant]);
  mocks.listProducts.mockResolvedValue([product]);
  mocks.getMenuSettings.mockResolvedValue({
    restaurantId: restaurant.id,
    slug: 'donde-joel-menu',
    published: true,
    logoUrl: null,
    heroImageUrl: null,
    primaryColor: '#0647A9',
    accentColor: '#FF7A00',
    fontFamily: 'Inter',
  });
  mocks.listTables.mockResolvedValue([]);
  mocks.listRiders.mockResolvedValue([]);
}

beforeEach(reset);
afterEach(() => useAuthStore.setState({ status: 'idle', identity: null, error: null }));

describe('operaciones con alcance de cuenta de restaurante', () => {
  it('fija el restaurante de la cuenta y deja solo el número de mesa', async () => {
    render(<TablesOperationsPage />);

    expect(await screen.findByLabelText('Número de mesa')).toBeInTheDocument();
    expect(
      screen.queryByRole('combobox', { name: 'Cuenta de restaurante' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText('Cuenta fijada')).toBeInTheDocument();
    expect(mocks.listTables).toHaveBeenCalledWith([restaurant.id]);
  });

  it('carga los platos y el estado de publicación de la cuenta', async () => {
    render(<CatalogPage />);

    expect(await screen.findByText('Arroz con mariscos')).toBeInTheDocument();
    expect(screen.getByText(/1 platos disponibles · Publicado/)).toBeInTheDocument();
    expect(mocks.listProducts).toHaveBeenCalledWith(restaurant.id);
    expect(mocks.getMenuSettings).toHaveBeenCalledWith(restaurant.id);
  });

  it('invita un repartidor dentro del restaurante fijado', async () => {
    const rider: RestaurantRider = {
      id: 'rider-1',
      email: 'rider@example.test',
      name: 'Diego Ramírez',
      phone: '999 999 999',
      status: 'offline',
      verifiedAt: new Date().toISOString(),
      vehicleType: 'Moto',
      vehicleColor: '',
      vehiclePlate: '',
      rating: 5,
      deliveries: 0,
      active: true,
      createdAt: new Date().toISOString(),
    };
    mocks.inviteRider.mockResolvedValue(rider);
    render(<RidersOperationsPage />);

    fireEvent.change(await screen.findByLabelText('Nombre completo'), {
      target: { value: rider.name },
    });
    fireEvent.change(screen.getByLabelText('Correo de acceso'), { target: { value: rider.email } });
    fireEvent.click(screen.getByRole('button', { name: 'Invitar repartidor' }));

    await waitFor(() =>
      expect(mocks.inviteRider).toHaveBeenCalledWith(
        expect.objectContaining({
          restaurantId: restaurant.id,
          displayName: rider.name,
          email: rider.email,
        }),
      ),
    );
    expect(await screen.findByText(rider.email)).toBeInTheDocument();
  });
});
