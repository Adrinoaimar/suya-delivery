import { fireEvent, render, screen } from '@testing-library/react';
import { act } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import RiderHistoryPage from '@/pages/rider/RiderHistoryPage';
import { useOrderStore } from '@/store/orderStore';
import type { Order } from '@/types';

function order(id: string, code: string): Order {
  return {
    id,
    code,
    storeId: 'restaurant-1',
    storeName: 'Donde Joel',
    items: [
      {
        lineId: `${id}-item`,
        productId: 'product-1',
        storeId: 'restaurant-1',
        name: 'Arroz con mariscos',
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
    createdAt: '2026-09-12T10:00:00.000Z',
    status: 'delivered',
    history: [
      { status: 'confirmed', at: '2026-09-12T10:00:00.000Z' },
      { status: 'delivered', at: '2026-09-12T10:30:00.000Z' },
    ],
    customer: {
      name: 'Cliente demo',
      phone: '999999999',
      address: 'Sullana',
      reference: '',
    },
    deliveryPosition: null,
    storePosition: null,
    paymentMethod: 'cash',
    riderId: 'rider-1',
    etaMinutes: 30,
    deliveryCode: '1234',
    cancelCode: '5678',
  };
}

afterEach(() => useOrderStore.getState().reset());

describe('historial del rider', () => {
  it('expande el detalle dentro del viaje seleccionado', () => {
    useOrderStore.setState({
      orders: [order('order-1', '1001'), order('order-2', '1002')],
      status: 'ready',
      error: null,
    });

    render(
      <MemoryRouter>
        <RiderHistoryPage />
      </MemoryRouter>,
    );

    act(() => {
      fireEvent.click(screen.getAllByRole('button', { name: 'Mostrar detalle' })[0]!);
    });
    const detail = screen.getByLabelText('Detalle 1001');
    const rows = screen.getAllByRole('list')[0]!.querySelectorAll(':scope > li');

    expect(rows[0]).toContainElement(detail);
    expect(rows[1]).not.toContainElement(detail);
    expect(screen.getByRole('button', { name: 'Ocultar' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });
});
