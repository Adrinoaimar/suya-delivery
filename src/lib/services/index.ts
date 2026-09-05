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
 */
import { SupabaseStoreServiceImpl } from './SupabaseStoreService';
import { SupabaseOrderServiceImpl } from './SupabaseOrderService';
import { SupabaseSafetyServiceImpl } from './SupabaseSafetyService';
import { SupabaseTableService } from './SupabaseTableService';
import type {
  DispatchService,
  OrderService,
  RiderOperationsService,
  SafetyOperationsService,
  StoreService,
  TableService,
} from './types';

let resolvedTableService: Promise<TableService> | null = null;
function resolveTableService(): Promise<TableService> {
  if (resolvedTableService) return resolvedTableService;
  resolvedTableService = import.meta.env.VITE_BACKEND === 'supabase'
    ? Promise.resolve(new SupabaseTableService())
      : Promise.resolve({
        async resolve() { return null; },
        async open() { throw new Error('Las mesas QR requieren Supabase.'); },
        async list() { return []; },
        async create() { throw new Error('Las mesas QR requieren Supabase.'); },
        async regenerateQr() { throw new Error('Las mesas QR requieren Supabase.'); },
        async setActive() { throw new Error('Las mesas QR requieren Supabase.'); },
      });
  return resolvedTableService;
}

export const tableService: TableService = {
  async resolve(token) { return (await resolveTableService()).resolve(token); },
  async open(tableId) { return (await resolveTableService()).open(tableId); },
  async list(restaurantIds) { return (await resolveTableService()).list(restaurantIds); },
  async create(restaurantId, tableNumber) { return (await resolveTableService()).create(restaurantId, tableNumber); },
  async regenerateQr(tableId) { return (await resolveTableService()).regenerateQr(tableId); },
  async setActive(tableId, active) { return (await resolveTableService()).setActive(tableId, active); },
};

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
  async getPublishedMenu(slug) {
    return (await resolveStoreService()).getPublishedMenu(slug);
  },
  async getMenuSettings(restaurantId) {
    return (await resolveStoreService()).getMenuSettings(restaurantId);
  },
  async saveMenuSettings(settings) {
    return (await resolveStoreService()).saveMenuSettings(settings);
  },
  async uploadMenuImage(restaurantId, kind, file) {
    return (await resolveStoreService()).uploadMenuImage(restaurantId, kind, file);
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
  async createMenuOrder(input) { return (await resolveOrderService()).createMenuOrder(input); },
  async updateStatus(id, status) { return (await resolveOrderService()).updateStatus(id, status); },
  async cancel(id, code) { return (await resolveOrderService()).cancel(id, code); },
  async confirmDelivery(id, code) {
    return (await resolveOrderService()).confirmDelivery(id, code);
  },
  async cancelByRider(id, reason) {
    return (await resolveOrderService()).cancelByRider(id, reason);
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
export { BrowserLocationService } from './BrowserLocationService';
export * from './types';
