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
export { MockStoreService as storeService } from './MockStoreService';
export { MockOrderService as orderService } from './MockOrderService';
export { CashPaymentService as paymentService } from './CashPaymentService';
export { LocalNotificationService as notificationService } from './LocalNotificationService';
export { LocalLocationSharingService as locationSharingService } from './LocalLocationSharingService';
export { MapServiceLocal as mapService } from './MapServiceImpl';
export { BrowserLocationService, SimulatedLocationService } from './BrowserLocationService';
export * from './types';
