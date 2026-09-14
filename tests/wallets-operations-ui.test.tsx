import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WalletsOperationsPage from '@/pages/backoffice/WalletsOperationsPage';
import { useAuthStore } from '@/store/authStore';
import type { AuthIdentity } from '@/lib/auth/types';
import type { Store } from '@/types';

const mocks = vi.hoisted(() => ({
  listStores: vi.fn(),
  listDevices: vi.fn(),
  listObservations: vi.fn(),
  listPaymentAccounts: vi.fn(),
  notify: vi.fn(),
}));

vi.mock('@/lib/services', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services')>()),
  storeService: { listStores: mocks.listStores },
  walletObserverService: {
    listDevices: mocks.listDevices,
    listObservations: mocks.listObservations,
    listPaymentAccounts: mocks.listPaymentAccounts,
    createDevice: vi.fn(),
    listPaymentCandidates: vi.fn(),
    setObservationCode: vi.fn(),
    verifyObservation: vi.fn(),
    savePaymentAccount: vi.fn(),
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

const identity: AuthIdentity = {
  id: 'admin-1',
  email: 'admin@example.test',
  displayName: 'Admin',
  phone: '',
  defaultAddress: '',
  defaultReference: '',
  access: ['platform_admin'],
  restaurantIds: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.setState({ status: 'authenticated', identity, error: null });
  mocks.listStores.mockResolvedValue([restaurant]);
  mocks.listDevices.mockResolvedValue([]);
  mocks.listPaymentAccounts.mockResolvedValue([]);
  mocks.listObservations.mockResolvedValue([
    {
      id: 'observation-1',
      restaurantId: restaurant.id,
      deviceId: 'device-1',
      provider: 'yape',
      senderName: 'Ana Uno',
      codeLast4: '1234',
      amountCents: 3000,
      currency: 'PEN',
      observedAt: '2026-09-14T18:30:00.000Z',
      verification: 'unverified',
    },
  ]);
});

afterEach(() => {
  useAuthStore.setState({ status: 'idle', identity: null, error: null });
});

describe('WalletsOperationsPage', () => {
  it('permite completar el código cuando la notificación solo trae los últimos cuatro', async () => {
    render(<WalletsOperationsPage />);

    expect(await screen.findByText('••••1234')).toBeInTheDocument();
    expect(screen.queryByLabelText('Código visible en la constancia')).not.toBeInTheDocument();

    screen.getByRole('button', { name: 'Agregar código completo' }).click();

    await waitFor(() =>
      expect(screen.getByLabelText('Código visible en la constancia')).toBeInTheDocument(),
    );
  });
});
