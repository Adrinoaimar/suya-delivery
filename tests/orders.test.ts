import { describe, expect, it } from 'vitest';
import {
  MockOrderServiceImpl,
  SIMULATION_TOTAL_SECONDS,
  progressForElapsed,
  statusForElapsed,
} from '@/lib/services/MockOrderService';
import { products } from '@/data';
import type { CartItem } from '@/types';

function buildItems(): CartItem[] {
  const product = products[0]!;
  return [
    {
      lineId: 'line-1',
      productId: product.id,
      storeId: product.storeId,
      name: product.name,
      unitPrice: product.price,
      quantity: 2,
      extras: [],
      note: '',
      image: null,
    },
  ];
}

function createService() {
  return new MockOrderServiceImpl();
}

const customer = {
  name: 'Ana Torres',
  phone: '987 654 321',
  address: 'Av. José de Lama 480',
  reference: 'Puerta verde',
};

describe('pedidos', () => {
  it('crea un pedido con código, total y estado inicial', () => {
    const service = createService();
    const order = service.create({
      storeId: 'el-buen-sabor',
      items: buildItems(),
      subtotal: 119.8,
      deliveryFee: 4,
      discount: 0,
      customer,
      paymentMethod: 'cash',
    });

    expect(order.code).toMatch(/^SUY-\d{5}$/);
    expect(order.status).toBe('confirmed');
    expect(order.total).toBeCloseTo(123.8, 2);
    expect(order.history).toHaveLength(1);
    expect(order.simulationStartedAt).not.toBeNull();
    expect(service.get(order.id)?.id).toBe(order.id);
  });

  it('actualiza el estado y guarda el historial', () => {
    const service = createService();
    const order = service.create({
      storeId: 'don-pizza',
      items: buildItems(),
      subtotal: 40,
      deliveryFee: 5,
      discount: 5,
      customer,
      paymentMethod: 'yape',
    });

    const updated = service.updateStatus(order.id, 'on_the_way');

    expect(updated?.status).toBe('on_the_way');
    expect(updated?.history.at(-1)?.status).toBe('on_the_way');
    expect(updated?.total).toBe(40);
  });

  it('genera códigos de entrega y cancelación distintos', () => {
    const service = createService();
    const order = service.create({
      storeId: 'el-buen-sabor',
      items: buildItems(),
      subtotal: 30,
      deliveryFee: 4,
      discount: 0,
      customer,
      paymentMethod: 'cash',
    });

    expect(order.deliveryCode).toMatch(/^\d{4}$/);
    expect(order.cancelCode).toMatch(/^\d{4}$/);
  });

  it('solo cancela con el código de cancelación correcto', () => {
    const service = createService();
    const order = service.create({
      storeId: 'el-buen-sabor',
      items: buildItems(),
      subtotal: 30,
      deliveryFee: 4,
      discount: 0,
      customer,
      paymentMethod: 'card',
    });

    const wrong = service.cancel(order.id, '0000' === order.cancelCode ? '1111' : '0000');
    expect(wrong.ok).toBe(false);
    expect(wrong.ok ? null : wrong.reason).toBe('invalid_code');
    expect(service.get(order.id)?.status).toBe('confirmed');

    const right = service.cancel(order.id, order.cancelCode);
    expect(right.ok).toBe(true);
    expect(service.get(order.id)?.status).toBe('cancelled');
    expect(service.get(order.id)?.simulationStartedAt).toBeNull();
  });

  it('solo cierra la entrega con el código del cliente', () => {
    const service = createService();
    const order = service.create({
      storeId: 'el-buen-sabor',
      items: buildItems(),
      subtotal: 30,
      deliveryFee: 4,
      discount: 0,
      customer,
      paymentMethod: 'cash',
    });
    service.updateStatus(order.id, 'on_the_way');

    const wrong = service.confirmDelivery(order.id, '0000' === order.deliveryCode ? '1111' : '0000');
    expect(wrong.ok).toBe(false);
    expect(service.get(order.id)?.status).toBe('on_the_way');

    const right = service.confirmDelivery(order.id, order.deliveryCode);
    expect(right.ok).toBe(true);
    expect(service.get(order.id)?.status).toBe('delivered');

    // Un pedido ya cerrado no vuelve a confirmarse.
    const again = service.confirmDelivery(order.id, order.deliveryCode);
    expect(again.ok).toBe(false);
    expect(again.ok ? null : again.reason).toBe('already_closed');
  });

  it('reinicia la simulación desde el primer estado', () => {
    const service = createService();
    const order = service.create({
      storeId: 'el-buen-sabor',
      items: buildItems(),
      subtotal: 30,
      deliveryFee: 4,
      discount: 0,
      customer,
      paymentMethod: 'cash',
    });
    service.updateStatus(order.id, 'delivered');

    const restarted = service.restartSimulation(order.id);

    expect(restarted?.status).toBe('confirmed');
    expect(restarted?.history).toHaveLength(1);
  });

  it('siembra el historial demo cuando no hay pedidos guardados', () => {
    const service = createService();
    const orders = service.list();

    expect(orders.length).toBeGreaterThanOrEqual(5);
    expect(orders.every((order) => order.items.length > 0)).toBe(true);
  });

  it('mapea el tiempo transcurrido al estado correcto', () => {
    expect(statusForElapsed(0)).toBe('confirmed');
    expect(statusForElapsed(7_000)).toBe('confirmed');
    expect(statusForElapsed(9_000)).toBe('preparing');
    expect(statusForElapsed(19_000)).toBe('picked_up');
    expect(statusForElapsed(29_000)).toBe('on_the_way');
    expect(statusForElapsed(SIMULATION_TOTAL_SECONDS * 1000)).toBe('delivered');
  });

  it('calcula el progreso de la ruta entre la recogida y la entrega', () => {
    expect(progressForElapsed(0)).toBe(0);
    expect(progressForElapsed(18_000)).toBe(0);
    expect(progressForElapsed(39_000)).toBeCloseTo(0.5, 2);
    expect(progressForElapsed(120_000)).toBe(1);
  });
});
