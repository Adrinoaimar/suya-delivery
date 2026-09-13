import { render, screen } from '@testing-library/react';
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

  it('muestra todas las secciones sin depender de una fila horizontal recortable', () => {
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
    expect(navigation).toHaveClass('grid-cols-3');
    expect(navigation).not.toHaveClass('overflow-x-auto');
    expect(screen.getByRole('link', { name: 'Dispositivos de pagos' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Repartidores' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Configuración' })).toBeInTheDocument();
  });
});
