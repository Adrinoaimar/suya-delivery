import { createId } from '@/utils/id';
import type { PaymentService, PaymentResult } from './types';
import type { PaymentIntent, PaymentMethod } from '@/types';

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

  async createIntent(): Promise<PaymentIntent> {
    throw new Error('Los pagos digitales requieren Supabase configurado.');
  }

  async submitEvidence(): Promise<boolean> {
    throw new Error('La evidencia de pago requiere Supabase configurado.');
  }

  async declarePayment(): Promise<boolean> {
    throw new Error('La declaración de pago requiere Supabase configurado.');
  }

  async confirmWalletPayment(): Promise<never> {
    throw new Error('La confirmación de billetera requiere Supabase configurado.');
  }

  async getPaymentDeclaration(): Promise<null> {
    throw new Error('La declaración de pago requiere Supabase configurado.');
  }

  async chargeCard(): Promise<string> {
    throw new Error('Los pagos digitales requieren Supabase configurado.');
  }

  async getIntent(): Promise<PaymentIntent | null> {
    throw new Error('Los pagos digitales requieren Supabase configurado.');
  }
}

export const CashPaymentService = new CashPaymentServiceImpl();
