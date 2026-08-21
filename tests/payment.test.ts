import { describe, expect, it } from 'vitest';
import { CashPaymentServiceImpl } from '@/lib/services/CashPaymentService';

describe('pago contra entrega', () => {
  it('registra efectivo sin simular una pasarela', async () => {
    const result = await new CashPaymentServiceImpl().authorize('cash', 42.5);
    expect(result.ok).toBe(true);
    expect(result.reference).toMatch(/^cod_/);
    expect(result.message).toContain('42.50 soles');
  });

  it('rechaza métodos digitales no integrados', async () => {
    const service = new CashPaymentServiceImpl();
    await expect(service.authorize('yape', 20)).resolves.toMatchObject({ ok: false });
    await expect(service.authorize('card', 20)).resolves.toMatchObject({ ok: false });
  });

  it('rechaza totales inválidos', async () => {
    const result = await new CashPaymentServiceImpl().authorize('cash', 0);
    expect(result.ok).toBe(false);
  });
});
