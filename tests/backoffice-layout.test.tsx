import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BackofficeLayout } from '@/layouts/BackofficeLayout';
import { useAuthStore } from '@/store/authStore';

vi.mock('@/hooks/useMediaQuery', () => ({
  useIsDesktop: () => false,
}));

describe('navegación del backoffice', () => {
  afterEach(() => {
    useAuthStore.setState({ status: 'idle', identity: null, error: null });
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
});
