import { MemoryRouter } from 'react-router-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MapViewProps } from '@/components/map/types';
import RiderHomePage from '@/pages/rider/RiderHomePage';

const mocks = vi.hoisted(() => ({
  getAvailability: vi.fn(),
  setAvailability: vi.fn(),
  setAvailable: vi.fn(),
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
    selector({ available: true, setAvailable: mocks.setAvailable }),
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

  it('bloquea toques duplicados y no deja que una carga inicial atrasada revierta el cambio', async () => {
    let releaseInitial: (status: string) => void = () => undefined;
    let releaseChange: (status: string) => void = () => undefined;
    mocks.getAvailability.mockImplementation(
      () => new Promise<string>((resolve) => { releaseInitial = resolve; }),
    );
    mocks.setAvailability.mockImplementation(
      () => new Promise<string>((resolve) => { releaseChange = resolve; }),
    );

    render(
      <MemoryRouter>
        <RiderHomePage />
      </MemoryRouter>,
    );

    const toggle = screen.getByRole('switch', { name: 'Disponible' });
    fireEvent.click(toggle);
    expect(toggle).toBeDisabled();
    fireEvent.click(toggle);
    expect(mocks.setAvailability).toHaveBeenCalledTimes(1);

    releaseInitial('offline');
    releaseChange('available');
    await waitFor(() => expect(toggle).not.toBeDisabled());
    expect(mocks.setAvailable).toHaveBeenLastCalledWith(true);
  });
});
