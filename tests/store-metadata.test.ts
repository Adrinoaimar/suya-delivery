import { describe, expect, it } from 'vitest';
import { stores } from '@/data';
import { formatDistance } from '@/utils/format';
import { isStoreAcceptingOrders, scheduleLabel } from '@/utils/schedule';

describe('metadatos verificables del negocio', () => {
  it('no inventa horario ni distancia cuando faltan', () => {
    expect(scheduleLabel({ opens: '00:00', closes: '00:00' })).toBe('Horario por confirmar');
    expect(formatDistance(0)).toBe('Por calcular');
  });

  it('el control operativo del backend prevalece sobre el horario', () => {
    const store = { ...stores[0]!, acceptingOrders: false };
    expect(isStoreAcceptingOrders(store, new Date('2026-08-20T18:00:00-05:00'))).toBe(false);

    expect(isStoreAcceptingOrders({ ...store, acceptingOrders: true })).toBe(true);
  });
});
