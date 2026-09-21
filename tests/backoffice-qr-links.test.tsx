import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import TablesOperationsPage from '@/pages/backoffice/TablesOperationsPage';
import { useAuthStore } from '@/store/authStore';
import type { Store } from '@/types';

const mocks = vi.hoisted(() => ({
  listStores: vi.fn(),
  listTables: vi.fn(),
  notify: vi.fn(),
}));

vi.mock('@/lib/services', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services')>()),
  storeService: { listStores: mocks.listStores },
  tableService: {
    list: mocks.listTables,
    create: vi.fn(),
    regenerateQr: vi.fn(),
    setActive: vi.fn(),
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

describe('QR de mesas en la cuenta del restaurante', () => {
  const customerOrigin = import.meta.env.VITE_CUSTOMER_APP_URL || 'http://localhost:3000';

  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      status: 'authenticated',
      identity: {
        id: 'owner-1',
        email: 'owner@example.test',
        displayName: 'Dueño',
        phone: '',
        defaultAddress: '',
        defaultReference: '',
        access: ['restaurant_staff'],
        restaurantIds: [restaurant.id],
      },
      error: null,
    });
    mocks.listStores.mockResolvedValue([restaurant]);
    mocks.listTables.mockResolvedValue([{
      id: 'table-1', restaurantId: restaurant.id, tableNumber: '12', status: 'available',
      sessionId: null, sessionStatus: null, total: 0, qrToken: 'server-token', active: true,
    }]);
  });

  afterEach(() => useAuthStore.setState({ status: 'idle', identity: null, error: null }));

  it('fija el restaurante y genera QR solo con el token del servidor', async () => {
    render(<MemoryRouter><TablesOperationsPage /></MemoryRouter>);

    expect(await screen.findByText('Mesa 12')).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Cuenta de restaurante' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Abrir QR' })).toHaveAttribute(
      'href',
      `${customerOrigin}/table/server-token`,
    );
  });

  it('muestra aviso cuando el portapapeles no está disponible', async () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
    render(<MemoryRouter><TablesOperationsPage /></MemoryRouter>);

    fireEvent.click(await screen.findByRole('button', { name: 'Copiar enlace' }));

    await waitFor(() => expect(mocks.notify).toHaveBeenCalledWith(
      'No pudimos copiar el enlace; cópialo manualmente.',
      'warning',
    ));
  });
});
