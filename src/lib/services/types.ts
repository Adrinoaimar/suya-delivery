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
  SharedLocationSnapshot,
  SharingStatus,
  Store,
  IncidentCategory,
} from '@/types';

export interface StoreService {
  listCategories(): Promise<Category[]>;
  listStores(): Promise<Store[]>;
  getStore(id: string): Promise<Store | undefined>;
  listProducts(storeId: string): Promise<Product[]>;
  getProduct(id: string): Promise<Product | undefined>;
  search(query: string): Promise<{ stores: Store[]; products: Product[] }>;
}

export interface CreateOrderInput {
  storeId: string;
  items: CartItem[];
  subtotal: number;
  deliveryFee: number;
  discount: number;
  customer: CustomerInfo;
  deliveryPosition: LatLng;
  paymentMethod: PaymentMethod;
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
  updateStatus(id: string, status: OrderStatus): Promise<Order | undefined>;
  /** Requiere el código de cancelación del pedido. */
  cancel(id: string, code: string): Promise<CodeResult>;
  /** Requiere el código de entrega que el cliente le da al repartidor. */
  confirmDelivery(id: string, code: string): Promise<CodeResult>;
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

export interface LocationSharingService {
  start(payload: { token: string; riderName: string; simulated: boolean }): Promise<void>;
  stop(): Promise<void>;
  /** Cambia el token del enlace activo e invalida el anterior. */
  rotateToken(token: string): Promise<void>;
  publish(snapshot: Partial<SharedLocationSnapshot>): void;
  getStatus(): SharingStatus;
  getSnapshot(): SharedLocationSnapshot | null;
  subscribe(listener: (snapshot: SharedLocationSnapshot | null) => void): () => void;
}

export interface MapAdapterInfo {
  id: 'mock' | 'leaflet' | 'google';
  label: string;
  requiresApiKey: boolean;
  available: boolean;
}

export interface MapService {
  listAdapters(): MapAdapterInfo[];
  getActiveAdapterId(): MapAdapterInfo['id'];
}
