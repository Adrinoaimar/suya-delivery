import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import WalletObserverPage from '@/pages/wallet/WalletObserverPage';

const mocks = vi.hoisted(() => ({
  getStatus: vi.fn(),
  configure: vi.fn(),
  sync: vi.fn(),
  clear: vi.fn(),
  openNotificationSettings: vi.fn(),
  notify: vi.fn(),
}));

vi.mock('@capacitor/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@capacitor/core')>();
  return {
    ...actual,
    Capacitor: { ...actual.Capacitor, getPlatform: () => 'android' },
  };
});

vi.mock('@/lib/services', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services')>()),
  nativeWalletObserver: {
    getStatus: mocks.getStatus,
    configure: mocks.configure,
    sync: mocks.sync,
    clear: mocks.clear,
    openNotificationSettings: mocks.openNotificationSettings,
  },
  notificationService: { notify: mocks.notify },
}));

describe('WalletObserverPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getStatus.mockResolvedValue({
      configured: false,
      notificationAccess: false,
      role: 'unconfigured',
    });
  });

  it('presenta la conexión dedicada sin cargar autenticación ni pantallas operativas', async () => {
    render(<WalletObserverPage />);

    expect(screen.getByRole('heading', { name: 'Conexión de caja' })).toBeInTheDocument();
    expect(screen.getByLabelText('Código de caja')).toBeInTheDocument();
    expect(screen.queryByText('Pedidos')).not.toBeInTheDocument();
    await waitFor(() => expect(mocks.getStatus).toHaveBeenCalledTimes(1));
    expect(screen.getByText('Sin vincular')).toBeInTheDocument();
  });
});
