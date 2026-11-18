import type { SupabaseClient } from '@supabase/supabase-js';
import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SupabaseOrderServiceImpl } from '@/lib/services/SupabaseOrderService';
import type { CreateOrderInput } from '@/lib/services/types';

const orderId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const pendingRow = {
  attempt_id: 'attempt-fixture', order_id: orderId, provider: 'mercadopago', method: 'card', status: 'pending',
  amount: '20.00', currency: 'PEN', checkout_reference: 'SUYA-TEST-ONE', expires_at: '2099-11-16T20:00:00Z',
  provider_reference: 'preference-fixture', qr_payload: null,
  checkout_url: 'https://www.mercadopago.com.pe/checkout/v1/redirect?pref_id=fixture', gateway_state: 'created',
};
const orderRow = {
  id: orderId, order_id: orderId, code: 'SUYATEST1', customer_id: 'user-one', restaurant_id: 'restaurant-one',
  rider_id: null, status: 'pending_payment', payment_method: 'yape', subtotal: '20.00', delivery_fee: '0.00',
  discount: '0.00', total: '20.00', customer_name: 'Cliente Test', customer_phone: '999999999',
  delivery_address: 'Calle Test', delivery_reference: '', estimated_minutes: 30, created_at: '2026-11-16T10:00:00Z',
  restaurants: { name: 'Restaurante Test', latitude: null, longitude: null }, order_items: [], order_events: [],
  items: [], events: [], cancellation_reason: null, delivery_code: '', cancel_code: '', origin: 'menu', table_id: null,
};
function input(patch: Partial<CreateOrderInput> = {}): CreateOrderInput {
  return {
    storeId: 'restaurant-one', items: [{ lineId: 'line-one', productId: 'product-one', storeId: 'restaurant-one',
      name: 'Precio no fiable', unitPrice: 999, quantity: 1, extras: [], note: '', image: null }],
    subtotal: 999, deliveryFee: 999, discount: 0, deliveryPosition: null, paymentMethod: 'card',
    customer: { name: 'Cliente Test', phone: '999999999', address: 'Calle Test', reference: '' }, ...patch,
  };
}
function clientFixture(options: { guest?: boolean; available?: boolean; firstCheckoutFails?: boolean } = {}) {
  const createdRequests: Record<string, unknown>[] = [];
  const rpc = vi.fn(async (name: string, body?: Record<string, unknown>) => {
    if (name === 'gateway_config_public') return { data: { provider: 'mercadopago', available: options.available !== false, automatic: true }, error: null };
    if (name.startsWith('create_')) {
      createdRequests.push(body ?? {});
      return { data: [{ order_id: orderId, delivery_code: '', cancel_code: '', guest_access_token: body?.p_guest_access_token }], error: null };
    }
    if (name === 'get_payment_receiver_label') return { data: [{ account_label: 'Receptor Test' }], error: null };
    if (name === 'get_guest_order') return { data: [orderRow], error: null };
    if (name === 'get_payment_intent' || name === 'get_gateway_payment_intent') return {
      data: [{ ...pendingRow, ...(options.available === false ? { provider: 'wallet_observer', method: 'yape', checkout_url: null } : {}) }], error: null,
    };
    throw new Error(`RPC inesperada: ${name}`);
  });
  let checkoutCalls = 0;
  const invoke = vi.fn(async () => {
    checkoutCalls += 1;
    return options.firstCheckoutFails && checkoutCalls === 1
      ? { data: null, error: { message: 'network failure' } }
      : { data: { paymentIntent: pendingRow }, error: null };
  });
  const client = {
    auth: { getUser: vi.fn(async () => ({ data: { user: options.guest ? null : { id: 'user-one' } }, error: null })) },
    rpc, functions: { invoke },
    from: vi.fn(() => ({
      update: vi.fn(() => ({ eq: vi.fn(async () => ({ data: null, error: null })) })),
      select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: orderRow, error: null })) })) })),
    })),
  } as unknown as SupabaseClient;
  return { client, rpc, invoke, createdRequests };
}

beforeEach(() => { vi.stubGlobal('crypto', webcrypto); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('pedido existente integrado con pasarela oficial', () => {
  it('crea pedido digital pendiente por RPC atómica, sin confiar en precios locales', async () => {
    const { client, rpc, createdRequests } = clientFixture();
    const result = await new SupabaseOrderServiceImpl(client).create(input());
    expect(rpc).toHaveBeenCalledWith('create_delivery_order_with_gateway_payment', expect.objectContaining({
      p_restaurant_id: 'restaurant-one', p_method: 'card',
      p_items: [{ product_id: 'product-one', quantity: 1, extra_ids: [], note: '' }],
    }));
    expect(createdRequests[0]).not.toHaveProperty('p_total');
    expect(createdRequests[0]).not.toHaveProperty('p_subtotal');
    expect(JSON.stringify(createdRequests[0].p_items)).not.toContain('999');
    expect(result).toMatchObject({ id: orderId, total: 20, status: 'pending_payment', paymentIntent: { status: 'pending', provider: 'mercadopago' } });
  });

  it.each([
    ['menú invitado', { origin: 'suya_menu' as const }, 'create_menu_order_with_gateway_payment'],
    ['mesa invitada', { origin: 'table_qr' as const, tableId: 'table-one', tableSessionId: 'session-one' }, 'create_table_order_with_gateway_payment'],
  ])('conserva la identidad guest en %s', async (_label, patch, rpcName) => {
    const { client, rpc, invoke, createdRequests } = clientFixture({ guest: true });
    await new SupabaseOrderServiceImpl(client).create(input(patch));
    const guestToken = createdRequests[0].p_guest_access_token;
    expect(typeof guestToken).toBe('string');
    expect((guestToken as string).length).toBeGreaterThanOrEqual(32);
    expect(rpc).toHaveBeenCalledWith(rpcName, expect.objectContaining({ p_guest_access_token: guestToken, p_method: 'card' }));
    expect(invoke).toHaveBeenCalledWith('payment-gateway', { body: {
      action: 'create', orderId, method: 'card', guestAccessToken: guestToken,
    } });
  });

  it('reintenta apertura fallida con la misma clave de pedido y sin afirmar pago', async () => {
    const { client, createdRequests, invoke } = clientFixture({ firstCheckoutFails: true });
    const service = new SupabaseOrderServiceImpl(client);
    await expect(service.create(input())).rejects.toThrow('mismo pedido');
    const result = await service.create(input());
    expect(createdRequests).toHaveLength(2);
    expect(createdRequests[0].p_request_id).toBe(createdRequests[1].p_request_id);
    expect(invoke.mock.calls[0]).toEqual(invoke.mock.calls[1]);
    expect(result.id).toBe(orderId);
    expect(result.paymentIntent?.status).toBe('pending');
  });

  it('mantiene QR manual sin llamar a una pasarela si la cuenta no está activa', async () => {
    const { client, rpc, invoke } = clientFixture({ available: false });
    const result = await new SupabaseOrderServiceImpl(client).create(input({ paymentMethod: 'yape' }));
    expect(rpc).toHaveBeenCalledWith('create_delivery_order_with_payment', expect.objectContaining({ p_method: 'yape' }));
    expect(invoke).not.toHaveBeenCalled();
    expect(result.paymentIntent).toMatchObject({ status: 'pending', provider: 'wallet_observer' });
  });
});
