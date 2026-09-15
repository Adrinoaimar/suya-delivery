import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CashRegisterPage from '@/pages/backoffice/CashRegisterPage';
import { useAuthStore } from '@/store/authStore';
import { useBackofficeContextStore } from '@/store/backofficeContextStore';
import { useOrderStore } from '@/store/orderStore';
import type { AuthIdentity } from '@/lib/auth/types';
import type { CashRegisterSession } from '@/lib/services';
import type { Store } from '@/types';

const mocks = vi.hoisted(() => ({
  listStores: vi.fn(),
  listCash: vi.fn(),
  openCash: vi.fn(),
  recordSale: vi.fn(),
  addAdjustment: vi.fn(),
  closeCash: vi.fn(),
  listTables: vi.fn(),
  payTable: vi.fn(),
  notify: vi.fn(),
  refreshOrders: vi.fn(),
}));

vi.mock('@/lib/services', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services')>()),
  storeService: { listStores: mocks.listStores },
  cashRegisterService: {
    list: mocks.listCash,
    open: mocks.openCash,
    recordSale: mocks.recordSale,
    addAdjustment: mocks.addAdjustment,
    close: mocks.closeCash,
  },
  tableService: {
    list: mocks.listTables,
    pay: mocks.payTable,
  },
  notificationService: { notify: mocks.notify },
}));

const restaurant: Store = {
  id: 'restaurant-1', name: 'Donde Joel', categoryId: 'restaurants', tags: [], description: '',
  rating: 5, reviews: 0, etaMin: 20, etaMax: 45, deliveryFee: 0, minOrder: 0, distanceKm: 0,
  isLocal: true, isFeatured: true, isRealBrand: true, promoLabel: null,
  schedule: { opens: '00:00', closes: '23:59' }, address: 'Sullana', phone: '', image: null,
  logo: null, sections: [], acceptingOrders: true,
};

const identity: AuthIdentity = {
  id: 'manager-1', email: 'manager@example.test', displayName: 'Manager', phone: '',
  defaultAddress: '', defaultReference: '', access: ['restaurant_staff'], restaurantIds: [restaurant.id],
};

const secondRestaurant: Store = { ...restaurant, id: 'restaurant-2', name: 'Andá Paya' };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

const openSession: CashRegisterSession = {
  id: 'session-1', restaurantId: restaurant.id, status: 'open', openingFloat: 20,
  expectedCash: 20, declaredCash: null, difference: null, openedAt: '2026-09-15T10:00:00.000Z',
  closedAt: null, entryCount: 0,
};

const order = {
  id: 'order-1', code: 'CASH001', storeId: restaurant.id, storeName: restaurant.name,
  items: [], subtotal: 30, deliveryFee: 0, discount: 0, total: 30, createdAt: '2026-09-15T10:00:00.000Z',
  status: 'delivered' as const, history: [], customer: { name: 'Cliente', phone: '900000001', address: 'Sullana', reference: '' },
  deliveryPosition: null, storePosition: null, paymentMethod: 'cash' as const, riderId: null,
  etaMinutes: 30, deliveryCode: '', cancelCode: '', cashRegisterSessionId: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('crypto', { randomUUID: vi.fn(() => '00000000-0000-4000-8000-000000000001') });
  useAuthStore.setState({ status: 'authenticated', identity, error: null });
  useBackofficeContextStore.setState({ activeRestaurantId: '' });
  useOrderStore.setState({ orders: [order], status: 'ready', error: null });
  mocks.listStores.mockResolvedValue([restaurant]);
  mocks.listCash.mockResolvedValue([]);
  mocks.listTables.mockResolvedValue([]);
  mocks.openCash.mockResolvedValue(openSession);
  mocks.recordSale.mockResolvedValue({ entryId: 'entry-1', sessionId: openSession.id, orderId: order.id, amount: 30, received: 30, change: 0 });
  mocks.addAdjustment.mockResolvedValue({ entryId: 'entry-2', sessionId: openSession.id, amount: 1, note: 'Ingreso' });
  mocks.closeCash.mockResolvedValue({ ...openSession, status: 'closed', declaredCash: 50, expectedCash: 50, difference: 0, closedAt: '2026-09-15T22:00:00.000Z' });
  mocks.refreshOrders.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  useAuthStore.setState({ status: 'idle', identity: null, error: null });
  useBackofficeContextStore.setState({ activeRestaurantId: '' });
  useOrderStore.setState({ orders: [], status: 'idle', error: null });
});

describe('CashRegisterPage', () => {
  it('preselecciona la cuenta y abre el turno', async () => {
    render(<CashRegisterPage />);
    expect(await screen.findByText('Cuenta fijada')).toBeInTheDocument();
    expect(screen.getByText(restaurant.name)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Abrir caja' }));
    await waitFor(() => expect(mocks.openCash).toHaveBeenCalledWith(
      restaurant.id, 0, '00000000-0000-4000-8000-000000000001',
    ));
    expect(await screen.findByText('Turno abierto')).toBeInTheDocument();
  });

  it('registra un pedido entregado y exige nota si el arqueo difiere', async () => {
    mocks.listCash.mockResolvedValue([openSession]);
    render(<CashRegisterPage />);
    expect(await screen.findByRole('button', { name: 'Registrar cobro' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Registrar cobro' }));
    await waitFor(() => expect(mocks.recordSale).toHaveBeenCalledWith(
      openSession.id, order.id, 30, '00000000-0000-4000-8000-000000000001',
    ));
    fireEvent.change(screen.getByLabelText('Efectivo contado'), { target: { value: '29' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar turno y guardar arqueo' }));
    expect(mocks.closeCash).not.toHaveBeenCalled();
    expect(mocks.notify).toHaveBeenCalledWith('Explica la diferencia antes de cerrar la caja.', 'warning');
  });

  it('registra también el efectivo pendiente de una mesa', async () => {
    useOrderStore.setState({ orders: [{ ...order, cashRegisterSessionId: openSession.id }] });
    mocks.listCash.mockResolvedValue([openSession]);
    mocks.listTables.mockResolvedValue([{
      id: 'table-1', restaurantId: restaurant.id, tableNumber: '12', status: 'awaiting_payment',
      sessionId: 'table-session-1', sessionStatus: 'payment_pending', total: 25,
      qrToken: 'server-token', active: true,
    }]);
    mocks.payTable.mockResolvedValue({ sessionId: 'table-session-1', total: 25, received: 30, change: 5 });

    render(<CashRegisterPage />);
    expect(await screen.findByText('Cobros pendientes de mesas')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Registrar cobro' }));
    await waitFor(() => expect(mocks.payTable).toHaveBeenCalledWith(
      'table-session-1', 25, 'cash', '00000000-0000-4000-8000-000000000001',
    ));
  });

  it('conserva la cuenta más reciente cuando una carga anterior termina tarde', async () => {
    const firstCash = deferred<CashRegisterSession[]>();
    const secondCash = deferred<CashRegisterSession[]>();
    const firstTables = deferred<never[]>();
    const secondTables = deferred<never[]>();
    const secondSession = { ...openSession, id: 'session-2', restaurantId: secondRestaurant.id };
    useAuthStore.setState({ identity: { ...identity, restaurantIds: [restaurant.id, secondRestaurant.id] } });
    mocks.listStores.mockResolvedValue([restaurant, secondRestaurant]);
    let cashCall = 0;
    let tableCall = 0;
    mocks.listCash.mockImplementation(() => [firstCash, secondCash][cashCall++].promise);
    mocks.listTables.mockImplementation(() => [firstTables, secondTables][tableCall++].promise);

    render(<CashRegisterPage />);
    const selector = await screen.findByLabelText('Cuenta de restaurante');
    fireEvent.change(selector, { target: { value: secondRestaurant.id } });
    await waitFor(() => expect(mocks.listCash).toHaveBeenCalledTimes(2));

    secondCash.resolve([secondSession]);
    secondTables.resolve([]);
    expect(await screen.findByText('Turno abierto')).toBeInTheDocument();

    firstCash.resolve([openSession]);
    firstTables.resolve([]);
    await waitFor(() => expect(screen.getByRole('heading', { name: secondRestaurant.name })).toBeInTheDocument());
    expect(screen.getByText('Turno abierto')).toBeInTheDocument();
  });
});
