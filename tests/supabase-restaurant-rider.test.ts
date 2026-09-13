import { describe, expect, it, vi } from 'vitest';
import { SupabaseRestaurantRiderService } from '@/lib/services/SupabaseRestaurantRiderService';

describe('gestión Supabase de repartidores', () => {
  it('traduce el esquema faltante a un mensaje accionable', async () => {
    const client = {
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: {
          code: '42883',
          message: 'function list_restaurant_riders does not exist',
        },
      }),
    };
    const service = new SupabaseRestaurantRiderService(client as never);

    await expect(service.list('restaurant-1')).rejects.toThrow(
      'La gestión de repartidores aún no está activada en la base de datos.',
    );
  });
});
