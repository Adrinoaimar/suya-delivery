import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MapViewProps } from '@/components/map/types';
import RiderHomePage from '@/pages/rider/RiderHomePage';

const mocks = vi.hoisted(() => ({
  getAvailability: vi.fn(),
  setAvailability: vi.fn(),
  notify: vi.fn(),
}));

vi.mock('@/components/map/MapProvider', () => ({
  MapProvider: ({ label, navigation }: MapViewProps) => (
    <div role="img" aria-label={label} data-navigation={String(navigation)} />
  ),
}));

vi.mock('@/lib/services', () => ({
  notificationService: { notify: mocks.notify },
  riderOperationsService: {
    getAvailability: mocks.getAvailability,
    setAvailability: mocks.setAvailability,
  },
}));

vi.mock('@/lib/auth/SupabaseAuthService', () => ({
  authService: { subscribe: () => () => undefined },
}));

vi.mock('@/store/authStore', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({ identity: { displayName: 'Rider demo' } }),
}));

vi.mock('@/store/orderStore', () => ({
  selectActiveOrder: () => undefined,
  useOrderStore: (selector: (state: unknown) => unknown) => selector({ orders: [] }),
}));

vi.mock('@/store/riderStore', () => ({
  useRiderStore: (selector: (state: unknown) => unknown) =>
    selector({ available: true, setAvailable: vi.fn() }),
}));

vi.mock('@/store/trackingStore', () => ({
  useTrackingStore: (selector: (state: unknown) => unknown) => selector({ reading: null }),
}));

describe('inicio del rider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAvailability.mockResolvedValue('available');
    mocks.setAvailability.mockResolvedValue('available');
  });

  it('muestra el mapa principal aunque aún no haya viaje asignado', async () => {
    render(
      <MemoryRouter>
        <RiderHomePage />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole('img', { name: 'Mapa de tu ubicación y zona de reparto' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Activa el GPS para ubicarte')).toBeInTheDocument();
    expect(screen.getByText(/No tienes un viaje asignado\./)).toBeInTheDocument();
    expect(mocks.getAvailability).toHaveBeenCalled();
  });
});
