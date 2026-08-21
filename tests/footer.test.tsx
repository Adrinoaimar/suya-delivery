import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Footer } from '@/components/layout/Footer';

afterEach(() => vi.unstubAllEnvs());

describe('Footer multiapp', () => {
  it('envía repartidores al origen externo configurado', () => {
    vi.stubEnv('VITE_RIDER_APP_URL', 'https://suya-rider.pages.dev/');
    render(
      <MemoryRouter>
        <Footer />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: 'Panel del repartidor' })).toHaveAttribute(
      'href',
      'https://suya-rider.pages.dev/rider',
    );
    expect(screen.getByRole('link', { name: 'Seguridad en ruta' })).toHaveAttribute(
      'href',
      'https://suya-rider.pages.dev/rider/safety',
    );
  });

  it('no ofrece rutas internas rotas si el origen rider falta', () => {
    vi.stubEnv('VITE_RIDER_APP_URL', '');
    render(
      <MemoryRouter>
        <Footer />
      </MemoryRouter>,
    );

    expect(screen.queryByText('Panel del repartidor')).not.toBeInTheDocument();
  });
});
