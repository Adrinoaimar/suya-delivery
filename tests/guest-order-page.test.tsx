import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import GuestOrderPage from '@/pages/customer/GuestOrderPage';
import type { Order } from '@/types';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  consume: vi.fn(),
}));

vi.mock('@/lib/services', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services')>()),
  orderService: { get: mocks.get },
  consumeGuestOrderTokenFromHash: mocks.consume,
}));

const guestOrder: Order = {
  id: 'order-refresh-1',
  code: 'SUY-00001',
  storeId: 'restaurant-1',
  storeName: 'Donde Joel',
  items: [
    {
      lineId: 'line-1',
      productId: 'product-1',
      storeId: 'restaurant-1',
      name: 'Majado de yuca',
      unitPrice: 25,
      quantity: 1,
      extras: [],
      note: '',
      image: null,
    },
  ],
  subtotal: 25,
  deliveryFee: 0,
  discount: 0,
  total: 25,
  createdAt: '2026-09-15T20:00:00.000Z',
  status: 'confirmed',
  history: [{ status: 'confirmed', at: '2026-09-15T20:00:00.000Z' }],
  customer: {
    name: 'Ana Torres',
    phone: '987654321',
    address: 'Mesa 12',
    reference: '',
  },
  deliveryPosition: null,
  storePosition: null,
  paymentMethod: 'cash',
  riderId: null,
  etaMinutes: 20,
  deliveryCode: '1234',
  cancelCode: '5678',
  origin: 'table_qr',
  tableId: 'table-1',
  paymentIntent: null,
};

describe('GuestOrderPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.get.mockResolvedValue(guestOrder);
  });

  it('vuelve a consultar el pedido al pulsar Actualizar estado', async () => {
    render(
      <MemoryRouter
        initialEntries={[{ pathname: '/pedido/order-refresh-1', state: { guestOrder } }]}
      >
        <Routes>
          <Route path="/pedido/:id" element={<GuestOrderPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole('heading', { name: 'Pedido enviado a tu mesa' }),
    ).toBeInTheDocument();
    expect(mocks.get).toHaveBeenCalledTimes(1);
    expect(document.head.querySelector('meta[name="robots"]')).toHaveAttribute(
      'content',
      'noindex,nofollow',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Actualizar estado' }));

    await waitFor(() => expect(mocks.get).toHaveBeenCalledTimes(2));
    expect(
      await screen.findByRole('heading', { name: 'Pedido enviado a tu mesa' }),
    ).toBeInTheDocument();
  });

  it('actualiza al recuperar conexión sin añadir datos secundarios al comprobante', async () => {
    render(
      <MemoryRouter
        initialEntries={[{ pathname: '/pedido/order-refresh-1', state: { guestOrder } }]}
      >
        <Routes>
          <Route path="/pedido/:id" element={<GuestOrderPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole('heading', { name: 'Pedido enviado a tu mesa' }),
    ).toBeInTheDocument();
    window.dispatchEvent(new Event('online'));

    await waitFor(() => expect(mocks.get).toHaveBeenCalledTimes(2));
    expect(screen.queryByText(/Actualizado/)).not.toBeInTheDocument();
  });

  it('actualiza al volver al primer plano si el pedido estaba visible', async () => {
    render(
      <MemoryRouter
        initialEntries={[{ pathname: '/pedido/order-refresh-1', state: { guestOrder } }]}
      >
        <Routes>
          <Route path="/pedido/:id" element={<GuestOrderPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole('heading', { name: 'Pedido enviado a tu mesa' }),
    ).toBeInTheDocument();
    expect(mocks.get).toHaveBeenCalledTimes(1);

    document.dispatchEvent(new Event('visibilitychange'));

    await waitFor(() => expect(mocks.get).toHaveBeenCalledTimes(2));
  });

  it('no pinta el estado de navegación si el servidor no autoriza el pedido', async () => {
    mocks.get.mockResolvedValueOnce(undefined);

    render(
      <MemoryRouter
        initialEntries={[{ pathname: '/pedido/order-refresh-1', state: { guestOrder } }]}
      >
        <Routes>
          <Route path="/pedido/:id" element={<GuestOrderPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(
      screen.queryByRole('heading', { name: 'Pedido enviado a tu mesa' }),
    ).not.toBeInTheDocument();
    expect(await screen.findByText('No encontramos este pedido')).toBeInTheDocument();
  });
});
