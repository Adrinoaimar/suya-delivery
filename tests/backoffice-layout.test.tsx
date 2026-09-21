import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BackofficeLayout } from '@/layouts/BackofficeLayout';
import { storeService } from '@/lib/services';
import { useAuthStore } from '@/store/authStore';
import type { Store } from '@/types';
import { useBackofficeContextStore } from '@/store/backofficeContextStore';

vi.mock('@/lib/services', () => ({
  storeService: { listStores: vi.fn() },
}));

vi.mock('@/hooks/useMediaQuery', () => ({
  useIsDesktop: () => false,
}));

describe('navegación del backoffice', () => {
  const restaurant = { id: 'restaurant-1', name: 'Donde Joel' } as Store;

  beforeEach(() => {
    vi.mocked(storeService.listStores).mockResolvedValue([restaurant]);
    useBackofficeContextStore.getState().reset();
  });

  afterEach(() => {
    useAuthStore.setState({ status: 'idle', identity: null, error: null });
    useBackofficeContextStore.getState().reset();
    vi.clearAllMocks();
  });

  it('muestra accesos frecuentes y agrupa el resto en un menú móvil', async () => {
    useAuthStore.setState({
      status: 'authenticated',
      identity: {
        id: 'user-1',
        email: 'owner@example.test',
        displayName: 'Propietario',
        phone: '',
        defaultAddress: '',
        defaultReference: '',
        access: ['restaurant_staff'],
        restaurantIds: ['restaurant-1'],
      },
      error: null,
    });

    render(
      <MemoryRouter initialEntries={['/riders']}>
        <BackofficeLayout />
      </MemoryRouter>,
    );

    const navigation = screen.getByRole('navigation', { name: 'Operaciones' });
    expect(navigation).toHaveClass('hidden');
    const mobileNavigation = screen.getByRole('navigation', { name: 'Operaciones móviles' });
    expect(mobileNavigation).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Más' })).toBeInTheDocument();
    expect(within(mobileNavigation).getByRole('link', { name: 'Caja' })).toBeInTheDocument();
    screen.getByRole('button', { name: 'Más' }).click();
    await waitFor(() =>
      expect(screen.getByRole('navigation', { name: 'Más operaciones' })).toBeInTheDocument(),
    );
    const moreNavigation = screen.getByRole('navigation', { name: 'Más operaciones' });
    expect(within(moreNavigation).getByRole('link', { name: 'Dispositivos de pagos' })).toBeInTheDocument();
    expect(within(moreNavigation).getByRole('link', { name: 'Repartidores' })).toBeInTheDocument();
    expect(within(moreNavigation).getByRole('link', { name: 'Configuración' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Restaurantes' })).not.toBeInTheDocument();
  });

  it('preselecciona y muestra la cuenta activa en la cabecera global', async () => {
    useAuthStore.setState({
      status: 'authenticated',
      identity: {
        id: 'user-1',
        email: 'owner@example.test',
        displayName: 'Propietario',
        phone: '',
        defaultAddress: '',
        defaultReference: '',
        access: ['restaurant_staff'],
        restaurantIds: [restaurant.id],
      },
      error: null,
    });

    render(
      <MemoryRouter initialEntries={['/orders']}>
        <BackofficeLayout />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Cuenta activa: Donde Joel')).toBeInTheDocument();
    expect(useBackofficeContextStore.getState().activeRestaurantId).toBe(restaurant.id);
  });
});
