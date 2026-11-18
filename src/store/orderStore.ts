import { create } from 'zustand';
import { orderService } from '@/lib/services';
import type { CodeResult, CreateOrderInput } from '@/lib/services';
import type { Order, OrderStatus, PaymentIntent } from '@/types';

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
  refresh: (options?: { background?: boolean }) => Promise<void>;
  refreshOrder: (id: string) => Promise<Order | undefined>;
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

function preservePaymentDetails(payment: Order['paymentIntent'], previous: Order['paymentIntent']) {
  if (!payment || !previous || payment.attemptId !== previous.attemptId) return payment;
  const merged = { ...previous, ...payment, qrPayload: payment.qrPayload ?? previous.qrPayload };
  const keys = Object.keys(merged) as (keyof PaymentIntent)[];
  return keys.every((key) => merged[key] === previous[key]) ? previous : merged;
}

// La consulta del listado no incluye códigos ni los datos reservados del intento de pago.
function preserveOrderDetails(orders: Order[], previous: Order[]): Order[] {
  const details = new Map(previous.map((order) => [order.id, order]));
  return orders.map((order) => {
    const prior = details.get(order.id);
    if (!prior) return order;
    return {
      ...order,
      deliveryCode: order.deliveryCode || prior.deliveryCode,
      cancelCode: order.cancelCode || prior.cancelCode,
      paymentIntent: preservePaymentDetails(order.paymentIntent, prior.paymentIntent),
    };
  });
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

  async refresh({ background = false } = {}) {
    if (background && get().loadingMore) return;
    const generation = orderGeneration;
    const requestId = ++orderRefreshRequest;
    const keepVisible = background && get().status === 'ready';
    if (!keepVisible) set({ status: 'loading', error: null, hasMore: false, loadingMore: false });
    try {
      const pageCount = keepVisible ? Math.max(1, Math.ceil(get().orders.length / ORDER_PAGE_SIZE)) : 1;
      const pages = await Promise.all(Array.from({ length: pageCount }, (_, index) =>
        orderService.list({ offset: index * ORDER_PAGE_SIZE, limit: ORDER_PAGE_SIZE }),
      ));
      if (generation === orderGeneration && requestId === orderRefreshRequest) {
        const latest = [...new Map(pages.flat().map((order) => [order.id, order])).values()];
        set((state) => ({
          orders: keepVisible ? preserveOrderDetails(latest, state.orders) : latest,
          status: 'ready',
          error: null,
          hasMore: pages.at(-1)?.length === ORDER_PAGE_SIZE,
          loadingMore: false,
        }));
      }
    } catch (error) {
      if (generation === orderGeneration && requestId === orderRefreshRequest && !keepVisible) {
        set({ status: 'error', error: errorMessage(error) });
      }
    }
  },

  async refreshOrder(id) {
    const generation = orderGeneration;
    try {
      const updated = await orderService.get(id);
      if (!updated || generation !== orderGeneration) return updated;
      set((state) => ({
        orders: replaceOrder(state.orders, updated),
        status: 'ready',
        error: null,
      }));
      return updated;
    } catch (error) {
      if (generation === orderGeneration) set({ error: errorMessage(error) });
      return undefined;
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
