import type { Order } from '@/types';

const terminalOrderStatuses = new Set<Order['status']>(['cancelled', 'delivered']);
type PaymentStatusSource = Pick<Order, 'paymentMethod'> & {
  paymentIntent?: Pick<NonNullable<Order['paymentIntent']>, 'status'> | null;
};

export function isPendingDigitalPayment(order: PaymentStatusSource): boolean {
  return order.paymentMethod !== 'cash' && order.paymentIntent?.status !== 'authorized';
}

export function isOperationalOrder(order: Pick<Order, 'status'> & PaymentStatusSource): boolean {
  if (order.status === 'pending_payment') return false;
  return terminalOrderStatuses.has(order.status) || !isPendingDigitalPayment(order);
}
