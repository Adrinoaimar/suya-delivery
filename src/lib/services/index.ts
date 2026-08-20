/**
 * Contenedor de servicios de Suya Delivery.
 *
 * Toda la aplicación consume los servicios desde aquí. Para migrar a un backend real basta
 * con cambiar la implementación registrada en este archivo:
 *
 *   MockOrderService              → HttpOrderService
 *   MockStoreService              → HttpStoreService
 *   MockPaymentService            → GatewayPaymentService
 *   LocalNotificationService      → PushNotificationService
 *   LocalLocationSharingService   → RealtimeLocationSharingService
 */
import { SupabaseStoreServiceImpl } from './SupabaseStoreService';
import { SupabaseOrderServiceImpl } from './SupabaseOrderService';
import { SupabaseSafetyServiceImpl } from './SupabaseSafetyService';
import type {
  DispatchService,
  OrderService,
  RiderOperationsService,
  SafetyOperationsService,
  StoreService,
} from './types';

let resolvedStoreService: Promise<StoreService> | null = null;

function resolveStoreService(): Promise<StoreService> {
  if (resolvedStoreService) return resolvedStoreService;
  resolvedStoreService = import.meta.env.VITE_BACKEND === 'supabase'
    ? Promise.resolve(new SupabaseStoreServiceImpl())
    : import('./MockStoreService').then(({ MockStoreService }) => MockStoreService);
  return resolvedStoreService;
}

/** Router asíncrono: el mock solo se carga en desarrollo/pruebas y no cruza al bundle Supabase. */
export const storeService: StoreService = {
  async listCategories() {
    return (await resolveStoreService()).listCategories();
  },
  async listStores() {
    return (await resolveStoreService()).listStores();
  },
  async getStore(id) {
    return (await resolveStoreService()).getStore(id);
  },
  async listProducts(storeId) {
    return (await resolveStoreService()).listProducts(storeId);
  },
  async getProduct(id) {
    return (await resolveStoreService()).getProduct(id);
  },
  async search(query) {
    return (await resolveStoreService()).search(query);
  },
};

type OperationalOrderService = OrderService & Partial<DispatchService & RiderOperationsService>;
let resolvedOrderService: Promise<OperationalOrderService> | null = null;

function resolveOrderService(): Promise<OperationalOrderService> {
  if (resolvedOrderService) return resolvedOrderService;
  resolvedOrderService = import.meta.env.VITE_BACKEND === 'supabase'
    ? Promise.resolve(new SupabaseOrderServiceImpl())
    : import('./MockOrderService').then(({ MockOrderService }) => MockOrderService);
  return resolvedOrderService;
}

/** Router asíncrono: pedidos demo nunca entran al bundle Supabase. */
export const orderService: OrderService = {
  async list() { return (await resolveOrderService()).list(); },
  async get(id) { return (await resolveOrderService()).get(id); },
  async create(input) { return (await resolveOrderService()).create(input); },
  async updateStatus(id, status) { return (await resolveOrderService()).updateStatus(id, status); },
  async cancel(id, code) { return (await resolveOrderService()).cancel(id, code); },
  async confirmDelivery(id, code) {
    return (await resolveOrderService()).confirmDelivery(id, code);
  },
  subscribe(listener) {
    let unsubscribe: () => void = () => undefined;
    let cancelled = false;
    void resolveOrderService().then((service) => {
      if (cancelled) return;
      unsubscribe = service.subscribe(listener);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  },
};

async function requireDispatch(): Promise<OperationalOrderService & DispatchService> {
  const service = await resolveOrderService();
  if (!service.listAvailableRiders || !service.assignRider || !service.cancelOrder) {
    throw new Error('Las operaciones de despacho requieren Supabase.');
  }
  return service as OperationalOrderService & DispatchService;
}

export const dispatchService: DispatchService = {
  async listAvailableRiders(restaurantId) {
    return (await requireDispatch()).listAvailableRiders(restaurantId);
  },
  async assignRider(orderId, riderId) {
    return (await requireDispatch()).assignRider(orderId, riderId);
  },
  async cancelOrder(orderId, reason) {
    return (await requireDispatch()).cancelOrder(orderId, reason);
  },
};

export const riderOperationsService: RiderOperationsService = {
  async getAvailability() {
    const service = await resolveOrderService();
    if (!service.getAvailability) throw new Error('La disponibilidad real requiere Supabase.');
    return service.getAvailability();
  },
  async setAvailability(available) {
    const service = await resolveOrderService();
    if (!service.setAvailability) throw new Error('La disponibilidad real requiere Supabase.');
    return service.setAvailability(available);
  },
};
let resolvedSafetyService: Promise<SafetyOperationsService> | null = null;
function resolveSafetyService(): Promise<SafetyOperationsService> {
  if (resolvedSafetyService) return resolvedSafetyService;
  resolvedSafetyService = import.meta.env.VITE_BACKEND === 'supabase'
    ? Promise.resolve(new SupabaseSafetyServiceImpl())
    : Promise.reject(new Error('Seguridad operativa real requiere Supabase.'));
  return resolvedSafetyService;
}
export const safetyOperationsService: SafetyOperationsService = {
  async publishLocation(orderId, reading) {
    return (await resolveSafetyService()).publishLocation(orderId, reading);
  },
  async reportIncident(input) {
    return (await resolveSafetyService()).reportIncident(input);
  },
  async resolveSos(incidentId) {
    return (await resolveSafetyService()).resolveSos(incidentId);
  },
  async latestLocation(orderId) {
    return (await resolveSafetyService()).latestLocation(orderId);
  },
  subscribeLocation(orderId, listener) {
    let unsubscribe: () => void = () => undefined;
    let cancelled = false;
    void resolveSafetyService().then((service) => {
      if (!cancelled) unsubscribe = service.subscribeLocation(orderId, listener);
    }).catch(() => undefined);
    return () => { cancelled = true; unsubscribe(); };
  },
};
export { CashPaymentService as paymentService } from './CashPaymentService';
export { LocalNotificationService as notificationService } from './LocalNotificationService';
export { LocalLocationSharingService as locationSharingService } from './LocalLocationSharingService';
export { MapServiceLocal as mapService } from './MapServiceImpl';
export { BrowserLocationService, SimulatedLocationService } from './BrowserLocationService';
export * from './types';
