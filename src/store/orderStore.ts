import { create } from 'zustand';
import { orderService } from '@/lib/services';
import type { CodeResult, CreateOrderInput } from '@/lib/services';
import type { Order, OrderStatus } from '@/types';

type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

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
    set({ status: 'loading', error: null });
    try {
      const orders = await orderService.list();
      set({ orders, status: 'ready', error: null });
    } catch (error) {
      set({ status: 'error', error: errorMessage(error) });
    }
  },

  async createOrder(input) {
    set({ error: null });
    try {
      const order = await orderService.create(input);
      set((state) => ({ orders: replaceOrder(state.orders, order), status: 'ready' }));
      return order;
    } catch (error) {
      set({ status: 'error', error: errorMessage(error) });
      throw error;
    }
  },

  async updateOrderStatus(id, status) {
    set({ error: null });
    try {
      const order = await orderService.updateStatus(id, status);
      if (order) set((state) => ({ orders: replaceOrder(state.orders, order) }));
      return order;
    } catch (error) {
      set({ error: errorMessage(error) });
      throw error;
    }
  },

  async cancelOrder(id, code) {
    const result = await orderService.cancel(id, code);
    if (result.ok) set((state) => ({ orders: replaceOrder(state.orders, result.order) }));
    return result;
  },

  async confirmDelivery(id, code) {
    const result = await orderService.confirmDelivery(id, code);
    if (result.ok) set((state) => ({ orders: replaceOrder(state.orders, result.order) }));
    return result;
  },

  getOrder(id) {
    return get().orders.find((order) => order.id === id || order.code === id);
  },
}));

export function selectActiveOrder(orders: Order[]): Order | undefined {
  return orders.find((order) => order.status !== 'delivered' && order.status !== 'cancelled');
}
