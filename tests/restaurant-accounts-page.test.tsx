import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import RestaurantAccountsPage from '@/pages/backoffice/RestaurantAccountsPage';
import type { RestaurantAccount } from '@/lib/services/types';

const { list, saveContact, invite, activate } = vi.hoisted(() => ({ list: vi.fn(), saveContact: vi.fn(), invite: vi.fn(), activate: vi.fn() }));

vi.mock('@/lib/services', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services')>()),
  restaurantAccountService: { list, saveContact, invite, activate },
  notificationService: { notify: vi.fn(), subscribe: vi.fn(() => () => undefined) },
}));

const pending: RestaurantAccount = {
  restaurantId: 'rest-1', restaurantName: 'Donde Joel', status: 'pending_contact',
  contactName: '', contactEmail: '', ownerUserId: null, invitedAt: null, activatedAt: null,
  notes: '', updatedAt: '2026-09-09T00:00:00.000Z',
};

const active: RestaurantAccount = {
  restaurantId: 'rest-2', restaurantName: 'Andá Paya', status: 'active',
  contactName: 'Propietario', contactEmail: 'owner@example.test', ownerUserId: 'user-2',
  invitedAt: '2026-09-01T00:00:00.000Z', activatedAt: '2026-09-02T00:00:00.000Z',
  notes: 'Cuenta validada', updatedAt: '2026-09-09T00:00:00.000Z',
};

afterEach(() => vi.clearAllMocks());

describe('gestión de cuentas de restaurantes', () => {
  it('carga casilleros reales y bloquea campos de cuenta activa', async () => {
    list.mockResolvedValue([pending, active]);
    render(<RestaurantAccountsPage />);

    expect(await screen.findByRole('heading', { name: 'Cuentas de restaurantes' })).toBeInTheDocument();
    expect(screen.getByText('Donde Joel')).toBeInTheDocument();
    expect(screen.getByText('Andá Paya')).toBeInTheDocument();
    expect(screen.getByDisplayValue('owner@example.test')).toBeDisabled();
    expect(screen.getByDisplayValue('Propietario')).toBeDisabled();
  });

  it('guarda contacto y muestra estado listo para invitar', async () => {
    list.mockResolvedValue([pending]);
    const ready = { ...pending, status: 'ready_to_invite' as const, contactName: 'Joel', contactEmail: 'joel@example.test' };
    saveContact.mockResolvedValue(ready);
    render(<RestaurantAccountsPage />);

    fireEvent.change(await screen.findByLabelText('Representante'), { target: { value: 'Joel' } });
    fireEvent.change(screen.getByLabelText('Correo de acceso'), { target: { value: 'joel@example.test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar contacto' }));

    await waitFor(() => expect(saveContact).toHaveBeenCalledWith({
      restaurantId: 'rest-1', contactName: 'Joel', contactEmail: 'joel@example.test', notes: '',
    }));
    expect(await screen.findByText('Lista para invitar')).toBeInTheDocument();
  });

  it('permite enviar invitación solo cuando estado está listo', async () => {
    const ready = { ...pending, status: 'ready_to_invite' as const, contactName: 'Joel', contactEmail: 'joel@example.test' };
    list.mockResolvedValue([ready]);
    invite.mockResolvedValue({ ...ready, status: 'invited' as const });
    render(<RestaurantAccountsPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Enviar invitación' }));
    await waitFor(() => expect(invite).toHaveBeenCalledWith('rest-1'));
    expect(await screen.findByText('Invitación enviada')).toBeInTheDocument();
  });

  it('activa propietario solo después de invitación', async () => {
    const invited = { ...pending, status: 'invited' as const, contactName: 'Joel', contactEmail: 'joel@example.test' };
    list.mockResolvedValue([invited]);
    activate.mockResolvedValue({ ...invited, status: 'active' as const, ownerUserId: 'user-1' });
    render(<RestaurantAccountsPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Activar propietario' }));
    await waitFor(() => expect(activate).toHaveBeenCalledWith('rest-1'));
    expect(await screen.findByText('Activa')).toBeInTheDocument();
  });
});
