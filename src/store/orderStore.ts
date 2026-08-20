import { create } from 'zustand';
import { orderService } from '@/lib/services';
import type { CodeResult, CreateOrderInput } from '@/lib/services';
import type { Order, OrderStatus } from '@/types';

type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';
let orderGeneration = 0;

interface OrderState {
  orders: Order[];
  status: LoadStatus;
  error: string | null;
  hydrate: () => Promise<void>;
  refresh: () => Promise<void>;
  createOrder: (input: CreateOrderInput) => Promise<Order>;
  updateOrderStatus: (id: string, status: OrderStatus) => Promise<Order | undefined>;
  cancelOrder: (id: string, code: string) => Promise<CodeResult>;
  confirmDelivery: (id: string, code: string) => Promise<CodeResult>;
  getOrder: (id: string) => Order | undefined;
  reset: () => void;
}

function replaceOrder(orders: Order[], updated: Order): Order[] {
  const exists = orders.some((order) => order.id === updated.id);
  if (!exists) return [updated, ...orders];
  return orders.map((order) => (order.id === updated.id ? updated : order));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'No pudimos cargar los pedidos.';
}

export const useOrderStore = create<OrderState>((set, get) => ({
  orders: [],
  status: 'idle',
  error: null,

  async hydrate() {
    if (get().status !== 'idle') return;
    await get().refresh();
  },

  async refresh() {
    const generation = orderGeneration;
    set({ status: 'loading', error: null });
    try {
      const orders = await orderService.list();
      if (generation === orderGeneration) set({ orders, status: 'ready', error: null });
    } catch (error) {
      if (generation === orderGeneration) set({ status: 'error', error: errorMessage(error) });
    }
  },

  async createOrder(input) {
    const generation = orderGeneration;
    set({ error: null });
    try {
      const order = await orderService.create(input);
      if (generation === orderGeneration) {
        set((state) => ({ orders: replaceOrder(state.orders, order), status: 'ready' }));
      }
      return order;
    } catch (error) {
      set({ status: 'error', error: errorMessage(error) });
      throw error;
    }
  },

  async updateOrderStatus(id, status) {
    const generation = orderGeneration;
    set({ error: null });
    try {
      const order = await orderService.updateStatus(id, status);
      if (order && generation === orderGeneration) {
        set((state) => ({ orders: replaceOrder(state.orders, order) }));
      }
      return order;
    } catch (error) {
      set({ error: errorMessage(error) });
      throw error;
    }
  },

  async cancelOrder(id, code) {
    const generation = orderGeneration;
    const result = await orderService.cancel(id, code);
    if (result.ok && generation === orderGeneration) {
      set((state) => ({ orders: replaceOrder(state.orders, result.order) }));
    }
    return result;
  },

  async confirmDelivery(id, code) {
    const generation = orderGeneration;
    const result = await orderService.confirmDelivery(id, code);
    if (result.ok && generation === orderGeneration) {
      set((state) => ({ orders: replaceOrder(state.orders, result.order) }));
    }
    return result;
  },

  getOrder(id) {
    return get().orders.find((order) => order.id === id || order.code === id);
  },

  reset() {
    orderGeneration += 1;
    set({ orders: [], status: 'idle', error: null });
  },
}));

export function selectActiveOrder(orders: Order[]): Order | undefined {
  return orders.find((order) => order.status !== 'delivered' && order.status !== 'cancelled');
}
