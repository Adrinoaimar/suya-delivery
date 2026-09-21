import { describe, expect, it } from 'vitest';
import { isOperationalOrder, isPendingDigitalPayment } from '@/lib/orderOperations';

const base = {
  paymentMethod: 'lemon' as const,
  paymentIntent: { status: 'pending' as const },
};

describe('visibilidad de pedidos en operaciones', () => {
  it('oculta pedidos digitales sin pago autorizado', () => {
    expect(isPendingDigitalPayment(base)).toBe(true);
    expect(isOperationalOrder({ ...base, status: 'confirmed' })).toBe(false);
  });

  it('muestra pedidos digitales después de autorizar el pago', () => {
    const paid = { ...base, paymentIntent: { status: 'authorized' as const } };
    expect(isPendingDigitalPayment(paid)).toBe(false);
    expect(isOperationalOrder({ ...paid, status: 'confirmed' })).toBe(true);
  });

  it('mantiene historial cancelado aunque el pago digital no esté autorizado', () => {
    expect(isOperationalOrder({ ...base, status: 'cancelled' })).toBe(true);
  });

  it('mantiene efectivo visible sin intento de pago digital', () => {
    expect(isPendingDigitalPayment({ paymentMethod: 'cash', paymentIntent: null })).toBe(false);
    expect(
      isOperationalOrder({ paymentMethod: 'cash', paymentIntent: null, status: 'confirmed' }),
    ).toBe(true);
  });
});
