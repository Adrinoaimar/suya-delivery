import { create } from 'zustand';
import { orderService } from '@/lib/services';
import type { CodeResult, CreateOrderInput } from '@/lib/services';
import type { Order, OrderStatus } from '@/types';

type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';
const ORDER_PAGE_SIZE = 50;
let orderGeneration = 0;
let orderRefreshRequest = 0;

interface OrderState {
  orders: Order[];
  status: LoadStatus;
  error: string | null;
  hasMore: boolean;
  loadingMore: boolean;
  hydrate: () => Promise<void>;
  refresh: () => Promise<void>;
  loadMore: () => Promise<void>;
  createOrder: (input: CreateOrderInput) => Promise<Order>;
  updateOrderStatus: (id: string, status: OrderStatus) => Promise<Order | undefined>;
  cancelOrder: (id: string, code: string) => Promise<CodeResult>;
  confirmDelivery: (id: string, code: string) => Promise<CodeResult>;
  cancelByRider: (id: string, reason: string) => Promise<boolean>;
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
  hasMore: false,
  loadingMore: false,

  async hydrate() {
    if (get().status !== 'idle') return;
    await get().refresh();
  },

  async refresh() {
    const generation = orderGeneration;
    const requestId = ++orderRefreshRequest;
    set({ status: 'loading', error: null, hasMore: false, loadingMore: false });
    try {
      const orders = await orderService.list({ offset: 0, limit: ORDER_PAGE_SIZE });
      if (generation === orderGeneration && requestId === orderRefreshRequest) {
        set({ orders, status: 'ready', error: null, hasMore: orders.length === ORDER_PAGE_SIZE, loadingMore: false });
      }
    } catch (error) {
      if (generation === orderGeneration && requestId === orderRefreshRequest) {
        set({ status: 'error', error: errorMessage(error) });
      }
    }
  },

  async loadMore() {
    const state = get();
    if (!state.hasMore || state.loadingMore || state.status === 'loading') return;
    const generation = orderGeneration;
    const requestId = ++orderRefreshRequest;
    const offset = state.orders.length;
    set({ loadingMore: true, error: null });
    try {
      const nextPage = await orderService.list({ offset, limit: ORDER_PAGE_SIZE });
      if (generation !== orderGeneration || requestId !== orderRefreshRequest) return;
      const known = new Set(state.orders.map((order) => order.id));
      const appended = nextPage.filter((order) => !known.has(order.id));
      set((current) => ({
        orders: [...current.orders, ...appended],
        hasMore: nextPage.length === ORDER_PAGE_SIZE,
        loadingMore: false,
      }));
    } catch (error) {
      if (generation === orderGeneration && requestId === orderRefreshRequest) {
        set({ loadingMore: false, error: errorMessage(error) });
      }
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

  async cancelByRider(id, reason) {
    const generation = orderGeneration;
    const cancelled = await orderService.cancelByRider(id, reason);
    if (cancelled && generation === orderGeneration) await get().refresh();
    return cancelled;
  },

  getOrder(id) {
    return get().orders.find((order) => order.id === id || order.code === id);
  },

  reset() {
    orderGeneration += 1;
    orderRefreshRequest += 1;
    set({ orders: [], status: 'idle', error: null, hasMore: false, loadingMore: false });
  },
}));

export function selectActiveOrder(orders: Order[]): Order | undefined {
  return orders.find((order) => order.status !== 'delivered' && order.status !== 'cancelled');
}
