import { riders, seedOrders } from '@/data';
import { STORAGE_KEYS, readLocal, writeLocal } from '@/lib/storage';
import { createId, createOrderCode, createPinCode } from '@/utils/id';
import type { CartItem, Order, OrderStatus } from '@/types';
import { MockStoreService } from './MockStoreService';
import type { CodeResult, CreateOrderInput, OrderService } from './types';

/**
 * Guion de la simulación local de estados (segundos desde la confirmación).
 * El paso final a «Entregado» NO ocurre solo: lo confirma el repartidor con el código
 * de 4 dígitos del cliente (`confirmDelivery`).
 */
export const SIMULATION_STEPS: { at: number; status: OrderStatus }[] = [
  { at: 0, status: 'confirmed' },
  { at: 8, status: 'preparing' },
  { at: 18, status: 'picked_up' },
  { at: 28, status: 'on_the_way' },
  { at: 60, status: 'delivered' },
];

export const SIMULATION_TOTAL_SECONDS = 60;

/** Estado que corresponde a un tiempo transcurrido (ms) desde el inicio de la simulación. */
export function statusForElapsed(elapsedMs: number): OrderStatus {
  const seconds = elapsedMs / 1000;
  let status: OrderStatus = 'confirmed';
  for (const step of SIMULATION_STEPS) {
    if (seconds >= step.at) status = step.status;
  }
  return status;
}

/** Progreso del recorrido (0–1) usado por el mapa y la línea de tiempo. */
export function progressForElapsed(elapsedMs: number): number {
  const pickup = SIMULATION_STEPS[2]!.at;
  const seconds = elapsedMs / 1000;
  if (seconds <= pickup) return 0;
  const span = SIMULATION_TOTAL_SECONDS - pickup;
  return Math.min(1, (seconds - pickup) / span);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export class MockOrderServiceImpl implements OrderService {
  private cache: Order[] | null = null;

  list(): Order[] {
    if (this.cache) return this.cache;
    const stored = readLocal<Order[] | null>(STORAGE_KEYS.orders, null);
    this.cache = stored && stored.length > 0 ? stored : this.seed();
    return this.cache;
  }

  get(id: string): Order | undefined {
    return this.list().find((order) => order.id === id || order.code === id);
  }

  create(input: CreateOrderInput): Order {
    const store = MockStoreService.getStore(input.storeId);
    const now = new Date();
    const order: Order = {
      id: createId('ord'),
      code: createOrderCode(),
      storeId: input.storeId,
      storeName: store?.name ?? 'Negocio',
      items: input.items,
      subtotal: round2(input.subtotal),
      deliveryFee: round2(input.deliveryFee),
      discount: round2(input.discount),
      total: round2(input.subtotal + input.deliveryFee - input.discount),
      createdAt: now.toISOString(),
      status: 'confirmed',
      history: [{ status: 'confirmed', at: now.toISOString() }],
      customer: input.customer,
      paymentMethod: input.paymentMethod,
      riderId: riders[Math.floor(Math.random() * riders.length)]!.id,
      etaMinutes: store?.etaMax ?? 30,
      deliveryCode: createPinCode(),
      cancelCode: createPinCode(),
      simulationStartedAt: now.getTime(),
    };

    this.cache = [order, ...this.list()];
    this.persist();
    return order;
  }

  updateStatus(id: string, status: OrderStatus): Order | undefined {
    const orders = this.list().map((order) => {
      if (order.id !== id || order.status === status) return order;
      return {
        ...order,
        status,
        history: [...order.history, { status, at: new Date().toISOString() }],
      };
    });
    this.cache = orders;
    this.persist();
    return this.get(id);
  }

  /**
   * Cancelar exige escribir el código de cancelación del pedido: evita cancelaciones
   * accidentales y deja constancia de que la decisión fue deliberada.
   */
  cancel(id: string, code: string): CodeResult {
    const order = this.get(id);
    if (!order) return { ok: false, reason: 'not_found' };
    if (order.status === 'delivered') return { ok: false, reason: 'already_closed' };
    if (order.status === 'cancelled') return { ok: false, reason: 'already_closed' };
    if (code.trim() !== order.cancelCode) return { ok: false, reason: 'invalid_code' };

    this.cache = this.list().map((item) =>
      item.id === id
        ? {
            ...item,
            status: 'cancelled' as OrderStatus,
            simulationStartedAt: null,
            history: [
              ...item.history,
              { status: 'cancelled' as OrderStatus, at: new Date().toISOString() },
            ],
          }
        : item,
    );
    this.persist();
    return { ok: true, order: this.get(id)! };
  }

  /**
   * El repartidor cierra el pedido con el código de 4 dígitos que le da el cliente.
   * Sin código correcto, el pedido no pasa a «Entregado».
   */
  confirmDelivery(id: string, code: string): CodeResult {
    const order = this.get(id);
    if (!order) return { ok: false, reason: 'not_found' };
    if (order.status === 'cancelled') return { ok: false, reason: 'already_closed' };
    if (order.status === 'delivered') return { ok: false, reason: 'already_closed' };
    if (code.trim() !== order.deliveryCode) return { ok: false, reason: 'invalid_code' };

    const updated = this.updateStatus(id, 'delivered');
    return updated ? { ok: true, order: updated } : { ok: false, reason: 'not_found' };
  }

  restartSimulation(id: string): Order | undefined {
    const now = new Date();
    this.cache = this.list().map((order) =>
      order.id === id
        ? {
            ...order,
            status: 'confirmed' as OrderStatus,
            simulationStartedAt: now.getTime(),
            history: [{ status: 'confirmed' as OrderStatus, at: now.toISOString() }],
          }
        : order,
    );
    this.persist();
    return this.get(id);
  }

  save(orders: Order[]): void {
    this.cache = orders;
    this.persist();
  }

  /** Historial DEMO DATA creado la primera vez que se abre la aplicación. */
  private seed(): Order[] {
    const orders = seedOrders.map((seed) => {
      const store = MockStoreService.getStore(seed.storeId);
      const createdAt = new Date(Date.now() - seed.daysAgo * 86_400_000);
      const items: CartItem[] = seed.items.flatMap((line) => {
        const product = MockStoreService.getProduct(line.productId);
        if (!product) return [];
        return [
          {
            lineId: `${seed.code}-${product.id}`,
            productId: product.id,
            storeId: product.storeId,
            name: product.name,
            unitPrice: product.price,
            quantity: line.quantity,
            extras: [],
            note: '',
            image: product.image,
          },
        ];
      });
      const subtotal = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
      const deliveryFee = store?.deliveryFee ?? 4;
      return {
        id: `seed_${seed.code}`,
        code: seed.code,
        storeId: seed.storeId,
        storeName: store?.name ?? 'Negocio',
        items,
        subtotal: round2(subtotal),
        deliveryFee,
        discount: seed.discount,
        total: round2(subtotal + deliveryFee - seed.discount),
        createdAt: createdAt.toISOString(),
        status: seed.status as OrderStatus,
        history: [
          { status: 'confirmed' as OrderStatus, at: createdAt.toISOString() },
          {
            status: seed.status as OrderStatus,
            at: new Date(createdAt.getTime() + 40 * 60_000).toISOString(),
          },
        ],
        customer: {
          name: 'Cliente demo',
          phone: '+51 900 000 000',
          address: 'Urb. Popular Villa Perú Canadá, Sullana',
          reference: 'Casa de reja verde',
        },
        paymentMethod: seed.paymentMethod as Order['paymentMethod'],
        riderId: seed.riderId,
        etaMinutes: store?.etaMax ?? 30,
        deliveryCode: createPinCode(),
        cancelCode: createPinCode(),
        simulationStartedAt: null,
      } as Order;
    });

    writeLocal(STORAGE_KEYS.orders, orders);
    return orders;
  }

  private persist(): void {
    writeLocal(STORAGE_KEYS.orders, this.cache ?? []);
  }
}

export const MockOrderService = new MockOrderServiceImpl();
