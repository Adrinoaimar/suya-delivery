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
  PaymentIntent,
  Product,
  Store,
  IncidentCategory,
  AppOffer,
} from '@/types';

export interface StoreService {
  listCategories(): Promise<Category[]>;
  listStores(): Promise<Store[]>;
  getStore(id: string): Promise<Store | undefined>;
  getPublishedMenu(slug: string): Promise<PublishedMenu | undefined>;
  getMenuSettings(restaurantId: string): Promise<MenuSettings | undefined>;
  saveStoreLogo(restaurantId: string, logoUrl: string | null): Promise<void>;
  saveMenuSettings(settings: MenuSettings): Promise<MenuSettings>;
  uploadMenuImage(restaurantId: string, kind: 'logo' | 'hero', file: File): Promise<string>;
  listProducts(storeId: string): Promise<Product[]>;
  getProduct(id: string): Promise<Product | undefined>;
  search(query: string): Promise<{ stores: Store[]; products: Product[] }>;
}

export interface AnalyticsDailyMetric {
  visitDay: string;
  uniqueVisitors: number;
}

export interface AnalyticsEventMetric {
  eventDay: string;
  eventName: 'page_view' | 'link_click';
  eventKey: string;
  eventCount: number;
}

export interface AnalyticsService {
  listDaily(days?: number): Promise<AnalyticsDailyMetric[]>;
  listEvents(days?: number): Promise<AnalyticsEventMetric[]>;
}

export interface CreateAppOfferInput {
  restaurantId: string | null;
  title: string;
  description: string;
  code: string;
  discountType: 'percent' | 'fixed';
  discountValue: number;
  minimumSubtotal: number;
  startsAt: string;
  endsAt: string;
  maxRedemptions: number | null;
}

export interface OfferService {
  listActive(): Promise<AppOffer[]>;
  listManageable(): Promise<AppOffer[]>;
  create(input: CreateAppOfferInput): Promise<AppOffer>;
  setActive(id: string, active: boolean): Promise<boolean>;
}

export type RestaurantAccountStatus =
  'pending_contact' | 'ready_to_invite' | 'invited' | 'active' | 'suspended';

export interface RestaurantAccount {
  restaurantId: string;
  restaurantName: string;
  status: RestaurantAccountStatus;
  contactName: string;
  contactEmail: string;
  ownerUserId: string | null;
  invitedAt: string | null;
  activatedAt: string | null;
  notes: string;
  updatedAt: string;
}

export interface RestaurantAccountService {
  list(): Promise<RestaurantAccount[]>;
  saveContact(input: {
    restaurantId: string;
    contactName: string;
    contactEmail: string;
    notes: string;
  }): Promise<RestaurantAccount>;
  invite(restaurantId: string): Promise<RestaurantAccount>;
  activate(restaurantId: string): Promise<RestaurantAccount>;
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
  /** Código de oferta; el servidor valida vigencia, alcance y descuento final. */
  offerCode?: string;
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
  pay(
    sessionId: string,
    received: number,
    method: 'cash',
    requestId: string,
  ): Promise<TablePaymentResult>;
  list(restaurantIds: string[]): Promise<TableSummary[]>;
  create(restaurantId: string, tableNumber: string): Promise<TableSummary>;
  regenerateQr(tableId: string): Promise<TableSummary>;
  setActive(tableId: string, active: boolean): Promise<boolean>;
}

/** Observaciones de billeteras: nunca representan por sí solas un pago confirmado. */
export interface WalletObserverDevice {
  id: string;
  restaurantId: string;
  label: string;
  active: boolean;
  lastSeenAt: string | null;
}

export interface CreatedWalletObserverDevice extends WalletObserverDevice {
  /** Se entrega una sola vez al crear el dispositivo. */
  deviceToken: string;
}

export interface WalletObserverPairing {
  pairingId: string;
  pairingCode: string;
  expiresAt: string;
  restaurantId: string;
  receiverAccountId: string;
  deviceLabel: string;
}

export interface WalletObservationOrigin {
  packageName: string | null;
  appLabel: string | null;
  channelId: string | null;
  category: string | null;
  groupKey: string | null;
  tag: string | null;
  notificationId: number | null;
  flags: number | null;
  contentFingerprint: string | null;
  operationKind: string | null;
  notificationWhen: string | null;
}

export interface WalletObservation {
  id: string;
  restaurantId: string;
  deviceId: string | null;
  provider: string;
  senderName: string | null;
  codeLast4: string | null;
  amountCents: number;
  currency: string;
  observedAt: string;
  /** Hora en que el servidor recibió la observación; no es la hora bancaria. */
  receivedAt?: string | null;
  verification: string;
  origin: WalletObservationOrigin;
}

export interface WalletPaymentCandidate {
  paymentAttemptId: string;
  orderId: string;
  orderCode: string;
  customerName: string;
  checkoutReference: string;
  method: PaymentMethod;
  amount: number;
  createdAt: string;
  expiresAt: string;
  senderName: string | null;
}

export interface RestaurantPaymentAccount {
  id: string;
  restaurantId: string;
  provider: 'yape' | 'lemon';
  accountLabel: string;
  qrPayload: string | null;
  active: boolean;
}

export interface WalletObserverService {
  listDevices(restaurantIds: string[]): Promise<WalletObserverDevice[]>;
  createPairing(
    restaurantId: string,
    label: string,
    receiverAccountId: string,
  ): Promise<WalletObserverPairing>;
  createDevice(
    restaurantId: string,
    label: string,
    receiverAccountId?: string | null,
  ): Promise<CreatedWalletObserverDevice>;
  setDeviceActive(deviceId: string, active: boolean): Promise<boolean>;
  rotateDevice(deviceId: string): Promise<CreatedWalletObserverDevice>;
  listObservations(restaurantIds: string[]): Promise<WalletObservation[]>;
  listPaymentCandidates(observationId: string): Promise<WalletPaymentCandidate[]>;
  setObservationCode(observationId: string, code: string): Promise<boolean>;
  verifyObservation(observationId: string, paymentAttemptId: string): Promise<boolean>;
  verifyObservationByName(observationId: string, payerName: string): Promise<boolean>;
  listPaymentAccounts(restaurantId: string): Promise<RestaurantPaymentAccount[]>;
  savePaymentAccount(input: {
    restaurantId: string;
    provider: 'yape' | 'lemon';
    accountLabel: string;
    qrPayload: string | null;
    active: boolean;
  }): Promise<RestaurantPaymentAccount>;
}

export type ManagedRiderStatus = 'offline' | 'available' | 'busy' | 'suspended';

export interface RestaurantRider {
  id: string;
  email: string;
  name: string;
  phone: string;
  status: ManagedRiderStatus;
  verifiedAt: string | null;
  vehicleType: string;
  vehicleColor: string;
  vehiclePlate: string;
  rating: number;
  deliveries: number;
  active: boolean;
  createdAt: string;
}

export interface InviteRestaurantRiderInput {
  restaurantId: string;
  email: string;
  displayName: string;
  phone: string;
  vehicleType: string;
  vehicleColor: string;
  vehiclePlate: string;
}

export interface RestaurantRiderService {
  list(restaurantId: string): Promise<RestaurantRider[]>;
  invite(input: InviteRestaurantRiderInput): Promise<RestaurantRider>;
  setActive(restaurantId: string, riderId: string, active: boolean): Promise<boolean>;
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

export interface TablePaymentResult {
  sessionId: string;
  total: number;
  received: number;
  change: number;
}

export type CashRegisterStatus = 'open' | 'closed';

export interface CashRegisterSession {
  id: string;
  restaurantId: string;
  status: CashRegisterStatus;
  openingFloat: number;
  expectedCash: number;
  declaredCash: number | null;
  difference: number | null;
  openedAt: string;
  closedAt: string | null;
  entryCount: number;
}

export interface CashRegisterSale {
  entryId: string;
  sessionId: string;
  orderId: string;
  amount: number;
  received: number;
  change: number;
}

export interface CashRegisterAdjustment {
  entryId: string;
  sessionId: string;
  amount: number;
  note: string;
}

export interface CashRegisterService {
  list(restaurantIds: string[]): Promise<CashRegisterSession[]>;
  open(restaurantId: string, openingFloat: number, requestId: string): Promise<CashRegisterSession>;
  recordSale(
    sessionId: string,
    orderId: string,
    received: number,
    requestId: string,
  ): Promise<CashRegisterSale>;
  addAdjustment(
    sessionId: string,
    amount: number,
    note: string,
    requestId: string,
  ): Promise<CashRegisterAdjustment>;
  close(
    sessionId: string,
    declaredCash: number,
    note: string,
    requestId: string,
  ): Promise<CashRegisterSession>;
}

export type CodeFailure = 'not_found' | 'invalid_code' | 'already_closed' | 'invalid_status';

export interface OrderListOptions {
  /** Zero-based offset for the next page. */
  offset?: number;
  /** Requested page size; implementations cap this to a safe server-side maximum. */
  limit?: number;
}

export type CodeResult = { ok: true; order: Order } | { ok: false; reason: CodeFailure };

export const CODE_ERROR_MESSAGES: Record<CodeFailure, string> = {
  not_found: 'No encontramos este pedido.',
  invalid_code: 'El código no coincide. Revísalo con el cliente.',
  already_closed: 'Este pedido ya está cerrado.',
  invalid_status: 'Marca primero que vas en camino para poder cerrar la entrega.',
};

export interface OrderService {
  list(options?: OrderListOptions): Promise<Order[]>;
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
  locationHistory(orderId: string): Promise<LatLng[]>;
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
  getCurrent(): Promise<LocationReading>;
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

export interface PaymentDeclaration {
  declaredAt: string;
  payerDisplayName: string | null;
}

export type WalletPaymentConfirmationStatus = 'pending' | 'authorized' | 'ambiguous';

export interface WalletPaymentConfirmation {
  status: WalletPaymentConfirmationStatus;
  attemptId: string;
  observationId: string | null;
  observedAt: string | null;
  payerDisplayName: string | null;
}

export interface PaymentService {
  /** La confirmación final de pagos digitales siempre proviene del backend/webhook. */
  authorize(method: PaymentMethod, amount: number): Promise<PaymentResult>;
  createIntent(
    orderId: string,
    method: PaymentMethod,
    guestAccessToken?: string | null,
    customerEmail?: string | null,
  ): Promise<PaymentIntent>;
  submitEvidence(orderId: string, code: string, guestAccessToken?: string | null): Promise<boolean>;
  declarePayment(
    orderId: string,
    code?: string | null,
    payerDisplayName?: string | null,
    guestAccessToken?: string | null,
  ): Promise<boolean>;
  confirmWalletPayment(
    orderId: string,
    payerDisplayName: string,
    guestAccessToken?: string | null,
  ): Promise<WalletPaymentConfirmation>;
  confirmWalletPaymentByCode(
    orderId: string,
    confirmationCode: string,
    guestAccessToken?: string | null,
  ): Promise<WalletPaymentConfirmation>;
  getPaymentDeclaration(
    orderId: string,
    guestAccessToken?: string | null,
  ): Promise<PaymentDeclaration | null>;
  chargeCard(
    intent: PaymentIntent,
    tokenId: string,
    customerEmail?: string | null,
    guestAccessToken?: string | null,
  ): Promise<string>;
  getIntent(orderId: string, guestAccessToken?: string | null): Promise<PaymentIntent | null>;
}

export type NotificationLevel = 'info' | 'success' | 'warning' | 'danger';

export interface NotificationService {
  notify(message: string, level?: NotificationLevel): void;
  subscribe(listener: (message: string, level: NotificationLevel) => void): () => void;
}
