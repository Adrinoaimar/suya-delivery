import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/client';
import type { CartItem, Order, OrderStatus, ProductExtra } from '@/types';
import type {
  AvailableRider,
  CodeResult,
  CreateOrderInput,
  DispatchService,
  OrderService,
  RiderOperationsService,
} from './types';

interface OrderItemRow {
  id: string;
  product_id: string | null;
  product_name: string;
  unit_price: number | string;
  quantity: number;
  extras: unknown;
  note: string;
  image_url: string | null;
}

interface OrderEventRow {
  status: OrderStatus;
  created_at: string;
}

interface OrderRow {
  id: string;
  code: string;
  customer_id: string | null;
  restaurant_id: string;
  rider_id: string | null;
  status: OrderStatus;
  origin?: 'delivery' | 'menu' | 'table_qr';
  table_id?: string | null;
  payment_method: Order['paymentMethod'];
  cancellation_reason: string | null;
  subtotal: number | string;
  delivery_fee: number | string;
  discount: number | string;
  total: number | string;
  customer_name: string;
  customer_phone: string;
  delivery_address: string;
  delivery_reference: string;
  delivery_latitude: number | null;
  delivery_longitude: number | null;
  estimated_minutes: number;
  created_at: string;
  restaurants: { name: string; latitude: number | null; longitude: number | null } |
    { name: string; latitude: number | null; longitude: number | null }[];
  order_items: OrderItemRow[];
  order_events: OrderEventRow[];
}

interface OrderCodes {
  delivery_code: string;
  cancel_code: string;
}

interface GuestOrderItemRow {
  id: string;
  product_id: string | null;
  product_name: string;
  unit_price: number | string;
  quantity: number;
  extras: unknown;
  note: string;
  image_url: string | null;
}

interface GuestOrderRow {
  order_id: string;
  code: string;
  restaurant_id: string;
  origin: 'menu' | 'table_qr';
  status: OrderStatus;
  table_id: string | null;
  customer_name: string;
  customer_phone: string;
  delivery_address: string;
  delivery_reference: string;
  subtotal: number | string;
  delivery_fee: number | string;
  discount: number | string;
  total: number | string;
  estimated_minutes: number;
  created_at: string;
  cancellation_reason: string | null;
  delivery_code: string;
  cancel_code: string;
  items: GuestOrderItemRow[];
  events: { status: OrderStatus; created_at: string }[];
}

const ORDER_SELECT = `
  id, code, customer_id, restaurant_id, rider_id, status, origin, table_id, payment_method, cancellation_reason,
  subtotal, delivery_fee, discount, total, customer_name, customer_phone,
  delivery_address, delivery_reference, estimated_minutes, created_at,
  delivery_latitude, delivery_longitude,
  restaurants!inner(name, latitude, longitude),
  order_items(id, product_id, product_name, unit_price, quantity, extras, note, image_url),
  order_events(status, created_at)
`;
const PENDING_REQUEST_KEY = 'suya.pending-cash-order';
const GUEST_TOKEN_PREFIX = 'suya.guest-order-token:';

function isMissingSession(error: { message?: string } | null | undefined): boolean {
  return Boolean(error?.message && /auth session missing|session not found|jwt/i.test(error.message));
}

function saveGuestToken(orderId: string, token: string | null | undefined): void {
  if (!token) return;
  try { sessionStorage.setItem(`${GUEST_TOKEN_PREFIX}${orderId}`, token); } catch { /* storage unavailable */ }
}

function guestToken(orderId: string): string | null {
  try { return sessionStorage.getItem(`${GUEST_TOKEN_PREFIX}${orderId}`); } catch { return null; }
}

function requireClient(): SupabaseClient {
  if (!supabase) throw new Error('Supabase no está configurado para Suya Delivery.');
  return supabase;
}

function amount(value: number | string): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) throw new Error('Supabase devolvió un monto de pedido inválido.');
  return parsed;
}

function extras(value: unknown): ProductExtra[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [];
    const row = entry as Record<string, unknown>;
    if (typeof row.id !== 'string' || typeof row.label !== 'string') return [];
    if (typeof row.price !== 'number' && typeof row.price !== 'string') return [];
    const price = amount(row.price);
    return price >= 0 ? [{ id: row.id, label: row.label, price }] : [];
  });
}

function restaurantName(row: OrderRow): string {
  const restaurant = Array.isArray(row.restaurants) ? row.restaurants[0] : row.restaurants;
  return restaurant?.name ?? 'Negocio';
}

function coordinate(lat: number | null, lng: number | null) {
  return lat === null || lng === null ? null : { lat, lng };
}

function mapOrder(row: OrderRow, codes?: OrderCodes): Order {
  const items: CartItem[] = (row.order_items ?? []).map((item) => ({
    lineId: item.id,
    productId: item.product_id ?? item.id,
    storeId: row.restaurant_id,
    name: item.product_name,
    unitPrice: amount(item.unit_price),
    quantity: item.quantity,
    extras: extras(item.extras),
    note: item.note,
    image: item.image_url,
  }));
  const history = [...(row.order_events ?? [])]
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((event) => ({ status: event.status, at: event.created_at }));
  if (history.length === 0) history.push({ status: row.status, at: row.created_at });

  return {
    id: row.id,
    code: row.code,
    storeId: row.restaurant_id,
    storeName: restaurantName(row),
    items,
    subtotal: amount(row.subtotal),
    deliveryFee: amount(row.delivery_fee),
    discount: amount(row.discount),
    total: amount(row.total),
    createdAt: row.created_at,
    status: row.status,
    origin: row.origin === 'menu' ? 'suya_menu' : row.origin === 'table_qr' ? 'table_qr' : 'delivery',
    tableId: row.table_id ?? null,
    history,
    customer: {
      name: row.customer_name,
      phone: row.customer_phone,
      address: row.delivery_address,
      reference: row.delivery_reference,
    },
    deliveryPosition: coordinate(row.delivery_latitude, row.delivery_longitude),
    storePosition: (() => {
      const restaurant = Array.isArray(row.restaurants) ? row.restaurants[0] : row.restaurants;
      return coordinate(restaurant?.latitude ?? null, restaurant?.longitude ?? null);
    })(),
    paymentMethod: row.payment_method,
    riderId: row.rider_id,
    etaMinutes: row.estimated_minutes,
    deliveryCode: codes?.delivery_code ?? '',
    cancelCode: codes?.cancel_code ?? '',
    cancellationReason: row.cancellation_reason,
  };
}

function mapGuestOrder(row: GuestOrderRow): Order {
  const items: CartItem[] = (row.items ?? []).map((item) => ({
    lineId: item.id,
    productId: item.product_id ?? item.id,
    storeId: row.restaurant_id,
    name: item.product_name,
    unitPrice: amount(item.unit_price),
    quantity: item.quantity,
    extras: extras(item.extras),
    note: item.note,
    image: item.image_url,
  }));
  const history = [...(row.events ?? [])]
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((event) => ({ status: event.status, at: event.created_at }));
  if (history.length === 0) history.push({ status: row.status, at: row.created_at });
  return {
    id: row.order_id,
    code: row.code,
    storeId: row.restaurant_id,
    storeName: 'Suya Menús',
    items,
    subtotal: amount(row.subtotal),
    deliveryFee: amount(row.delivery_fee),
    discount: amount(row.discount),
    total: amount(row.total),
    createdAt: row.created_at,
    status: row.status,
    origin: row.origin === 'table_qr' ? 'table_qr' : 'suya_menu',
    tableId: row.table_id,
    history,
    customer: {
      name: row.customer_name,
      phone: row.customer_phone,
      address: row.delivery_address,
      reference: row.delivery_reference,
    },
    deliveryPosition: null,
    storePosition: null,
    paymentMethod: 'cash',
    riderId: null,
    etaMinutes: row.estimated_minutes,
    deliveryCode: row.delivery_code,
    cancelCode: row.cancel_code,
    cancellationReason: row.cancellation_reason,
  };
}

function first<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function fingerprint(input: CreateOrderInput): string {
  return JSON.stringify({
    storeId: input.storeId,
    phone: input.customer.phone.trim(),
    address: input.customer.address.trim(),
    reference: input.customer.reference.trim(),
    deliveryPosition: input.deliveryPosition,
    items: input.items.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
      extraIds: item.extras.map((extra) => extra.id).sort(),
      note: item.note.trim(),
    })),
  });
}

function requestIdFor(input: CreateOrderInput): string {
  const signature = fingerprint(input);
  try {
    const saved = JSON.parse(sessionStorage.getItem(PENDING_REQUEST_KEY) ?? 'null') as {
      signature?: string;
      requestId?: string;
    } | null;
    if (saved?.signature === signature && typeof saved.requestId === 'string') {
      return saved.requestId;
    }
  } catch {
    // Entrada dañada: se reemplaza con una solicitud nueva.
  }
  const requestId = crypto.randomUUID();
  sessionStorage.setItem(PENDING_REQUEST_KEY, JSON.stringify({ signature, requestId }));
  return requestId;
}

function clearRequest(requestId: string): void {
  try {
    const saved = JSON.parse(sessionStorage.getItem(PENDING_REQUEST_KEY) ?? 'null') as {
      requestId?: string;
    } | null;
    if (saved?.requestId === requestId) sessionStorage.removeItem(PENDING_REQUEST_KEY);
  } catch {
    sessionStorage.removeItem(PENDING_REQUEST_KEY);
  }
}

export class SupabaseOrderServiceImpl
  implements OrderService, DispatchService, RiderOperationsService {
  private readonly client: SupabaseClient;

  constructor(client: SupabaseClient = requireClient()) {
    this.client = client;
  }

  private async codes(orderId: string): Promise<OrderCodes | undefined> {
    const { data, error } = await this.client.rpc('get_order_codes', { target_order: orderId });
    if (error) throw new Error(error.message);
    return (first(data as OrderCodes[] | OrderCodes | null) ?? undefined);
  }

  private async row(id: string): Promise<OrderRow | undefined> {
    let query = this.client.from('orders').select(ORDER_SELECT);
    query = /^[0-9a-f-]{36}$/i.test(id) ? query.eq('id', id) : query.eq('code', id.toUpperCase());
    const { data, error } = await query.maybeSingle();
    if (error) throw new Error(error.message);
    return (data as unknown as OrderRow | null) ?? undefined;
  }

  private async guestRow(id: string, token: string): Promise<GuestOrderRow | undefined> {
    if (!token) return undefined;
    const { data, error } = await this.client.rpc('get_guest_order', {
      p_order_id: id,
      p_access_token: token,
    });
    if (error) throw new Error(error.message);
    const row = first(data as GuestOrderRow[] | GuestOrderRow | null);
    return row ?? undefined;
  }

  async list(): Promise<Order[]> {
    const [{ data: userData, error: userError }, { data, error }] = await Promise.all([
      this.client.auth.getUser(),
      this.client.from('orders').select(ORDER_SELECT).order('created_at', { ascending: false }),
    ]);
    if (userError && !isMissingSession(userError)) throw new Error(userError.message);
    if (error) throw new Error(error.message);
    const userId = userData.user?.id;
    const rows = (data ?? []) as unknown as OrderRow[];
    return Promise.all(rows.map(async (row) =>
      mapOrder(row, userId === row.customer_id ? await this.codes(row.id) : undefined),
    ));
  }

  async get(id: string): Promise<Order | undefined> {
    const { data: userData, error: userError } = await this.client.auth.getUser();
    if (userError && !isMissingSession(userError)) throw new Error(userError.message);
    const row = await this.row(id);
    if (!row) {
      const guest = await this.guestRow(id, guestToken(id) ?? '');
      return guest ? mapGuestOrder(guest) : undefined;
    }
    const codes = userData.user?.id === row.customer_id ? await this.codes(row.id) : undefined;
    return mapOrder(row, codes);
  }

  async create(input: CreateOrderInput): Promise<Order> {
    if (input.paymentMethod !== 'cash') {
      throw new Error('Solo el pago en efectivo está habilitado actualmente.');
    }
    const { data: userData, error: userError } = await this.client.auth.getUser();
    if (userError && !isMissingSession(userError)) throw new Error(userError.message);
    const user = userData.user ?? null;
    const publicMenuChannel = input.origin === 'suya_menu' || Boolean(input.tableId);
    if (!user && !publicMenuChannel) throw new Error('Inicia sesión para confirmar el pedido.');
    if (user) {
      const { error: profileError } = await this.client
        .from('profiles')
        .update({
          display_name: input.customer.name.trim(),
          phone: input.customer.phone.trim(),
          default_address: input.customer.address.trim(),
          default_reference: input.customer.reference.trim(),
        })
        .eq('id', user.id);
      if (profileError) throw new Error(profileError.message);
    }

    const requestId = requestIdFor(input);
    const rpcName = input.tableId
      ? 'create_table_cash_order_with_customer'
      : input.origin === 'suya_menu'
        ? 'create_menu_order_with_customer'
        : 'create_cash_order';
    const rpcPayload: Record<string, unknown> = {
      p_restaurant_id: input.storeId,
      p_items: input.items.map((item) => ({
        product_id: item.productId,
        quantity: item.quantity,
        extra_ids: item.extras.map((extra) => extra.id),
        note: item.note,
      })),
      p_customer_phone: input.customer.phone,
      p_delivery_address: input.customer.address,
      p_delivery_reference: input.customer.reference,
      p_request_id: requestId,
      ...(publicMenuChannel ? { p_customer_name: input.customer.name } : {}),
      ...(input.tableId ? { p_table_id: input.tableId, p_table_session_id: input.tableSessionId ?? null } : {}),
    };
    const { data, error } = await this.client.rpc(rpcName, rpcPayload);
    if (error) throw new Error(error.message);
    const result = first(data as ({ order_id: string } & OrderCodes & { guest_access_token?: string | null })[] | null);
    if (!result) throw new Error('Supabase no devolvió el pedido creado.');
    saveGuestToken(result.order_id, result.guest_access_token);
    const accessToken = result.guest_access_token ?? guestToken(result.order_id);
    if (input.deliveryPosition && accessToken) {
      const { data: positioned, error: positionError } = await this.client.rpc(
        'set_guest_order_delivery_coordinates',
        {
          p_order_id: result.order_id,
          p_access_token: accessToken,
          p_latitude: input.deliveryPosition.lat,
          p_longitude: input.deliveryPosition.lng,
        },
      );
      if (positionError) throw new Error(positionError.message);
      if (positioned !== true) throw new Error('No pudimos confirmar el punto de entrega.');
    } else if (input.deliveryPosition) {
      const { data: positioned, error: positionError } = await this.client.rpc(
        'set_order_delivery_coordinates',
        {
          target_order: result.order_id,
          latitude: input.deliveryPosition.lat,
          longitude: input.deliveryPosition.lng,
        },
      );
      if (positionError) throw new Error(positionError.message);
      if (positioned !== true) throw new Error('No pudimos confirmar el punto de entrega.');
    } else if (!input.tableId) {
      throw new Error('No pudimos confirmar el punto de entrega.');
    }
    if (accessToken) {
      const guest = await this.guestRow(result.order_id, accessToken);
      if (!guest) throw new Error('El pedido fue creado, pero no pudo recuperarse. Reintenta.');
      clearRequest(requestId);
      return mapGuestOrder(guest);
    }
    const row = await this.row(result.order_id);
    if (!row) throw new Error('El pedido fue creado, pero no pudo recuperarse. Reintenta.');
    clearRequest(requestId);
    return mapOrder(row, result);
  }

  async createMenuOrder(input: CreateOrderInput): Promise<Order> {
    return this.create({ ...input, origin: 'suya_menu' });
  }

  async updateStatus(id: string, status: OrderStatus): Promise<Order | undefined> {
    const current = await this.get(id);
    if (!current) return undefined;
    const { data, error } = await this.client.rpc('transition_order', {
      target_order: current.id,
      expected_status: current.status,
      next_status: status,
    });
    if (error) throw new Error(error.message);
    if (data !== true) return undefined;
    return this.get(id);
  }

  async cancel(id: string, code: string): Promise<CodeResult> {
    const before = await this.get(id);
    if (!before) return { ok: false, reason: 'not_found' };
    if (before.status === 'delivered' || before.status === 'cancelled') {
      return { ok: false, reason: 'already_closed' };
    }
    const { data, error } = await this.client.rpc('cancel_order_with_code', {
      target_order: before.id,
      supplied_code: code.trim(),
    });
    if (error) throw new Error(error.message);
    if (data !== true) return { ok: false, reason: 'invalid_code' };
    const order = await this.get(before.id);
    return order ? { ok: true, order } : { ok: false, reason: 'not_found' };
  }

  async confirmDelivery(id: string, code: string): Promise<CodeResult> {
    const before = await this.get(id);
    if (!before) return { ok: false, reason: 'not_found' };
    if (before.status === 'delivered' || before.status === 'cancelled') {
      return { ok: false, reason: 'already_closed' };
    }
    if (before.status !== 'on_the_way') return { ok: false, reason: 'invalid_status' };
    const { data, error } = await this.client.rpc('confirm_order_delivery', {
      target_order: before.id,
      supplied_code: code.trim(),
    });
    if (error) throw new Error(error.message);
    if (data !== true) return { ok: false, reason: 'invalid_code' };
    const order = await this.get(before.id);
    return order ? { ok: true, order } : { ok: false, reason: 'not_found' };
  }

  async cancelByRider(id: string, reason: string): Promise<boolean> {
    const { data, error } = await this.client.rpc('cancel_order_by_rider', { target_order: id, reason });
    if (error) throw new Error(error.message);
    return data === true;
  }

  subscribe(listener: () => void): () => void {
    const channel = this.client
      .channel(`orders-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, listener)
      .subscribe();
    return () => { void this.client.removeChannel(channel); };
  }

  async listAvailableRiders(restaurantId: string): Promise<AvailableRider[]> {
    const { data, error } = await this.client.rpc('list_available_riders', {
      target_restaurant: restaurantId,
    });
    if (error) throw new Error(error.message);
    return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
      id: String(row.user_id),
      name: String(row.display_name),
      phone: row.phone ? String(row.phone) : '',
      vehicleType: row.vehicle_type ? String(row.vehicle_type) : '',
      vehicleColor: row.vehicle_color ? String(row.vehicle_color) : '',
      vehiclePlate: row.vehicle_plate ? String(row.vehicle_plate) : '',
      rating: amount(row.rating as number | string),
      deliveries: Number(row.deliveries),
    }));
  }

  async assignRider(orderId: string, riderId: string | null): Promise<boolean> {
    const { data, error } = await this.client.rpc('assign_order_rider', {
      target_order: orderId,
      target_rider: riderId,
    });
    if (error) throw new Error(error.message);
    return data === true;
  }

  async cancelOrder(orderId: string, reason: string): Promise<boolean> {
    const { data, error } = await this.client.rpc('cancel_order_by_restaurant', {
      target_order: orderId,
      reason,
    });
    if (error) throw new Error(error.message);
    return data === true;
  }

  async setAvailability(available: boolean): Promise<'available' | 'offline'> {
    const { data, error } = await this.client.rpc('set_rider_availability', {
      is_available: available,
    });
    if (error) throw new Error(error.message);
    if (data !== 'available' && data !== 'offline') {
      throw new Error('Supabase devolvió un estado de repartidor inválido.');
    }
    return data;
  }

  async getAvailability(): Promise<'available' | 'offline' | 'busy'> {
    const { data: userData, error: userError } = await this.client.auth.getUser();
    if (userError || !userData.user) throw new Error(userError?.message ?? 'Sesión no válida.');
    const { data, error } = await this.client
      .from('rider_profiles')
      .select('status')
      .eq('user_id', userData.user.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (data?.status !== 'available' && data?.status !== 'offline' && data?.status !== 'busy') {
      throw new Error('Perfil de repartidor no disponible.');
    }
    return data.status;
  }
}
