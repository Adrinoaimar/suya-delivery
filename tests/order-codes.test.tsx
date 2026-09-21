import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { OrderCodes } from '@/components/order/OrderCodes';
import type { Order } from '@/types';

const order = {
  id: 'order-1',
  code: 'SUY-00001',
  storeId: 'anda-paya',
  storeName: 'Andá Paya',
  items: [],
  subtotal: 20,
  deliveryFee: 4,
  discount: 0,
  total: 24,
  createdAt: '2026-09-19T12:00:00.000Z',
  status: 'delivered',
  history: [],
  customer: { name: 'Cliente demo', phone: '900 000 000', address: 'Sullana', reference: '' },
  deliveryPosition: null,
  storePosition: null,
  paymentMethod: 'cash',
  riderId: 'rider-1',
  etaMinutes: 30,
  deliveryCode: '1234',
  cancelCode: '5678',
} satisfies Order;

describe('código visible en Cliente', () => {
  it('mantiene visible código de entrega después de cerrar pedido', () => {
    render(<OrderCodes order={order} />);

    expect(screen.getByText('Código de entrega')).toBeInTheDocument();
    expect(screen.getByText('1234')).toBeInTheDocument();
    expect(screen.getByText('Este pedido ya está cerrado.')).toBeInTheDocument();
  });
});
