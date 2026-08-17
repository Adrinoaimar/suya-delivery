import { create } from 'zustand';
import { orderService, statusForElapsed } from '@/lib/services';
import type { CreateOrderInput } from '@/lib/services';
import type { Order } from '@/types';

interface OrderState {
  orders: Order[];
  refresh: () => void;
  createOrder: (input: CreateOrderInput) => Order;
  cancelOrder: (id: string) => void;
  restartSimulation: (id: string) => void;
  /** Avanza la simulación local de estados. La llama `useOrderSimulation`. */
  tick: () => void;
  getOrder: (id: string) => Order | undefined;
}

export const useOrderStore = create<OrderState>((set, get) => ({
  orders: orderService.list(),

  refresh() {
    set({ orders: [...orderService.list()] });
  },

  createOrder(input) {
    const order = orderService.create(input);
    set({ orders: [...orderService.list()] });
    return order;
  },

  cancelOrder(id) {
    orderService.cancel(id);
    set({ orders: [...orderService.list()] });
  },

  restartSimulation(id) {
    orderService.restartSimulation(id);
    set({ orders: [...orderService.list()] });
  },

  tick() {
    const now = Date.now();
    let changed = false;

    const orders = get().orders.map((order) => {
      if (order.simulationStartedAt === null) return order;
      if (order.status === 'delivered' || order.status === 'cancelled') return order;

      const next = statusForElapsed(now - order.simulationStartedAt);
      if (next === order.status) return order;

      changed = true;
      return {
        ...order,
        status: next,
        history: [...order.history, { status: next, at: new Date().toISOString() }],
      };
    });

    if (!changed) return;
    orderService.save(orders);
    set({ orders });
  },

  getOrder(id) {
    return get().orders.find((order) => order.id === id || order.code === id);
  },
}));

/** Pedido en curso (el más reciente que aún no llegó ni fue cancelado). */
export function selectActiveOrder(orders: Order[]): Order | undefined {
  return orders.find((order) => order.status !== 'delivered' && order.status !== 'cancelled');
}
