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
  customer_id: string;
  restaurant_id: string;
  rider_id: string | null;
  status: OrderStatus;
  payment_method: Order['paymentMethod'];
  subtotal: number | string;
  delivery_fee: number | string;
  discount: number | string;
  total: number | string;
  customer_name: string;
  customer_phone: string;
  delivery_address: string;
  delivery_reference: string;
  estimated_minutes: number;
  created_at: string;
  restaurants: { name: string } | { name: string }[];
  order_items: OrderItemRow[];
  order_events: OrderEventRow[];
}

interface OrderCodes {
  delivery_code: string;
  cancel_code: string;
}

const ORDER_SELECT = `
  id, code, customer_id, restaurant_id, rider_id, status, payment_method,
  subtotal, delivery_fee, discount, total, customer_name, customer_phone,
  delivery_address, delivery_reference, estimated_minutes, created_at,
  restaurants!inner(name),
  order_items(id, product_id, product_name, unit_price, quantity, extras, note, image_url),
  order_events(status, created_at)
`;
const PENDING_REQUEST_KEY = 'suya.pending-cash-order';

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
    history,
    customer: {
      name: row.customer_name,
      phone: row.customer_phone,
      address: row.delivery_address,
      reference: row.delivery_reference,
    },
    paymentMethod: row.payment_method,
    riderId: row.rider_id,
    etaMinutes: row.estimated_minutes,
    deliveryCode: codes?.delivery_code ?? '',
    cancelCode: codes?.cancel_code ?? '',
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

  async list(): Promise<Order[]> {
    const [{ data: userData, error: userError }, { data, error }] = await Promise.all([
      this.client.auth.getUser(),
      this.client.from('orders').select(ORDER_SELECT).order('created_at', { ascending: false }),
    ]);
    if (userError) throw new Error(userError.message);
    if (error) throw new Error(error.message);
    const userId = userData.user?.id;
    const rows = (data ?? []) as unknown as OrderRow[];
    return Promise.all(rows.map(async (row) =>
      mapOrder(row, userId === row.customer_id ? await this.codes(row.id) : undefined),
    ));
  }

  async get(id: string): Promise<Order | undefined> {
    const [{ data: userData, error: userError }, row] = await Promise.all([
      this.client.auth.getUser(),
      this.row(id),
    ]);
    if (userError) throw new Error(userError.message);
    if (!row) return undefined;
    const codes = userData.user?.id === row.customer_id ? await this.codes(row.id) : undefined;
    return mapOrder(row, codes);
  }

  async create(input: CreateOrderInput): Promise<Order> {
    if (input.paymentMethod !== 'cash') {
      throw new Error('Solo el pago en efectivo está habilitado actualmente.');
    }
    const { data: userData, error: userError } = await this.client.auth.getUser();
    if (userError) throw new Error(userError.message);
    if (!userData.user) throw new Error('Inicia sesión para confirmar el pedido.');
    const { error: profileError } = await this.client
      .from('profiles')
      .update({
        display_name: input.customer.name.trim(),
        phone: input.customer.phone.trim(),
        default_address: input.customer.address.trim(),
        default_reference: input.customer.reference.trim(),
      })
      .eq('id', userData.user.id);
    if (profileError) throw new Error(profileError.message);

    const requestId = requestIdFor(input);
    const { data, error } = await this.client.rpc('create_cash_order', {
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
    });
    if (error) throw new Error(error.message);
    const result = first(data as ({ order_id: string } & OrderCodes)[] | null);
    if (!result) throw new Error('Supabase no devolvió el pedido creado.');
    const row = await this.row(result.order_id);
    if (!row) throw new Error('El pedido fue creado, pero no pudo recuperarse. Reintenta.');
    clearRequest(requestId);
    return mapOrder(row, result);
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
