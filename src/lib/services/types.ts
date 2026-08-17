/**
 * Contratos de servicio de Suya Delivery.
 *
 * La aplicación nunca importa una implementación concreta: siempre consume estas interfaces
 * desde `src/lib/services/index.ts`. Así, migrar a un backend real es sustituir la
 * implementación registrada, sin tocar la interfaz de usuario.
 */
import type {
  CartItem,
  CustomerInfo,
  LatLng,
  Order,
  OrderStatus,
  PaymentMethod,
  Product,
  SharedLocationSnapshot,
  SharingStatus,
  Store,
} from '@/types';

export interface StoreService {
  listStores(): Store[];
  getStore(id: string): Store | undefined;
  listProducts(storeId: string): Product[];
  getProduct(id: string): Product | undefined;
  search(query: string): { stores: Store[]; products: Product[] };
}

export interface CreateOrderInput {
  storeId: string;
  items: CartItem[];
  subtotal: number;
  deliveryFee: number;
  discount: number;
  customer: CustomerInfo;
  paymentMethod: PaymentMethod;
}

export interface OrderService {
  list(): Order[];
  get(id: string): Order | undefined;
  create(input: CreateOrderInput): Order;
  updateStatus(id: string, status: OrderStatus): Order | undefined;
  cancel(id: string): Order | undefined;
  restartSimulation(id: string): Order | undefined;
  save(orders: Order[]): void;
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
  /** Simulación local: NO procesa cobros reales bajo ninguna circunstancia. */
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
