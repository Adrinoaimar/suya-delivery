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
import type { StoreService } from './types';

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
export { MockOrderService as orderService } from './MockOrderService';
export { CashPaymentService as paymentService } from './CashPaymentService';
export { LocalNotificationService as notificationService } from './LocalNotificationService';
export { LocalLocationSharingService as locationSharingService } from './LocalLocationSharingService';
export { MapServiceLocal as mapService } from './MapServiceImpl';
export { BrowserLocationService, SimulatedLocationService } from './BrowserLocationService';
export * from './types';
