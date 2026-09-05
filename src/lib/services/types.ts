/**
 * Contratos de servicio de Suya Delivery.
 *
 * La aplicación nunca importa una implementación concreta: siempre consume estas interfaces
 * desde `src/lib/services/index.ts`. Así, migrar a un backend real es sustituir la
 * implementación registrada, sin tocar la interfaz de usuario.
 */
import type {
  CartItem,
  Category,
  CustomerInfo,
  LatLng,
  Order,
  OrderStatus,
  PaymentMethod,
  Product,
  Store,
  IncidentCategory,
} from '@/types';

export interface StoreService {
  listCategories(): Promise<Category[]>;
  listStores(): Promise<Store[]>;
  getStore(id: string): Promise<Store | undefined>;
  getPublishedMenu(slug: string): Promise<PublishedMenu | undefined>;
  getMenuSettings(restaurantId: string): Promise<MenuSettings | undefined>;
  saveMenuSettings(settings: MenuSettings): Promise<MenuSettings>;
  uploadMenuImage(restaurantId: string, kind: 'logo' | 'hero', file: File): Promise<string>;
  listProducts(storeId: string): Promise<Product[]>;
  getProduct(id: string): Promise<Product | undefined>;
  search(query: string): Promise<{ stores: Store[]; products: Product[] }>;
}

export interface MenuSettings {
  restaurantId: string;
  slug: string;
  published: boolean;
  logoUrl: string | null;
  heroImageUrl: string | null;
  primaryColor: string;
  accentColor: string;
  fontFamily: string;
}

export interface PublishedMenu {
  store: Store;
  slug: string;
  brand: {
    logoUrl: string | null;
    heroImageUrl: string | null;
    primaryColor: string;
    accentColor: string;
    fontFamily: string;
  };
}

export interface CreateOrderInput {
  storeId: string;
  items: CartItem[];
  subtotal: number;
  deliveryFee: number;
  discount: number;
  customer: CustomerInfo;
  /** Null for table QR orders: table context replaces a delivery coordinate. */
  deliveryPosition: LatLng | null;
  paymentMethod: PaymentMethod;
  /** Contexto opcional de un pedido iniciado desde QR de mesa. */
  tableId?: string;
  tableSessionId?: string;
  origin?: 'delivery' | 'suya_menu' | 'table_qr';
}

export interface TableQrResolution {
  tableId: string;
  restaurantId: string;
  tableNumber: string;
  restaurantName: string;
  sessionId: string | null;
}

export interface TableService {
  resolve(token: string): Promise<TableQrResolution | null>;
  /** Opens/reuses table session after server validates public QR token. */
  openGuest(token: string): Promise<string>;
  open(tableId: string): Promise<string>;
  list(restaurantIds: string[]): Promise<TableSummary[]>;
  create(restaurantId: string, tableNumber: string): Promise<TableSummary>;
  regenerateQr(tableId: string): Promise<TableSummary>;
  setActive(tableId: string, active: boolean): Promise<boolean>;
}

export interface TableSummary {
  id: string;
  restaurantId: string;
  tableNumber: string;
  status: 'available' | 'occupied' | 'awaiting_payment' | 'paid';
  sessionId: string | null;
  sessionStatus: 'open' | 'payment_pending' | 'paid' | 'closed' | null;
  total: number;
  qrToken: string;
  active: boolean;
}

export type CodeFailure = 'not_found' | 'invalid_code' | 'already_closed' | 'invalid_status';

export type CodeResult = { ok: true; order: Order } | { ok: false; reason: CodeFailure };

export const CODE_ERROR_MESSAGES: Record<CodeFailure, string> = {
  not_found: 'No encontramos este pedido.',
  invalid_code: 'El código no coincide. Revísalo con el cliente.',
  already_closed: 'Este pedido ya está cerrado.',
  invalid_status: 'Marca primero que vas en camino para poder cerrar la entrega.',
};

export interface OrderService {
  list(): Promise<Order[]>;
  get(id: string): Promise<Order | undefined>;
  create(input: CreateOrderInput): Promise<Order>;
  createMenuOrder(input: CreateOrderInput): Promise<Order>;
  updateStatus(id: string, status: OrderStatus): Promise<Order | undefined>;
  /** Requiere el código de cancelación del pedido. */
  cancel(id: string, code: string): Promise<CodeResult>;
  /** Requiere el código de entrega que el cliente le da al repartidor. */
  confirmDelivery(id: string, code: string): Promise<CodeResult>;
  cancelByRider(id: string, reason: string): Promise<boolean>;
  subscribe(listener: () => void): () => void;
}

export interface AvailableRider {
  id: string;
  name: string;
  phone: string;
  vehicleType: string;
  vehicleColor: string;
  vehiclePlate: string;
  rating: number;
  deliveries: number;
}

export interface DispatchService {
  listAvailableRiders(restaurantId: string): Promise<AvailableRider[]>;
  assignRider(orderId: string, riderId: string | null): Promise<boolean>;
  cancelOrder(orderId: string, reason: string): Promise<boolean>;
}

export interface RiderOperationsService {
  getAvailability(): Promise<'available' | 'offline' | 'busy'>;
  setAvailability(available: boolean): Promise<'available' | 'offline'>;
}

export interface SafetyOperationsService {
  publishLocation(orderId: string, reading: LocationReading): Promise<boolean>;
  reportIncident(input: {
    requestId: string;
    orderId: string | null;
    category: IncidentCategory;
    description: string;
    position: LatLng | null;
    sos: boolean;
  }): Promise<string>;
  resolveSos(incidentId: string): Promise<boolean>;
  latestLocation(orderId: string): Promise<LatLng | null>;
  subscribeLocation(orderId: string, listener: (position: LatLng) => void): () => void;
}

export type LocationPermission = 'unknown' | 'granted' | 'denied' | 'unsupported';

export interface LocationReading {
  position: LatLng;
  accuracy: number;
  timestamp: number;
  simulated: boolean;
}

export interface LocationService {
  isSupported(): boolean;
  getPermission(): Promise<LocationPermission>;
  watch(
    onReading: (reading: LocationReading) => void,
    onError: (message: string) => void,
  ): () => void;
}

export interface PaymentResult {
  ok: boolean;
  reference: string;
  message: string;
}

export interface PaymentService {
  /** La confirmación final de pagos digitales siempre proviene del backend/webhook. */
  authorize(method: PaymentMethod, amount: number): Promise<PaymentResult>;
}

export type NotificationLevel = 'info' | 'success' | 'warning' | 'danger';

export interface NotificationService {
  notify(message: string, level?: NotificationLevel): void;
  subscribe(listener: (message: string, level: NotificationLevel) => void): () => void;
}
