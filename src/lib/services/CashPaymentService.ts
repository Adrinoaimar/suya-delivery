import { createId } from '@/utils/id';
import type { PaymentService, PaymentResult } from './types';
import type { PaymentMethod } from '@/types';

export class CashPaymentServiceImpl implements PaymentService {
  async authorize(method: PaymentMethod, amount: number): Promise<PaymentResult> {
    if (method !== 'cash') {
      return {
        ok: false,
        reference: '',
        message: 'Este método de pago todavía no está habilitado.',
      };
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return { ok: false, reference: '', message: 'El total del pedido no es válido.' };
    }
    return {
      ok: true,
      reference: createId('cod'),
      message: `Pagarás ${amount.toFixed(2)} soles en efectivo al recibir tu pedido.`,
    };
  }
}

export const CashPaymentService = new CashPaymentServiceImpl();
