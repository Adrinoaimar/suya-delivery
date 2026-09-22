import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RiderSettingsPage from '@/pages/rider/RiderSettingsPage';
import { useAuthStore } from '@/store/authStore';
import { useRiderStore } from '@/store/riderStore';
import { useUserStore } from '@/store/userStore';

const mocks = vi.hoisted(() => ({
  setAvailability: vi.fn(),
  notify: vi.fn(),
}));

vi.mock('@/lib/services', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services')>()),
  riderOperationsService: { setAvailability: mocks.setAvailability },
  notificationService: { notify: mocks.notify },
}));

describe('configuración de disponibilidad del rider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      status: 'authenticated',
      identity: {
        id: 'rider-1',
        email: 'rider@example.test',
        displayName: 'Rider demo',
        phone: '',
        defaultAddress: '',
        defaultReference: '',
        access: ['rider'],
        restaurantIds: [],
      },
      error: null,
    });
    useRiderStore.setState({ available: false });
    useUserStore.setState({
      preferences: { reduceMotion: false, locationLabel: 'Sullana, Perú', notifications: true },
    });
    mocks.setAvailability.mockResolvedValue('available');
  });

  afterEach(() => {
    useAuthStore.setState({ status: 'idle', identity: null, error: null });
    useRiderStore.setState({ available: false });
  });

  it('persiste en el servidor el cambio de disponibilidad desde Configuración', async () => {
    render(<RiderSettingsPage />);

    fireEvent.click(screen.getByRole('switch', { name: 'Disponible para pedidos' }));

    await waitFor(() => expect(mocks.setAvailability).toHaveBeenCalledWith(true));
    expect(useRiderStore.getState().available).toBe(true);
    expect(mocks.notify).toHaveBeenCalledWith('Ahora estás disponible', 'success');
  });

  it('conserva el estado anterior si el servidor rechaza el cambio', async () => {
    mocks.setAvailability.mockRejectedValueOnce(new Error('rider is suspended'));
    render(<RiderSettingsPage />);

    fireEvent.click(screen.getByRole('switch', { name: 'Disponible para pedidos' }));

    await waitFor(() => expect(mocks.notify).toHaveBeenCalledWith('rider is suspended', 'danger'));
    expect(useRiderStore.getState().available).toBe(false);
  });

  it('expone una salida de sesión visible', () => {
    render(<RiderSettingsPage />);

    expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible();
  });
});
