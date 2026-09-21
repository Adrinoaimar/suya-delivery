import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WalletsOperationsPage from '@/pages/backoffice/WalletsOperationsPage';
import { useAuthStore } from '@/store/authStore';
import { useBackofficeContextStore } from '@/store/backofficeContextStore';
import type { AuthIdentity } from '@/lib/auth/types';
import type { WalletPaymentCandidate } from '@/lib/services';
import type { Store } from '@/types';

const mocks = vi.hoisted(() => ({
  listStores: vi.fn(),
  listDevices: vi.fn(),
  listObservations: vi.fn(),
  listPaymentAccounts: vi.fn(),
  createPairing: vi.fn(),
  createDevice: vi.fn(),
  setDeviceActive: vi.fn(),
  rotateDevice: vi.fn(),
  listPaymentCandidates: vi.fn(),
  verifyObservationByName: vi.fn(),
  savePaymentAccount: vi.fn(),
  notify: vi.fn(),
}));

vi.mock('@/lib/services', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services')>()),
  storeService: { listStores: mocks.listStores },
  walletObserverService: {
    listDevices: mocks.listDevices,
    listObservations: mocks.listObservations,
    listPaymentAccounts: mocks.listPaymentAccounts,
    createPairing: mocks.createPairing,
    createDevice: mocks.createDevice,
    setDeviceActive: mocks.setDeviceActive,
    rotateDevice: mocks.rotateDevice,
    listPaymentCandidates: mocks.listPaymentCandidates,
    setObservationCode: vi.fn(),
    verifyObservation: vi.fn(),
    verifyObservationByName: mocks.verifyObservationByName,
    savePaymentAccount: mocks.savePaymentAccount,
  },
  notificationService: { notify: mocks.notify },
}));

const restaurant: Store = {
  id: 'restaurant-1',
  name: 'Donde Joel',
  categoryId: 'restaurants',
  tags: [],
  description: '',
  rating: 5,
  reviews: 0,
  etaMin: 20,
  etaMax: 45,
  deliveryFee: 0,
  minOrder: 0,
  distanceKm: 0,
  isLocal: true,
  isFeatured: true,
  isRealBrand: true,
  promoLabel: null,
  schedule: { opens: '00:00', closes: '23:59' },
  address: 'Sullana',
  phone: '',
  image: null,
  logo: null,
  sections: [],
  acceptingOrders: true,
};

const identity: AuthIdentity = {
  id: 'admin-1',
  email: 'admin@example.test',
  displayName: 'Admin',
  phone: '',
  defaultAddress: '',
  defaultReference: '',
  access: ['platform_admin'],
  restaurantIds: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.setState({ status: 'authenticated', identity, error: null });
  mocks.listStores.mockResolvedValue([restaurant]);
  mocks.listDevices.mockResolvedValue([]);
  mocks.listPaymentAccounts.mockResolvedValue([]);
  mocks.createPairing.mockResolvedValue({
    pairingId: 'pairing-1',
    pairingCode: 'AB12CD34',
    expiresAt: '2099-09-20T23:00:00.000Z',
    restaurantId: restaurant.id,
    receiverAccountId: 'account-yape',
    deviceLabel: 'Caja principal',
  });
  mocks.verifyObservationByName.mockResolvedValue(true);
  mocks.listObservations.mockResolvedValue([
    {
      id: 'observation-1',
      restaurantId: restaurant.id,
      deviceId: 'device-1',
      provider: 'yape',
      senderName: 'Ana Uno',
      codeLast4: '1234',
      amountCents: 3000,
      currency: 'PEN',
      observedAt: '2026-09-14T18:30:00.000Z',
      verification: 'unverified',
    },
  ]);
});

afterEach(() => {
  useAuthStore.setState({ status: 'idle', identity: null, error: null });
});

describe('WalletsOperationsPage', () => {
  it('permite completar el código cuando la notificación solo trae los últimos cuatro', async () => {
    render(<WalletsOperationsPage />);

    expect(await screen.findByText('••••1234')).toBeInTheDocument();
    expect(screen.queryByLabelText('Código visible en la constancia')).not.toBeInTheDocument();

    screen.getByRole('button', { name: 'Agregar código completo' }).click();

    await waitFor(() =>
      expect(screen.getByLabelText('Código visible en la constancia')).toBeInTheDocument(),
    );
  });

  it('permite verificar y aprobar una observación por nombre', async () => {
    render(<WalletsOperationsPage />);

    const payerInput = await screen.findByLabelText('Nombre del pagador para Ana Uno');
    expect(payerInput).toHaveValue('Ana Uno');
    await act(async () => {
      screen.getByRole('button', { name: 'Verificar y aprobar' }).click();
    });

    expect(mocks.verifyObservationByName).toHaveBeenCalledWith('observation-1', 'Ana Uno');
    expect(mocks.notify).toHaveBeenCalledWith(
      'Pago verificado y aprobado para preparación.',
      'success',
    );
  });

  it('rechaza un nombre que no coincide con el remitente observado', async () => {
    render(<WalletsOperationsPage />);

    const payerInput = await screen.findByLabelText('Nombre del pagador para Ana Uno');
    fireEvent.change(payerInput, { target: { value: 'Otra Persona' } });
    await act(async () => {
      screen.getByRole('button', { name: 'Verificar y aprobar' }).click();
    });

    expect(mocks.verifyObservationByName).not.toHaveBeenCalled();
    expect(mocks.notify).toHaveBeenCalledWith(
      'El nombre debe coincidir con el remitente de la notificación.',
      'warning',
    );
  });

  it('preselecciona la primera cuenta antes de terminar las cargas secundarias', async () => {
    let resolveObservations!: (value: unknown[]) => void;
    const slowObservations = new Promise<unknown[]>((resolve) => {
      resolveObservations = resolve;
    });
    mocks.listObservations.mockImplementationOnce(() => slowObservations);

    render(<WalletsOperationsPage />);

    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Cuenta de restaurante' })).toHaveValue(
        restaurant.id,
      ),
    );

    resolveObservations([]);
  });

  it('ignora un permiso de restaurante obsoleto y usa la primera sede visible', async () => {
    useAuthStore.setState({
      identity: {
        ...identity,
        access: ['restaurant_staff'],
        restaurantIds: ['stale-restaurant', restaurant.id],
      },
    });

    render(<WalletsOperationsPage />);

    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Cuenta de restaurante' })).toHaveValue(
        restaurant.id,
      ),
    );
    await waitFor(() => expect(mocks.listPaymentAccounts).toHaveBeenCalledWith(restaurant.id));
    expect(mocks.listPaymentAccounts).not.toHaveBeenCalledWith('stale-restaurant');
    expect(useBackofficeContextStore.getState().activeRestaurantId).toBe(restaurant.id);
  });

  it('crea un código de emparejamiento ligado a la cuenta receptora activa', async () => {
    mocks.listPaymentAccounts.mockResolvedValue([
      {
        id: 'account-yape',
        restaurantId: restaurant.id,
        provider: 'yape',
        accountLabel: 'Caja Yape',
        qrPayload: null,
        active: true,
      },
    ]);
    render(<WalletsOperationsPage />);
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Cuenta de restaurante' })).toHaveValue(
        restaurant.id,
      ),
    );
    await act(async () => {
      screen.getByRole('button', { name: 'Generar código' }).click();
    });
    expect(mocks.createPairing).toHaveBeenCalledWith(
      restaurant.id,
      'Caja principal',
      'account-yape',
    );
    expect(screen.getByText('AB12CD34')).toBeInTheDocument();
    expect(screen.queryByText(/Token de acceso/)).not.toBeInTheDocument();
  });

  it('bloquea verificar cuando el sufijo coincide con varios pedidos', async () => {
    mocks.listPaymentCandidates.mockResolvedValue([
      {
        paymentAttemptId: 'attempt-1',
        orderId: 'order-1',
        orderCode: 'SUY-1',
        customerName: 'Ana Uno',
        checkoutReference: 'SUYA-1',
        method: 'yape',
        amount: 30,
        createdAt: '2026-09-14T18:00:00.000Z',
        expiresAt: '2026-09-14T19:00:00.000Z',
        senderName: 'Ana Uno',
      },
      {
        paymentAttemptId: 'attempt-2',
        orderId: 'order-2',
        orderCode: 'SUY-2',
        customerName: 'Luis Dos',
        checkoutReference: 'SUYA-2',
        method: 'yape',
        amount: 30,
        createdAt: '2026-09-14T18:01:00.000Z',
        expiresAt: '2026-09-14T19:01:00.000Z',
        senderName: 'Ana Uno',
      },
    ]);
    render(<WalletsOperationsPage />);

    const searchButton = await screen.findByRole('button', { name: 'Buscar pedido' });
    await act(async () => {
      searchButton.click();
    });

    expect(await screen.findByText(/Hay 2 pedidos compatibles/)).toBeInTheDocument();
    expect(screen.getByText('Pista: el remitente coincide con el cliente.')).toBeInTheDocument();
    expect(
      screen.getByText('Pista: confirma el código completo antes de verificar.'),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Verificar pago' })).toHaveLength(2);
    expect(
      screen
        .getAllByRole('button', { name: 'Verificar pago' })
        .every((button) => (button as HTMLButtonElement).disabled),
    ).toBe(true);
  });

  it('limpia la conciliación pendiente al cambiar de restaurante', async () => {
    const secondRestaurant = { ...restaurant, id: 'restaurant-2', name: 'Andá Paya' };
    useAuthStore.setState({
      identity: { ...identity, restaurantIds: [restaurant.id, secondRestaurant.id] },
    });
    mocks.listStores.mockResolvedValue([restaurant, secondRestaurant]);
    mocks.listPaymentCandidates.mockResolvedValue([
      {
        paymentAttemptId: 'attempt-1',
        orderId: 'order-1',
        orderCode: 'SUY-1',
        customerName: 'Ana Uno',
        checkoutReference: 'SUYA-1',
        method: 'yape',
        amount: 30,
        createdAt: '2026-09-14T18:00:00.000Z',
        expiresAt: '2026-09-14T19:00:00.000Z',
        senderName: 'Ana Uno',
      },
    ]);

    render(<WalletsOperationsPage />);

    const selector = await screen.findByRole('combobox', { name: 'Cuenta de restaurante' });
    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: 'Buscar pedido' }));
    });
    expect(await screen.findByText(/Pedido #SUY-1/)).toBeInTheDocument();

    fireEvent.change(selector, { target: { value: secondRestaurant.id } });

    await waitFor(() => {
      expect(screen.queryByText(/Pedido #SUY-1/)).not.toBeInTheDocument();
      expect(screen.queryByText('Pedidos compatibles')).not.toBeInTheDocument();
    });
  });

  it('oculta dispositivos y observaciones de la sede anterior al cambiar de contexto', async () => {
    const secondRestaurant = { ...restaurant, id: 'restaurant-2', name: 'Andá Paya' };
    useAuthStore.setState({
      identity: { ...identity, restaurantIds: [restaurant.id, secondRestaurant.id] },
    });
    mocks.listStores.mockResolvedValue([restaurant, secondRestaurant]);
    mocks.listDevices.mockResolvedValue([
      {
        id: 'device-1',
        restaurantId: restaurant.id,
        label: 'Caja Donde Joel',
        active: true,
        lastSeenAt: null,
      },
      {
        id: 'device-2',
        restaurantId: secondRestaurant.id,
        label: 'Caja Andá Paya',
        active: true,
        lastSeenAt: null,
      },
    ]);
    mocks.listObservations.mockResolvedValue([
      {
        id: 'observation-1',
        restaurantId: restaurant.id,
        deviceId: 'device-1',
        provider: 'yape',
        senderName: 'Pago Donde Joel',
        codeLast4: '1234',
        amountCents: 3000,
        currency: 'PEN',
        observedAt: '2026-09-14T18:30:00.000Z',
        verification: 'unverified',
      },
      {
        id: 'observation-2',
        restaurantId: secondRestaurant.id,
        deviceId: 'device-2',
        provider: 'yape',
        senderName: 'Pago Andá Paya',
        codeLast4: '5678',
        amountCents: 3000,
        currency: 'PEN',
        observedAt: '2026-09-14T18:31:00.000Z',
        verification: 'unverified',
      },
    ]);

    render(<WalletsOperationsPage />);

    const selector = await screen.findByRole('combobox', { name: 'Cuenta de restaurante' });
    expect(await screen.findByText('Caja Donde Joel')).toBeInTheDocument();
    expect(screen.getByText('Pago Donde Joel')).toBeInTheDocument();
    expect(screen.queryByText('Caja Andá Paya')).not.toBeInTheDocument();
    expect(screen.queryByText('Pago Andá Paya')).not.toBeInTheDocument();

    fireEvent.change(selector, { target: { value: secondRestaurant.id } });

    expect(await screen.findByText('Caja Andá Paya')).toBeInTheDocument();
    expect(screen.getByText('Pago Andá Paya')).toBeInTheDocument();
    expect(screen.queryByText('Caja Donde Joel')).not.toBeInTheDocument();
    expect(screen.queryByText('Pago Donde Joel')).not.toBeInTheDocument();
  });

  it('no muestra un token creado para la sede anterior si la respuesta llega tarde', async () => {
    const secondRestaurant = { ...restaurant, id: 'restaurant-2', name: 'Andá Paya' };
    useAuthStore.setState({
      identity: { ...identity, restaurantIds: [restaurant.id, secondRestaurant.id] },
    });
    mocks.listStores.mockResolvedValue([restaurant, secondRestaurant]);
    mocks.listPaymentAccounts.mockImplementation((restaurantId: string) =>
      Promise.resolve(
        restaurantId === restaurant.id
          ? [
              {
                id: 'account-yape',
                restaurantId: restaurant.id,
                provider: 'yape',
                accountLabel: 'Caja Yape',
                qrPayload: null,
                active: true,
              },
            ]
          : [],
      ),
    );
    let resolvePairing!: (value: unknown) => void;
    mocks.createPairing.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePairing = resolve;
        }),
    );

    render(<WalletsOperationsPage />);

    const selector = await screen.findByRole('combobox', { name: 'Cuenta de restaurante' });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Generar código' })).not.toBeDisabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Generar código' }));
    fireEvent.change(selector, { target: { value: secondRestaurant.id } });

    await act(async () => {
      resolvePairing({
        pairingId: 'pairing-late',
        pairingCode: 'CDEF1234',
        expiresAt: '2099-09-20T23:00:00.000Z',
        restaurantId: restaurant.id,
        receiverAccountId: 'account-yape',
        deviceLabel: 'Caja principal',
      });
    });

    expect(screen.queryByText('Código de emparejamiento')).not.toBeInTheDocument();
    expect(screen.queryByText('CDEF1234')).not.toBeInTheDocument();
  });

  it('descarta una cuenta guardada si el operador cambió de restaurante durante la petición', async () => {
    const secondRestaurant = { ...restaurant, id: 'restaurant-2', name: 'Andá Paya' };
    useAuthStore.setState({
      identity: { ...identity, restaurantIds: [restaurant.id, secondRestaurant.id] },
    });
    mocks.listStores.mockResolvedValue([restaurant, secondRestaurant]);
    mocks.listPaymentAccounts.mockResolvedValue([]);
    let resolveSave!: (value: unknown) => void;
    mocks.savePaymentAccount.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSave = resolve;
        }),
    );

    render(<WalletsOperationsPage />);

    const restaurantSelector = await screen.findByRole('combobox', {
      name: 'Cuenta de restaurante',
    });
    fireEvent.change(screen.getByLabelText('Nombre visible'), {
      target: { value: 'Cuenta antigua' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cuenta' }));
    fireEvent.change(restaurantSelector, { target: { value: secondRestaurant.id } });
    await waitFor(() =>
      expect(mocks.listPaymentAccounts).toHaveBeenCalledWith(secondRestaurant.id),
    );

    await act(async () => {
      resolveSave({
        id: 'account-old',
        restaurantId: restaurant.id,
        provider: 'yape',
        accountLabel: 'Cuenta antigua',
        qrPayload: null,
        active: true,
      });
    });

    const providerSelector = screen.getByRole('combobox', { name: 'Billetera' });
    fireEvent.change(providerSelector, { target: { value: 'lemon' } });
    fireEvent.change(providerSelector, { target: { value: 'yape' } });
    expect(screen.getByLabelText('Nombre visible')).toHaveValue('Cuenta principal');
    expect(screen.queryByDisplayValue('Cuenta antigua')).not.toBeInTheDocument();
  });

  it('permite revocar un dispositivo sin borrar su evidencia histórica', async () => {
    mocks.listDevices.mockResolvedValue([
      {
        id: 'device-1',
        restaurantId: restaurant.id,
        label: 'Caja observadora',
        active: true,
        lastSeenAt: null,
      },
    ]);
    mocks.setDeviceActive.mockResolvedValue(true);
    render(<WalletsOperationsPage />);

    expect(await screen.findByText('Caja observadora')).toBeInTheDocument();
    await act(async () => {
      screen.getByRole('button', { name: 'Revocar' }).click();
    });
    expect(mocks.setDeviceActive).toHaveBeenCalledWith('device-1', false);
    expect(await screen.findByRole('button', { name: 'Reactivar' })).toBeInTheDocument();
  });

  it('no expone acciones ni credenciales de token en Backoffice', async () => {
    mocks.listDevices.mockResolvedValue([
      {
        id: 'device-1',
        restaurantId: restaurant.id,
        label: 'Caja observadora',
        active: true,
        lastSeenAt: null,
      },
    ]);
    render(<WalletsOperationsPage />);

    expect(await screen.findByText('Caja observadora')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Rotar token' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Token de acceso/)).not.toBeInTheDocument();
  });

  it('descarta una respuesta vieja al buscar candidatos en rápida sucesión', async () => {
    const firstObservation = { id: 'observation-1', codeLast4: '1234' };
    const secondObservation = { id: 'observation-2', codeLast4: '5678' };
    mocks.listObservations.mockResolvedValue([
      {
        ...firstObservation,
        restaurantId: restaurant.id,
        deviceId: 'device-1',
        provider: 'yape',
        senderName: 'Ana Uno',
        amountCents: 3000,
        currency: 'PEN',
        observedAt: '2026-09-14T18:30:00.000Z',
        verification: 'unverified',
      },
      {
        ...secondObservation,
        restaurantId: restaurant.id,
        deviceId: 'device-1',
        provider: 'yape',
        senderName: 'Luis Dos',
        amountCents: 3000,
        currency: 'PEN',
        observedAt: '2026-09-14T18:31:00.000Z',
        verification: 'unverified',
      },
    ]);
    let resolveFirst!: (value: WalletPaymentCandidate[]) => void;
    let resolveSecond!: (value: WalletPaymentCandidate[]) => void;
    const firstRequest = new Promise<WalletPaymentCandidate[]>((resolve) => {
      resolveFirst = resolve;
    });
    const secondRequest = new Promise<WalletPaymentCandidate[]>((resolve) => {
      resolveSecond = resolve;
    });
    mocks.listPaymentCandidates.mockImplementation((id: string) =>
      id === firstObservation.id ? firstRequest : secondRequest,
    );

    render(<WalletsOperationsPage />);
    const searchButtons = await screen.findAllByRole('button', { name: 'Buscar pedido' });
    await act(async () => {
      searchButtons[0].click();
      searchButtons[1].click();
    });

    await act(async () => {
      resolveFirst([
        {
          paymentAttemptId: 'attempt-old',
          orderId: 'order-old',
          orderCode: 'UNO',
          customerName: 'Cliente viejo',
          checkoutReference: 'SUYA-OLD',
          method: 'yape',
          amount: 30,
          createdAt: '2026-09-14T18:00:00.000Z',
          expiresAt: '2026-09-14T19:00:00.000Z',
          senderName: 'Ana Uno',
        },
      ]);
      await Promise.resolve();
    });
    expect(screen.queryByText(/Pedido #UNO/)).not.toBeInTheDocument();

    await act(async () => {
      resolveSecond([
        {
          paymentAttemptId: 'attempt-current',
          orderId: 'order-current',
          orderCode: 'DOS',
          customerName: 'Cliente actual',
          checkoutReference: 'SUYA-CURRENT',
          method: 'yape',
          amount: 30,
          createdAt: '2026-09-14T18:01:00.000Z',
          expiresAt: '2026-09-14T19:01:00.000Z',
          senderName: 'Luis Dos',
        },
      ]);
    });
    expect(await screen.findByText(/Pedido #DOS/)).toBeInTheDocument();
  });

  it('descarta una recarga automática vieja de observaciones', async () => {
    vi.useFakeTimers();
    try {
      let resolveSlow!: (value: unknown[]) => void;
      let resolveFresh!: (value: unknown[]) => void;
      const slowRequest = new Promise<unknown[]>((resolve) => {
        resolveSlow = resolve;
      });
      const freshRequest = new Promise<unknown[]>((resolve) => {
        resolveFresh = resolve;
      });
      const originalObservation = {
        id: 'observation-1',
        restaurantId: restaurant.id,
        deviceId: 'device-1',
        provider: 'yape',
        senderName: 'Ana Uno',
        codeLast4: '1234',
        amountCents: 3000,
        currency: 'PEN',
        observedAt: '2026-09-14T18:30:00.000Z',
        verification: 'unverified',
      };
      const newestObservation = {
        ...originalObservation,
        id: 'observation-new',
        senderName: 'Luis Dos',
        codeLast4: '5678',
      };
      mocks.listObservations
        .mockResolvedValueOnce([originalObservation])
        .mockImplementationOnce(() => slowRequest)
        .mockImplementationOnce(() => freshRequest);

      render(<WalletsOperationsPage />);
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(screen.getByText('••••1234')).toBeInTheDocument();

      await act(async () => {
        vi.advanceTimersByTime(30_000);
        await Promise.resolve();
      });
      await act(async () => {
        resolveFresh([newestObservation]);
        await Promise.resolve();
      });
      await act(async () => {
        resolveSlow([originalObservation]);
        await Promise.resolve();
      });

      expect(screen.getByText('Luis Dos')).toBeInTheDocument();
      expect(screen.queryByText('••••1234')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('conserva la carga completa si el refresco de 15 s ocurre mientras aún responde', async () => {
    vi.useFakeTimers();
    try {
      let resolveDevices!: (value: unknown[]) => void;
      let resolveInitialObservations!: (value: unknown[]) => void;
      let resolveRefresh!: (value: unknown[]) => void;
      const slowDevices = new Promise<unknown[]>((resolve) => {
        resolveDevices = resolve;
      });
      const slowInitialObservations = new Promise<unknown[]>((resolve) => {
        resolveInitialObservations = resolve;
      });
      const refreshObservations = new Promise<unknown[]>((resolve) => {
        resolveRefresh = resolve;
      });
      const device = {
        id: 'device-slow',
        restaurantId: restaurant.id,
        label: 'Caja lenta',
        active: true,
        lastSeenAt: null,
      };
      const initialObservation = {
        id: 'observation-initial',
        restaurantId: restaurant.id,
        deviceId: device.id,
        provider: 'yape',
        senderName: 'Inicial',
        codeLast4: '1111',
        amountCents: 3000,
        currency: 'PEN',
        observedAt: '2026-09-14T18:30:00.000Z',
        verification: 'unverified',
      };
      const refreshedObservation = {
        ...initialObservation,
        id: 'observation-refresh',
        senderName: 'Actualizada',
      };
      mocks.listDevices.mockImplementationOnce(() => slowDevices);
      mocks.listObservations
        .mockImplementationOnce(() => slowInitialObservations)
        .mockImplementationOnce(() => refreshObservations);

      render(<WalletsOperationsPage />);
      await act(async () => {
        for (let index = 0; index < 8; index += 1) await Promise.resolve();
      });

      await act(async () => {
        vi.advanceTimersByTime(15_000);
        await Promise.resolve();
      });

      await act(async () => {
        resolveRefresh([refreshedObservation]);
        await Promise.resolve();
      });
      await act(async () => {
        resolveDevices([device]);
        resolveInitialObservations([initialObservation]);
        for (let index = 0; index < 8; index += 1) await Promise.resolve();
      });

      expect(screen.getByText('Caja lenta')).toBeInTheDocument();
      expect(screen.getByText('Inicial')).toBeInTheDocument();
      expect(screen.queryByText('Actualizada')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
