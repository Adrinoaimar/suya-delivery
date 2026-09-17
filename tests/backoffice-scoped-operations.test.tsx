import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CatalogPage from '@/pages/backoffice/CatalogPage';
import OffersPage from '@/pages/backoffice/OffersPage';
import RidersOperationsPage from '@/pages/backoffice/RidersOperationsPage';
import TablesOperationsPage from '@/pages/backoffice/TablesOperationsPage';
import { useAuthStore } from '@/store/authStore';
import { useBackofficeContextStore } from '@/store/backofficeContextStore';
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
  listOffers: vi.fn(),
  createOffer: vi.fn(),
  setOfferActive: vi.fn(),
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
  offerService: {
    listManageable: mocks.listOffers,
    create: mocks.createOffer,
    setActive: mocks.setOfferActive,
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
  mocks.listOffers.mockResolvedValue([]);
}

beforeEach(reset);
afterEach(() => {
  vi.unstubAllEnvs();
  useAuthStore.setState({ status: 'idle', identity: null, error: null });
});

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

  it('muestra la cuenta fijada antes de que termine la carga de mesas', async () => {
    let releaseTables!: (value: unknown[]) => void;
    mocks.listTables.mockImplementationOnce(
      () => new Promise<unknown[]>((resolve) => {
        releaseTables = resolve;
      }),
    );

    render(<TablesOperationsPage />);

    expect(await screen.findByText('Cuenta fijada')).toBeInTheDocument();
    expect(screen.getByText(restaurant.name)).toBeInTheDocument();
    releaseTables([]);
  });

  it('carga los platos y el estado de publicación de la cuenta', async () => {
    render(<CatalogPage />);

    expect(await screen.findByText('Arroz con mariscos')).toBeInTheDocument();
    expect(screen.getByText(/1 platos disponibles · Publicado/)).toBeInTheDocument();
    expect(mocks.listProducts).toHaveBeenCalledWith(restaurant.id);
    expect(mocks.getMenuSettings).toHaveBeenCalledWith(restaurant.id);
  });

  it('muestra el restaurante antes de que terminen platos y configuración', async () => {
    let releaseProducts!: (value: Product[]) => void;
    let releaseSettings!: (value: unknown) => void;
    mocks.listProducts.mockImplementationOnce(
      () => new Promise<Product[]>((resolve) => {
        releaseProducts = resolve;
      }),
    );
    mocks.getMenuSettings.mockImplementationOnce(
      () => new Promise<unknown>((resolve) => {
        releaseSettings = resolve;
      }),
    );

    render(<CatalogPage />);

    expect(await screen.findByText(restaurant.name)).toBeInTheDocument();
    releaseProducts([product]);
    releaseSettings({
      restaurantId: restaurant.id,
      slug: 'donde-joel-menu',
      published: true,
      logoUrl: null,
      heroImageUrl: null,
      primaryColor: '#0647A9',
      accentColor: '#FF7A00',
      fontFamily: 'Inter',
    });
  });

  it('preselecciona la primera cuenta autorizada cuando staff tiene varias sedes', async () => {
    const secondRestaurant = { ...restaurant, id: 'restaurant-2', name: 'Andá Paya' };
    useAuthStore.setState({
      status: 'authenticated',
      identity: { ...identity, restaurantIds: [restaurant.id, secondRestaurant.id] },
      error: null,
    });
    mocks.listStores.mockResolvedValue([restaurant, secondRestaurant]);

    render(<CatalogPage />);

    const selector = await screen.findByLabelText('Cuenta de restaurante');
    expect(selector).toHaveValue(restaurant.id);
    expect(screen.getByRole('heading', { name: restaurant.name })).toBeInTheDocument();
  });

  it('permite seleccionar una sede staff sin dejar Mesas y QR sin contexto', async () => {
    const secondRestaurant = { ...restaurant, id: 'restaurant-2', name: 'Andá Paya' };
    useAuthStore.setState({
      status: 'authenticated',
      identity: { ...identity, restaurantIds: [restaurant.id, secondRestaurant.id] },
      error: null,
    });
    mocks.listStores.mockResolvedValue([restaurant, secondRestaurant]);

    render(<TablesOperationsPage />);

    const selector = await screen.findByLabelText('Cuenta de restaurante');
    expect(selector).toHaveValue(restaurant.id);
    fireEvent.change(selector, { target: { value: secondRestaurant.id } });
    await waitFor(() => expect(selector).toHaveValue(secondRestaurant.id));
  });

  it('preselecciona una sede staff para administrar repartidores', async () => {
    const secondRestaurant = { ...restaurant, id: 'restaurant-2', name: 'Andá Paya' };
    useAuthStore.setState({
      status: 'authenticated',
      identity: { ...identity, restaurantIds: [restaurant.id, secondRestaurant.id] },
      error: null,
    });
    mocks.listStores.mockResolvedValue([restaurant, secondRestaurant]);

    render(<RidersOperationsPage />);

    const selector = await screen.findByLabelText('Cuenta de restaurante');
    expect(selector).toHaveValue(restaurant.id);
    expect(screen.getByText(`Agregar a ${restaurant.name}`)).toBeInTheDocument();
  });

  it('preselecciona el primer restaurante visible para administración', async () => {
    useAuthStore.setState({
      status: 'authenticated',
      identity: { ...identity, access: ['platform_admin'], restaurantIds: [] },
      error: null,
    });

    render(<OffersPage />);

    await waitFor(() => expect(screen.getByLabelText('Restaurante')).toHaveValue(restaurant.id));
  });

  it('descarta un contexto obsoleto al recargar el formulario de ofertas', async () => {
    render(<OffersPage />);

    const selector = await screen.findByLabelText('Restaurante');
    expect(selector).toHaveValue(restaurant.id);
    useBackofficeContextStore.setState({ activeRestaurantId: 'stale-restaurant' });

    fireEvent.click(screen.getByRole('button', { name: 'Actualizar' }));

    await waitFor(() => expect(mocks.listStores).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(selector).toHaveValue(restaurant.id));
  });

  it('normaliza el origen del enlace público del menú', async () => {
    vi.stubEnv('VITE_CUSTOMER_APP_URL', 'https://suyadelivery.com/');
    render(<CatalogPage />);

    expect(await screen.findByRole('link', { name: 'Abrir vista pública' })).toHaveAttribute(
      'href',
      'https://suyadelivery.com/menu/donde-joel-menu',
    );
  });

  it('descarta una respuesta de catálogo que pertenece a una cuenta anterior', async () => {
    let releaseFirstLoad: (value: Store[]) => void = () => undefined;
    const firstLoad = new Promise<Store[]>((resolve) => {
      releaseFirstLoad = resolve;
    });
    const nextRestaurant = { ...restaurant, id: 'restaurant-2', name: 'Andá Paya' };
    const nextProduct = { ...product, id: 'product-2', storeId: nextRestaurant.id, name: 'Ceviche' };
    const nextIdentity = { ...identity, restaurantIds: [nextRestaurant.id] };

    mocks.listStores.mockReset();
    mocks.listStores.mockImplementationOnce(() => firstLoad).mockResolvedValue([nextRestaurant]);
    mocks.listProducts.mockImplementation((storeId: string) =>
      Promise.resolve([storeId === restaurant.id ? product : nextProduct]),
    );
    mocks.getMenuSettings.mockImplementation((storeId: string) =>
      Promise.resolve({
        restaurantId: storeId,
        slug: storeId === restaurant.id ? 'donde-joel-menu' : 'anda-paya-menu',
        published: true,
        logoUrl: null,
        heroImageUrl: null,
        primaryColor: '#0647A9',
        accentColor: '#FF7A00',
        fontFamily: 'Inter' as const,
      }),
    );

    render(<CatalogPage />);
    useAuthStore.setState({ identity: nextIdentity });

    expect(await screen.findByText('Ceviche')).toBeInTheDocument();
    releaseFirstLoad([restaurant]);
    await waitFor(() => expect(screen.queryByText('Arroz con mariscos')).not.toBeInTheDocument());
    expect(screen.getByText('Andá Paya')).toBeInTheDocument();
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
    expect(mocks.listRiders).toHaveBeenCalledTimes(1);
  });
});
