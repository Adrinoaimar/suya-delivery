import { afterEach, describe, expect, it, vi } from 'vitest';
import { MockOrderServiceImpl } from '@/lib/services/MockOrderService';
import { orderService } from '@/lib/services';
import { products } from '@/data';
import { useOrderStore } from '@/store/orderStore';
import type { CartItem } from '@/types';

function buildItems(): CartItem[] {
  const product = products.find((candidate) => candidate.storeId === 'anda-paya')!;
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

const customer = {
  name: 'Ana Torres',
  phone: '987 654 321',
  address: 'Av. José de Lama 480',
  reference: 'Puerta verde',
};

async function createOrder(service: MockOrderServiceImpl) {
  return service.create({
    storeId: 'anda-paya',
    items: buildItems(),
    subtotal: 30,
    deliveryFee: 4,
    discount: 0,
    customer,
    deliveryPosition: { lat: -4.8941, lng: -80.6899 },
    paymentMethod: 'cash',
  });
}

describe('contrato de pedidos async', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    useOrderStore.getState().reset();
  });

  it('crea un pedido sin asignar repartidor aleatorio', async () => {
    const service = new MockOrderServiceImpl();
    const order = await service.create({
      storeId: 'anda-paya',
      items: buildItems(),
      subtotal: 119.8,
      deliveryFee: 4,
      discount: 0,
      customer,
      deliveryPosition: { lat: -4.8941, lng: -80.6899 },
      paymentMethod: 'cash',
    });

    expect(order.code).toMatch(/^SUY-\d{5}$/);
    expect(order.status).toBe('confirmed');
    expect(order.total).toBeCloseTo(123.8, 2);
    expect(order.riderId).toBeNull();
    expect((await service.get(order.id))?.id).toBe(order.id);
  });

  it('rechaza pedidos directos de locales marcados como próximamente', async () => {
    const service = new MockOrderServiceImpl();

    await expect(
      service.create({
        storeId: 'el-buen-sabor',
        items: buildItems(),
        subtotal: 30,
        deliveryFee: 4,
        discount: 0,
        customer,
        deliveryPosition: null,
        paymentMethod: 'cash',
      }),
    ).rejects.toThrow('próximamente');
  });

  it('actualiza el estado y conserva historial', async () => {
    const service = new MockOrderServiceImpl();
    const order = await createOrder(service);
    const updated = await service.updateStatus(order.id, 'on_the_way');

    expect(updated?.status).toBe('on_the_way');
    expect(updated?.history.at(-1)?.status).toBe('on_the_way');
  });

  it('genera códigos de entrega y cancelación distintos', async () => {
    const order = await createOrder(new MockOrderServiceImpl());
    expect(order.deliveryCode).toMatch(/^\d{4}$/);
    expect(order.cancelCode).toMatch(/^\d{4}$/);
    expect(order.deliveryCode).not.toBe(order.cancelCode);
  });

  it('nunca retrocede ni salta a delivered mediante updateStatus', async () => {
    const service = new MockOrderServiceImpl();
    const order = await createOrder(service);

    await service.updateStatus(order.id, 'picked_up');
    await service.updateStatus(order.id, 'preparing');
    expect((await service.get(order.id))?.status).toBe('picked_up');

    await service.updateStatus(order.id, 'delivered');
    expect((await service.get(order.id))?.status).toBe('picked_up');
  });

  it('confirmDelivery exige estado en camino', async () => {
    const service = new MockOrderServiceImpl();
    const order = await createOrder(service);
    const early = await service.confirmDelivery(order.id, order.deliveryCode);

    expect(early.ok).toBe(false);
    expect(early.ok ? null : early.reason).toBe('invalid_status');
  });

  it('cancela por código visible usando el id real', async () => {
    const service = new MockOrderServiceImpl();
    const order = await createOrder(service);
    const result = await service.cancel(order.code, order.cancelCode);

    expect(result.ok).toBe(true);
    expect((await service.get(order.id))?.status).toBe('cancelled');
  });

  it('rechaza códigos incorrectos', async () => {
    const service = new MockOrderServiceImpl();
    const order = await createOrder(service);
    const wrongCode = '0000' === order.cancelCode ? '1111' : '0000';
    const result = await service.cancel(order.id, wrongCode);

    expect(result.ok).toBe(false);
    expect(result.ok ? null : result.reason).toBe('invalid_code');
    expect((await service.get(order.id))?.status).toBe('confirmed');
  });

  it('solo confirma una entrega una vez', async () => {
    const service = new MockOrderServiceImpl();
    const order = await createOrder(service);
    await service.updateStatus(order.id, 'on_the_way');

    const first = await service.confirmDelivery(order.id, order.deliveryCode);
    const second = await service.confirmDelivery(order.id, order.deliveryCode);

    expect(first.ok).toBe(true);
    expect((await service.get(order.id))?.status).toBe('delivered');
    expect(second.ok).toBe(false);
    expect(second.ok ? null : second.reason).toBe('already_closed');
  });

  it('descarta una respuesta vieja cuando una actualización más reciente termina primero', async () => {
    let resolveOld!: (orders: []) => void;
    const oldResponse = new Promise<[]>((resolve) => {
      resolveOld = resolve;
    });
    const latestOrder = { id: 'latest-order' } as never;
    vi.spyOn(orderService, 'list')
      .mockReturnValueOnce(oldResponse)
      .mockResolvedValueOnce([latestOrder]);

    const oldRefresh = useOrderStore.getState().refresh();
    const latestRefresh = useOrderStore.getState().refresh();
    await latestRefresh;
    resolveOld([]);
    await oldRefresh;

    expect(useOrderStore.getState().orders).toEqual([latestOrder]);
    expect(useOrderStore.getState().status).toBe('ready');
  });

  it('carga la siguiente página sin repetir pedidos y corta al llegar al final', async () => {
    const firstPage = Array.from({ length: 50 }, (_, index) => ({ id: `page-${index}` } as never));
    const lastPage = [{ id: 'page-50' } as never];
    const list = vi.spyOn(orderService, 'list')
      .mockResolvedValueOnce(firstPage)
      .mockResolvedValueOnce(lastPage);

    await useOrderStore.getState().refresh();
    await useOrderStore.getState().loadMore();

    expect(list).toHaveBeenNthCalledWith(1, { offset: 0, limit: 50 });
    expect(list).toHaveBeenNthCalledWith(2, { offset: 50, limit: 50 });
    expect(useOrderStore.getState().orders).toHaveLength(51);
    expect(useOrderStore.getState().hasMore).toBe(false);
  });

  it('mantiene el límite de 50 también en el servicio demo', async () => {
    const service = new MockOrderServiceImpl();
    await Promise.all(Array.from({ length: 55 }, () => createOrder(service)));

    const page = await service.list({ offset: 0, limit: 100 });
    const defaultPage = await service.list();

    expect(page).toHaveLength(50);
    expect(defaultPage).toHaveLength(50);
  });
});
