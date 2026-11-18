import type { SupabaseClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SupabasePaymentGatewayService } from '@/lib/services/SupabasePaymentGatewayService';
import { SupabasePaymentService } from '@/lib/services/SupabasePaymentService';

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), invoke: vi.fn() }));
vi.mock('@/lib/supabase/client', () => ({ supabase: { rpc: mocks.rpc, functions: { invoke: mocks.invoke } } }));

const paymentRow = {
  attempt_id: 'attempt-mp-one', order_id: 'order-mp-one', method: 'yape', status: 'pending', amount: '20.00',
  currency: 'PEN', checkout_reference: 'SUYA-MP-ONE', expires_at: '2099-11-16T20:00:00Z',
  provider: 'mercadopago', provider_reference: 'preference-one', qr_payload: null,
  checkout_url: 'https://www.mercadopago.com.pe/checkout/v1/redirect?pref_id=preference-one',
  gateway_state: 'created', environment: 'live',
};

beforeEach(() => { vi.resetAllMocks(); });

describe('servicio administrativo de cobros', () => {
  it('envía acción explícita y credenciales solo al backend, sin almacenarlas', async () => {
    mocks.invoke.mockResolvedValue({ data: { config: null }, error: null });
    const body = { restaurantId: 'restaurant-one', accessToken: 'TEST-fixture', webhookSecret: 'signature-fixture', action: 'admin-activate' };
    await new SupabasePaymentGatewayService().admin('admin-save', body);
    expect(mocks.invoke).toHaveBeenCalledWith('payment-gateway', { body: { ...body, action: 'admin-save' } });
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it.each([400, 401, 403, 409, 422, 500])('no refleja secretos del cuerpo HTTP %i en el error visible', async (status) => {
    mocks.invoke.mockResolvedValue({ data: null, error: {
      message: 'provider leaked TEST-sensitive-fixture',
      context: new Response(JSON.stringify({ error: 'provider leaked TEST-sensitive-fixture' }), { status }),
    } });
    const outcome = await new SupabasePaymentGatewayService().admin('admin-check', {}).catch((error: unknown) => error);
    expect(outcome).toBeInstanceOf(Error);
    expect((outcome as Error).message).not.toContain('TEST-sensitive-fixture');
    expect((outcome as Error).message).not.toContain('provider leaked');
  });

  it('el error de transporte tampoco expone el mensaje interno', async () => {
    mocks.invoke.mockRejectedValue(new Error('Authorization: Bearer TEST-sensitive-fixture'));
    await expect(new SupabasePaymentGatewayService().admin('admin-save', {})).rejects.toThrow('Comprueba tu conexión');
  });

  it('rechaza errores embebidos en una respuesta 200 sin reflejar el contenido', async () => {
    mocks.invoke.mockResolvedValue({ data: { error: 'TEST-sensitive-fixture' }, error: null });
    await expect(new SupabasePaymentGatewayService().admin('admin-read', {})).rejects.toThrow('Comprueba tu conexión');
  });

  it('descarta mensajes arbitrarios de éxito', async () => {
    mocks.invoke.mockResolvedValue({ data: { config: null, message: 'TEST-sensitive-fixture', accessToken: 'otro-secreto' }, error: null });
    const result = await new SupabasePaymentGatewayService().admin('admin-read', {});
    expect(result.message).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain('TEST-sensitive-fixture');
    expect(JSON.stringify(result)).not.toContain('otro-secreto');
  });

  it.each(['rpc-error', 'network-error'])('desactiva disponibilidad ante fallo %s', async (failure) => {
    if (failure === 'network-error') mocks.rpc.mockRejectedValue(new Error('sin red'));
    else mocks.rpc.mockResolvedValue({ data: { available: true, automatic: true }, error: { message: 'RPC failed' } });
    await expect(new SupabasePaymentGatewayService().availability('restaurant-one')).resolves.toEqual({ provider: null, available: false, automatic: false });
  });

  it('la disponibilidad requiere booleanos reales del servidor', async () => {
    mocks.rpc.mockResolvedValue({ data: { provider: 'mercadopago', available: 'true', automatic: 'true' }, error: null });
    await expect(new SupabasePaymentGatewayService().availability('restaurant-one')).resolves.toMatchObject({ available: false, automatic: false });
  });
});

describe('solicitud de pago oficial desde frontend', () => {
  it('abre solicitud del mismo pedido sin enviar montos del navegador ni secretos', async () => {
    const rpc = vi.fn(async (_name: string, _args?: unknown) => ({ data: [paymentRow], error: null }));
    const invoke = vi.fn(async () => ({ data: { paymentIntent: paymentRow }, error: null }));
    const client = { rpc, functions: { invoke } } as unknown as SupabaseClient;
    const intent = await new SupabasePaymentService(client).createIntent('order-mp-one', 'yape', 'guest-fixture');
    expect(invoke).toHaveBeenCalledWith('payment-gateway', { body: {
      action: 'create', orderId: 'order-mp-one', method: 'yape', guestAccessToken: 'guest-fixture',
    } });
    expect(intent).toMatchObject({ status: 'pending', amount: 20, provider: 'mercadopago', checkoutUrl: paymentRow.checkout_url });
    expect(rpc.mock.calls.every((call) => !String(call[0]).includes('authorize'))).toBe(true);
  });

  it('un error temporal puede reintentarse conservando pedido y token de acceso', async () => {
    const rpc = vi.fn(async (_name: string, _args?: unknown) => ({ data: [paymentRow], error: null }));
    const invoke = vi.fn()
      .mockResolvedValueOnce({ data: null, error: { message: 'gateway timeout' } })
      .mockResolvedValueOnce({ data: { paymentIntent: paymentRow }, error: null });
    const client = { rpc, functions: { invoke } } as unknown as SupabaseClient;
    const service = new SupabasePaymentService(client);
    await expect(service.createIntent('order-mp-one', 'yape', 'guest-fixture')).rejects.toThrow('mismo pedido');
    await expect(service.createIntent('order-mp-one', 'yape', 'guest-fixture')).resolves.toMatchObject({ orderId: 'order-mp-one', status: 'pending' });
    expect(invoke.mock.calls[0]).toEqual(invoke.mock.calls[1]);
    expect(rpc.mock.calls.every((call) => call[0] === 'get_payment_intent')).toBe(true);
  });

  it('solo informa autorización después de leer el estado financiero del servidor', async () => {
    let authorized = false;
    const rpc = vi.fn(async (name: string) => ({
      data: [{ ...paymentRow, ...(name === 'get_gateway_payment_intent' && authorized ? { status: 'authorized', gateway_state: 'approved' } : {}) }], error: null,
    }));
    const client = { rpc } as unknown as SupabaseClient;
    const service = new SupabasePaymentService(client);
    await expect(service.getIntent('order-mp-one', 'guest-fixture')).resolves.toMatchObject({ status: 'pending' });
    authorized = true;
    await expect(service.getIntent('order-mp-one', 'guest-fixture')).resolves.toMatchObject({ status: 'authorized', gatewayState: 'approved' });
    expect(rpc).toHaveBeenCalledWith('get_gateway_payment_intent', { p_order_id: 'order-mp-one', p_guest_access_token: 'guest-fixture' });
  });
});
