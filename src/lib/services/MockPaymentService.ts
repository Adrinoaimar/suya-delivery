import { createId } from '@/utils/id';
import type { PaymentMethod } from '@/types';
import type { PaymentResult, PaymentService } from './types';

/**
 * Pago simulado. NO existe integración con ninguna pasarela ni se transmite dato alguno.
 * FUTURE: reemplazar por una implementación que hable con el backend de pagos.
 */
export class MockPaymentServiceImpl implements PaymentService {
  async authorize(method: PaymentMethod, amount: number): Promise<PaymentResult> {
    await new Promise((resolve) => setTimeout(resolve, 700));
    const labels: Record<PaymentMethod, string> = {
      cash: 'Pagarás en efectivo al recibir tu pedido.',
      yape: 'Yape en modo demostración: no se realizó ningún cobro.',
      card: 'Tarjeta en modo demostración: no se realizó ningún cobro.',
    };
    return {
      ok: true,
      reference: createId('pay'),
      message: `${labels[method]} Total simulado: S/ ${amount.toFixed(2)}.`,
    };
  }
}

export const MockPaymentService = new MockPaymentServiceImpl();
