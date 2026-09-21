import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import RiderSafetyPage from '@/pages/rider/RiderSafetyPage';

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="pathname">{location.pathname}</output>;
}

describe('navegación del rider', () => {
  it('abre la ayuda del rider desde Seguridad en ruta', () => {
    render(
      <MemoryRouter initialEntries={['/rider/safety']}>
        <RiderSafetyPage />
        <LocationProbe />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('link', { name: /Centro de ayuda/i }));

    expect(screen.getByTestId('pathname')).toHaveTextContent('/rider/help');
  });
});
