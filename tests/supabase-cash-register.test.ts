import { describe, expect, it, vi } from 'vitest';
import { SupabaseCashRegisterService } from '@/lib/services/SupabaseCashRegisterService';

function clientWith(data: unknown, error: { message: string } | null = null) {
  return { rpc: vi.fn().mockResolvedValue({ data, error }) } as never;
}

const sessionRow = {
  session_id: 'session-1',
  restaurant_id: 'restaurant-1',
  status: 'open',
  opening_float: '20.00',
  expected_cash: '20.00',
  declared_cash: null,
  difference: null,
  opened_at: '2026-09-15T10:00:00.000Z',
  closed_at: null,
  entry_count: '0',
};

describe('SupabaseCashRegisterService', () => {
  it('evita una RPC inútil cuando no hay restaurantes autorizados', async () => {
    const client = clientWith([]) as { rpc: ReturnType<typeof vi.fn> };
    await expect(new SupabaseCashRegisterService(client as never).list([])).resolves.toEqual([]);
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it('mapea el resumen de caja y sus saldos nullable', async () => {
    const client = clientWith([sessionRow]) as { rpc: ReturnType<typeof vi.fn> };
    const result = await new SupabaseCashRegisterService(client as never).list(['restaurant-1']);
    expect(result).toEqual([{
      id: 'session-1',
      restaurantId: 'restaurant-1',
      status: 'open',
      openingFloat: 20,
      expectedCash: 20,
      declaredCash: null,
      difference: null,
      openedAt: '2026-09-15T10:00:00.000Z',
      closedAt: null,
      entryCount: 0,
    }]);
    expect(client.rpc).toHaveBeenCalledWith('list_cash_register_sessions', {
      p_restaurant_ids: ['restaurant-1'],
    });
  });

  it('envía claves de idempotencia y mapea cobro, ajuste y cierre', async () => {
    const client = {
      rpc: vi.fn()
        .mockResolvedValueOnce({ data: [sessionRow], error: null })
        .mockResolvedValueOnce({
          data: [{ entry_id: 'entry-1', session_id: 'session-1', order_id: 'order-1', amount: '30', received: '35', change: '5' }],
          error: null,
        })
        .mockResolvedValueOnce({
          data: [{ entry_id: 'entry-2', session_id: 'session-1', amount: '-2', note: 'Vuelto' }],
          error: null,
        })
        .mockResolvedValueOnce({ data: [{ ...sessionRow, status: 'closed', declared_cash: '53', expected_cash: '55', difference: '-2', closed_at: '2026-09-15T22:00:00.000Z' }], error: null }),
    } as never;
    const service = new SupabaseCashRegisterService(client);
    await service.open('restaurant-1', 20, 'open-request');
    await expect(service.recordSale('session-1', 'order-1', 35, 'sale-request')).resolves.toMatchObject({ change: 5 });
    await expect(service.addAdjustment('session-1', -2, 'Vuelto', 'adjustment-request')).resolves.toMatchObject({ amount: -2 });
    await expect(service.close('session-1', 53, '', 'close-request')).resolves.toMatchObject({ difference: -2 });
    expect((client as { rpc: ReturnType<typeof vi.fn> }).rpc).toHaveBeenNthCalledWith(1, 'open_cash_register', {
      p_restaurant_id: 'restaurant-1', p_opening_float: 20, p_request_id: 'open-request',
    });
    expect((client as { rpc: ReturnType<typeof vi.fn> }).rpc).toHaveBeenNthCalledWith(4, 'close_cash_register', {
      p_session_id: 'session-1', p_declared_cash: 53, p_close_note: '', p_request_id: 'close-request',
    });
  });

  it('propaga el error del backend sin inventar un saldo', async () => {
    const service = new SupabaseCashRegisterService(clientWith(null, { message: 'cash register is closed' }));
    await expect(service.open('restaurant-1', 0, 'request')).rejects.toThrow('cash register is closed');
  });
});
