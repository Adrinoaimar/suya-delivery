import type { SupabaseClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SupabaseOrderServiceImpl } from '@/lib/services/SupabaseOrderService';
import type { CreateOrderInput } from '@/lib/services/types';

interface QueryResult {
  data: unknown;
  error: { message: string } | null;
}

interface FakeClientOptions {
  userId?: string;
  listResult?: QueryResult;
  rowResult?: QueryResult | (() => QueryResult);
  rpc?: (name: string, args?: Record<string, unknown>) => Promise<QueryResult>;
}

function buildRow(overrides: Record<string, unknown> = {}) {
  return {
    id: '10000000-0000-4000-8000-000000000001',
    code: 'SUY-10001',
    customer_id: 'customer-1',
    restaurant_id: 'restaurant-1',
    rider_id: null,
    status: 'confirmed',
    payment_method: 'cash',
    subtotal: '25.00',
    delivery_fee: '4.00',
    discount: '1.00',
    total: '28.00',
    customer_name: 'Ana Torres',
    customer_phone: '987654321',
    delivery_address: 'Av. Principal 123',
    delivery_reference: 'Puerta verde',
    delivery_latitude: -4.8941,
    delivery_longitude: -80.6899,
    estimated_minutes: 35,
    created_at: '2026-08-20T15:00:00.000Z',
    restaurants: { name: 'El Buen Sabor', latitude: -4.9, longitude: -80.68 },
    order_items: [
      {
        id: 'line-server-1',
        product_id: 'product-1',
        product_name: 'Seco de chavelo',
        unit_price: '12.50',
        quantity: 2,
        extras: [{ id: 'extra-1', label: 'Ají', price: '1.50' }],
        note: 'Sin cebolla',
        image_url: null,
      },
    ],
    order_events: [
      { status: 'preparing', created_at: '2026-08-20T15:05:00.000Z' },
      { status: 'confirmed', created_at: '2026-08-20T15:00:00.000Z' },
    ],
    ...overrides,
  };
}

function createFakeClient(options: FakeClientOptions = {}) {
  const rpc = vi.fn(
    options.rpc ??
      (async () => ({
        data: null,
        error: null,
      })),
  );
  const from = vi.fn(() => ({
    select: vi.fn(() => ({
      order: vi.fn(async () => options.listResult ?? { data: [], error: null }),
      eq: vi.fn(() => ({
        maybeSingle: vi.fn(async () =>
          typeof options.rowResult === 'function'
            ? options.rowResult()
            : (options.rowResult ?? { data: null, error: null }),
        ),
      })),
    })),
    update: vi.fn(() => ({
      eq: vi.fn(async () => ({ data: null, error: null })),
    })),
  }));
  const client = {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: options.userId ? { id: options.userId } : null },
        error: null,
      })),
    },
    from,
    rpc,
  } as unknown as SupabaseClient;

  return { client, from, rpc };
}

function createInput(paymentMethod: CreateOrderInput['paymentMethod'] = 'cash'): CreateOrderInput {
  return {
    storeId: 'restaurant-1',
    items: [
      {
        lineId: 'local-line',
        productId: 'product-1',
        storeId: 'restaurant-1',
        name: 'Nombre y precio no confiables',
        unitPrice: 999,
        quantity: 2,
        extras: [{ id: 'extra-1', label: 'Extra local', price: 500 }],
        note: 'Sin cebolla',
        image: '/local.jpg',
      },
    ],
    subtotal: 1998,
    deliveryFee: 999,
    discount: 998,
    customer: {
      name: 'Nombre solo local',
      phone: '987654321',
      address: 'Av. Principal 123',
      reference: 'Puerta verde',
    },
    deliveryPosition: { lat: -4.8941, lng: -80.6899 },
    paymentMethod,
  };
}

beforeEach(() => {
  sessionStorage.clear();
  vi.restoreAllMocks();
});

describe('SupabaseOrderServiceImpl', () => {
  it('mapea filas del servidor y pide códigos solo para pedidos del cliente autenticado', async () => {
    const ownRow = buildRow();
    const otherRow = buildRow({
      id: '20000000-0000-4000-8000-000000000002',
      code: 'SUY-10002',
      customer_id: 'customer-2',
      restaurants: [{ name: 'Otro negocio' }],
      order_events: [],
    });
    const { client, rpc } = createFakeClient({
      userId: 'customer-1',
      listResult: { data: [ownRow, otherRow], error: null },
      rpc: async (name, args) => {
        expect(name).toBe('get_order_codes');
        expect(args).toEqual({ target_order: ownRow.id });
        return { data: [{ delivery_code: '1234', cancel_code: '5678' }], error: null };
      },
    });

    const orders = await new SupabaseOrderServiceImpl(client).list();

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(orders[0]).toMatchObject({
      id: ownRow.id,
      storeName: 'El Buen Sabor',
      subtotal: 25,
      deliveryFee: 4,
      discount: 1,
      total: 28,
      deliveryCode: '1234',
      cancelCode: '5678',
      history: [
        { status: 'confirmed', at: '2026-08-20T15:00:00.000Z' },
        { status: 'preparing', at: '2026-08-20T15:05:00.000Z' },
      ],
      items: [
        expect.objectContaining({
          lineId: 'line-server-1',
          unitPrice: 12.5,
          extras: [{ id: 'extra-1', label: 'Ají', price: 1.5 }],
        }),
      ],
    });
    expect(orders[1]).toMatchObject({
      storeName: 'Otro negocio',
      deliveryCode: '',
      cancelCode: '',
      history: [{ status: 'confirmed', at: '2026-08-20T15:00:00.000Z' }],
    });
  });

  it('reutiliza UUID tras fallo, limita payload y acepta precios y totales solo del servidor', async () => {
    const requestId = '11111111-1111-4111-8111-111111111111';
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(requestId);
    let attempts = 0;
    const { client, rpc } = createFakeClient({
      userId: 'customer-1',
      rowResult: { data: buildRow(), error: null },
      rpc: async (name) => {
        if (name === 'set_order_delivery_coordinates') return { data: true, error: null };
        expect(name).toBe('create_cash_order');
        attempts += 1;
        return attempts === 1
          ? { data: null, error: { message: 'fallo transitorio' } }
          : {
              data: [{ order_id: buildRow().id, delivery_code: '1234', cancel_code: '5678' }],
              error: null,
            };
      },
    });
    const service = new SupabaseOrderServiceImpl(client);
    const input = createInput();

    await expect(service.create(input)).rejects.toThrow('fallo transitorio');
    const order = await service.create(input);

    expect(rpc).toHaveBeenNthCalledWith(1, 'create_cash_order', {
      p_restaurant_id: 'restaurant-1',
      p_items: [
        {
          product_id: 'product-1',
          quantity: 2,
          extra_ids: ['extra-1'],
          note: 'Sin cebolla',
        },
      ],
      p_customer_phone: '987654321',
      p_delivery_address: 'Av. Principal 123',
      p_delivery_reference: 'Puerta verde',
      p_request_id: requestId,
    });
    expect(rpc.mock.calls[1]?.[1]).toEqual(rpc.mock.calls[0]?.[1]);
    expect(rpc).toHaveBeenNthCalledWith(3, 'set_order_delivery_coordinates', {
      target_order: buildRow().id,
      latitude: -4.8941,
      longitude: -80.6899,
    });
    expect(order.items[0]?.unitPrice).toBe(12.5);
    expect(order).toMatchObject({ subtotal: 25, deliveryFee: 4, discount: 1, total: 28 });
    expect(sessionStorage.getItem('suya.pending-cash-order')).toBeNull();
  });

  it.each(['yape', 'card'] as const)('rechaza pago %s antes de llamar Supabase', async (method) => {
    const { client, rpc, from } = createFakeClient();

    await expect(new SupabaseOrderServiceImpl(client).create(createInput(method))).rejects.toThrow(
      'Solo el pago en efectivo está habilitado actualmente.',
    );

    expect(rpc).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });

  it('clasifica cancelación inexistente, cerrada y con código inválido', async () => {
    const missing = createFakeClient({ rowResult: { data: null, error: null } });
    await expect(
      new SupabaseOrderServiceImpl(missing.client).cancel('SUY-40400', '1234'),
    ).resolves.toEqual({
      ok: false,
      reason: 'not_found',
    });

    const closed = createFakeClient({
      rowResult: { data: buildRow({ status: 'delivered' }), error: null },
    });
    await expect(
      new SupabaseOrderServiceImpl(closed.client).cancel(buildRow().id, '1234'),
    ).resolves.toEqual({
      ok: false,
      reason: 'already_closed',
    });
    expect(closed.rpc).not.toHaveBeenCalledWith('cancel_order_with_code', expect.anything());

    const invalid = createFakeClient({
      rowResult: { data: buildRow(), error: null },
      rpc: async () => ({ data: false, error: null }),
    });
    await expect(
      new SupabaseOrderServiceImpl(invalid.client).cancel(buildRow().id, ' 0000 '),
    ).resolves.toEqual({
      ok: false,
      reason: 'invalid_code',
    });
    expect(invalid.rpc).toHaveBeenCalledWith('cancel_order_with_code', {
      target_order: buildRow().id,
      supplied_code: '0000',
    });
  });

  it('clasifica confirmación fuera de estado sin invocar RPC', async () => {
    const { client, rpc } = createFakeClient({
      rowResult: { data: buildRow({ status: 'preparing' }), error: null },
    });

    await expect(
      new SupabaseOrderServiceImpl(client).confirmDelivery(buildRow().id, '1234'),
    ).resolves.toEqual({
      ok: false,
      reason: 'invalid_status',
    });
    expect(rpc).not.toHaveBeenCalledWith('confirm_order_delivery', expect.anything());
  });

  it('transiciona por RPC con estado esperado y vuelve a leer el pedido', async () => {
    let reads = 0;
    const { client, rpc } = createFakeClient({
      userId: 'rider-1',
      rowResult: () => ({
        data: buildRow({
          rider_id: 'rider-1',
          status: reads++ === 0 ? 'preparing' : 'picked_up',
        }),
        error: null,
      }),
      rpc: async () => ({ data: true, error: null }),
    });

    const order = await new SupabaseOrderServiceImpl(client).updateStatus(buildRow().id, 'picked_up');

    expect(rpc).toHaveBeenCalledWith('transition_order', {
      target_order: buildRow().id,
      expected_status: 'preparing',
      next_status: 'picked_up',
    });
    expect(order?.status).toBe('picked_up');
  });
});
