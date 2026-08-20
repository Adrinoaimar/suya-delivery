/** Modelos de dominio compartidos por las aplicaciones de Suya Delivery. */

export type Accent = 'green' | 'lime' | 'sun';

export interface Category {
  id: string;
  name: string;
  icon: string;
  accent: Accent;
}

export interface Schedule {
  opens: string;
  closes: string;
}

export interface Store {
  id: string;
  name: string;
  categoryId: string;
  tags: string[];
  description: string;
  rating: number;
  reviews: number;
  etaMin: number;
  etaMax: number;
  deliveryFee: number;
  minOrder: number;
  distanceKm: number;
  isLocal: boolean;
  isFeatured: boolean;
  /** Control operativo del backend; si falta se conserva el cálculo por horario legado. */
  acceptingOrders?: boolean;
  /** Marca real: se muestra con tarjeta neutra, nunca con un logo recreado. */
  isRealBrand: boolean;
  /** Negocio incorporado en fase beta: carta y datos aún por confirmar con el comercio. */
  isBeta?: boolean;
  /** Nota mostrada en la ficha cuando los datos son referenciales. */
  dataNote?: string;
  /**
   * Paleta propia del negocio (hex), tomada de su marca oficial. Cuando existe, la ficha
   * del negocio se muestra con estos colores en lugar de la identidad verde de Suya; el
   * resto de la aplicación (carrito, checkout, navegación) conserva siempre la marca Suya.
   */
  theme?: {
    primary: string;
    accent: string;
    surface: string;
    onPrimary: string;
  };
  /** Fotos del local y de su cocina, mostradas como galería en la ficha. */
  gallery?: { src: string; caption: string }[];
  promoLabel: string | null;
  schedule: Schedule;
  address: string;
  phone: string;
  image: string | null;
  logo: string | null;
  sections: string[];
}

export interface ProductExtra {
  id: string;
  label: string;
  price: number;
}

export interface Product {
  id: string;
  storeId: string;
  section: string;
  name: string;
  description: string;
  price: number;
  image: string | null;
  popular: boolean;
  extras: ProductExtra[];
}

export interface Promotion {
  id: string;
  title: string;
  subtitle: string;
  code: string | null;
  storeId: string | null;
  accent: Accent;
  image: string | null;
}

export interface Vehicle {
  type: string;
  color: string;
  plate: string;
}

export interface Rider {
  id: string;
  name: string;
  photo: string | null;
  rating: number;
  deliveries: number;
  verified: boolean;
  phone: string;
  vehicle: Vehicle;
}

export interface CartItem {
  /** Identificador de línea: mismo producto con distintos extras son líneas distintas. */
  lineId: string;
  productId: string;
  storeId: string;
  name: string;
  unitPrice: number;
  quantity: number;
  extras: ProductExtra[];
  note: string;
  image: string | null;
}

export type OrderStatus =
  | 'confirmed'
  | 'preparing'
  | 'picked_up'
  | 'on_the_way'
  | 'delivered'
  | 'cancelled';

export const ORDER_FLOW: OrderStatus[] = [
  'confirmed',
  'preparing',
  'picked_up',
  'on_the_way',
  'delivered',
];

export type PaymentMethod = 'cash' | 'yape' | 'card';

export interface OrderStatusEvent {
  status: OrderStatus;
  at: string;
}

export interface CustomerInfo {
  name: string;
  phone: string;
  address: string;
  reference: string;
}

export interface Order {
  id: string;
  code: string;
  storeId: string;
  storeName: string;
  items: CartItem[];
  subtotal: number;
  deliveryFee: number;
  discount: number;
  total: number;
  createdAt: string;
  status: OrderStatus;
  history: OrderStatusEvent[];
  customer: CustomerInfo;
  /** Punto confirmado por cliente; nunca inferido con geocodificación pública. */
  deliveryPosition: LatLng | null;
  /** Ubicación registrada por negocio. */
  storePosition: LatLng | null;
  paymentMethod: PaymentMethod;
  riderId: string | null;
  etaMinutes: number;
  /** Código de 4 dígitos que el cliente entrega al repartidor para cerrar el pedido. */
  deliveryCode: string;
  /** Código de 4 dígitos que hay que escribir para cancelar el pedido. */
  cancelCode: string;
}

export interface LatLng {
  lat: number;
  lng: number;
}

export interface RoutePoint extends LatLng {
  label?: string;
}

export interface DemoRoute {
  city: string;
  center: LatLng;
  origin: RoutePoint;
  destination: RoutePoint;
  points: LatLng[];
}

export interface TrustedContact {
  name: string;
  phone: string;
  relation: string;
}

export type IncidentCategory =
  | 'accidente'
  | 'mecanico'
  | 'cliente'
  | 'zona-insegura'
  | 'robo'
  | 'otro';

export interface Incident {
  id: string;
  category: IncidentCategory;
  description: string;
  position: LatLng | null;
  createdAt: string;
}

export interface SosEvent {
  id: string;
  createdAt: string;
  position: LatLng | null;
  resolvedAt: string | null;
}
