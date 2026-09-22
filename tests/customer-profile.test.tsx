import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProfilePage from '@/pages/customer/ProfilePage';
import { useAuthStore } from '@/store/authStore';
import { useCatalogStore } from '@/store/catalogStore';

const mocks = vi.hoisted(() => ({
  signOut: vi.fn(),
  listStores: vi.fn(),
}));

vi.mock('@/lib/services', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services')>()),
  storeService: {
    listStores: mocks.listStores,
  },
}));

describe('perfil de cliente', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listStores.mockResolvedValue([]);
    mocks.signOut.mockResolvedValue(undefined);
    useAuthStore.setState({
      status: 'authenticated',
      identity: {
        id: 'customer-1',
        email: 'customer@example.test',
        displayName: 'Cliente QA',
        phone: '',
        defaultAddress: '',
        defaultReference: '',
        access: ['customer'],
        restaurantIds: [],
      },
      error: null,
      signOut: mocks.signOut,
    });
    useCatalogStore.setState({ stores: [], storesStatus: 'idle', storesError: null });
  });

  it('permite cerrar sesión desde Mi cuenta', () => {
    render(
      <MemoryRouter>
        <ProfilePage />
      </MemoryRouter>,
    );

    const button = screen.getByRole('button', { name: 'Cerrar sesión' });
    expect(button).toBeVisible();
    button.click();
    expect(mocks.signOut).toHaveBeenCalledOnce();
  });
});
