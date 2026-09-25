import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { SupabasePaymentService } from '@/lib/services/SupabasePaymentService';
import { SupabaseWalletObserverService } from '@/lib/services/SupabaseWalletObserverService';
import type { PaymentIntent } from '@/types';

function fakeClient(response: { data: unknown; error: { message: string } | null }) {
  return {
    rpc: vi.fn(async () => response),
  } as unknown as SupabaseClient & { rpc: ReturnType<typeof vi.fn> };
}

const intentRow = {
  attempt_id: 'attempt-1',
  order_id: 'order-1',
  method: 'yape',
  status: 'pending',
  amount: '30.00',
  currency: 'PEN',
  checkout_reference: 'SUYA-AB12CD34',
  expires_at: '2026-09-14T18:30:00.000Z',
  provider: 'wallet_observer',
  provider_reference: null,
  qr_payload: 'yape://public-business-qr',
};

describe('SupabasePaymentService', () => {
  it('devuelve el monto observado cuando el Yape no cubre el total', async () => {
    const client = fakeClient({
      data: [
        {
          confirmation_status: 'amount_mismatch',
          payment_attempt_id: 'attempt-1',
          observed_amount_cents: 100,
        },
      ],
      error: null,
    });

    await expect(
      new SupabasePaymentService(client).confirmWalletPaymentByCode('order-1', '813'),
    ).resolves.toMatchObject({ status: 'amount_mismatch', observedAmountCents: 100 });
    expect(client.rpc).toHaveBeenCalledWith('confirm_manual_wallet_payment_by_code_v2', {
      p_order_id: 'order-1',
      p_confirmation_code: '813',
      p_guest_access_token: null,
    });
  });

  it('acepta el resultado de código Yape distinto a una notificación del Observer', async () => {
    const client = fakeClient({
      data: [
        {
          confirmation_status: 'code_mismatch',
          payment_attempt_id: 'attempt-1',
          observation_id: null,
          observed_at: null,
          payer_display_name: null,
          observed_amount_cents: null,
        },
      ],
      error: null,
    });

    await expect(
      new SupabasePaymentService(client).confirmWalletPaymentByCode('order-1', '111'),
    ).resolves.toMatchObject({ status: 'code_mismatch', observedAmountCents: null });
  });

  it('envía el token guest y mapea el importe server-side', async () => {
    const client = {
      rpc: vi.fn(async (name: string) =>
        name === 'get_payment_receiver_label'
          ? { data: [{ account_label: 'Andá Paya Cevichería' }], error: null }
          : { data: [intentRow], error: null },
      ),
    } as unknown as SupabaseClient & { rpc: ReturnType<typeof vi.fn> };
    const intent = await new SupabasePaymentService(client).createIntent(
      'order-1',
      'yape',
      'guest-token',
    );

    expect(client.rpc).toHaveBeenCalledWith('refresh_payment_intent', {
      p_order_id: 'order-1',
      p_method: 'yape',
      p_guest_access_token: 'guest-token',
    });
    expect(intent).toMatchObject({
      orderId: 'order-1',
      method: 'yape',
      amount: 30,
      checkoutReference: 'SUYA-AB12CD34',
      qrPayload: 'yape://public-business-qr',
      providerReference: null,
      receiverLabel: 'Andá Paya Cevichería',
    });
    expect(client.rpc).toHaveBeenCalledWith('get_payment_receiver_label', {
      p_order_id: 'order-1',
      p_guest_access_token: 'guest-token',
    });
  });

  it('recupera el token guest de la sesión al refrescar sin argumento explícito', async () => {
    const client = fakeClient({ data: [intentRow], error: null });
    sessionStorage.setItem('suya.guest-order-token:order-1', 'a'.repeat(64));

    await new SupabasePaymentService(client).getIntent('order-1');

    expect(client.rpc).toHaveBeenCalledWith('get_payment_intent', {
      p_order_id: 'order-1',
      p_guest_access_token: 'a'.repeat(64),
    });
  });

  it('envía token Culqi al backend y no maneja datos de tarjeta en Suya', async () => {
    const invoke = vi.fn(async () => ({
      data: { status: 'authorized', providerReference: 'chr_test_12345678' },
      error: null,
    }));
    const client = {
      ...fakeClient({ data: null, error: null }),
      functions: { invoke },
    } as unknown as SupabaseClient;
    const intent: PaymentIntent = {
      attemptId: 'attempt-1',
      orderId: 'order-1',
      method: 'card',
      status: 'pending',
      amount: 30,
      currency: 'PEN',
      checkoutReference: 'SUYA-AB12CD34',
      expiresAt: '2026-09-14T18:30:00.000Z',
      provider: 'culqi',
      providerReference: 'ord_test_12345678',
      qrPayload: null,
    };
    await expect(
      new SupabasePaymentService(client).chargeCard(
        intent,
        'tkn_test_12345678',
        'cliente@suya.test',
      ),
    ).resolves.toBe('chr_test_12345678');
    expect(invoke).toHaveBeenCalledWith('charge-culqi-card', {
      body: {
        attemptId: 'attempt-1',
        method: 'card',
        tokenId: 'tkn_test_12345678',
        customerEmail: 'cliente@suya.test',
        guestAccessToken: null,
      },
    });
  });

  it('envía un token Yape Culqi al mismo flujo seguro de cargo', async () => {
    const invoke = vi.fn(async () => ({
      data: { status: 'authorized', providerReference: 'chr_test_yape123' },
      error: null,
    }));
    const client = {
      ...fakeClient({ data: null, error: null }),
      functions: { invoke },
    } as unknown as SupabaseClient;
    const intent: PaymentIntent = {
      attemptId: 'attempt-yape',
      orderId: 'order-yape',
      method: 'yape',
      status: 'pending',
      amount: 30,
      currency: 'PEN',
      checkoutReference: 'SUYA-YAPE123',
      expiresAt: '2026-09-14T18:30:00.000Z',
      provider: 'culqi',
      providerReference: 'ord_test_yape123',
      qrPayload: null,
    };
    await expect(
      new SupabasePaymentService(client).chargeCard(
        intent,
        'ype_test_yape123',
        'cliente@suya.test',
      ),
    ).resolves.toBe('chr_test_yape123');
    expect(invoke).toHaveBeenCalledWith('charge-culqi-card', {
      body: {
        attemptId: 'attempt-yape',
        method: 'yape',
        tokenId: 'ype_test_yape123',
        customerEmail: 'cliente@suya.test',
        guestAccessToken: null,
      },
    });
  });

  it('no oculta errores del RPC ni acepta una respuesta incompleta', async () => {
    const failed = fakeClient({ data: null, error: { message: 'payment provider unavailable' } });
    await expect(
      new SupabasePaymentService(failed).createIntent('order-1', 'lemon'),
    ).rejects.toThrow('payment provider unavailable');

    const incomplete = fakeClient({
      data: [{ ...intentRow, checkout_reference: null }],
      error: null,
    });
    await expect(
      new SupabasePaymentService(incomplete).createIntent('order-1', 'yape'),
    ).rejects.toThrow('datos completos');
  });

  it('vincula el código de constancia usando el token guest de la sesión', async () => {
    const client = fakeClient({ data: true, error: null });
    const service = new SupabasePaymentService(client);
    await expect(service.submitEvidence('order-1', ' 384 ')).resolves.toBe(true);
    expect(client.rpc).toHaveBeenCalledWith('submit_payment_evidence', {
      p_order_id: 'order-1',
      p_code: '384',
      p_guest_access_token: null,
    });
  });

  it('declara un pago manual sin enviar credenciales ni el código al almacenamiento del cliente', async () => {
    const client = fakeClient({ data: true, error: null });
    const service = new SupabasePaymentService(client);

    await expect(
      service.declarePayment('order-1', null, '  Otra Persona  ', 'guest-token'),
    ).resolves.toBe(true);
    expect(client.rpc).toHaveBeenCalledWith('declare_manual_payment', {
      p_order_id: 'order-1',
      p_code: null,
      p_payer_display_name: 'Otra Persona',
      p_guest_access_token: 'guest-token',
    });
  });

  it('lee solo el estado público de revisión, nunca la huella del código', async () => {
    const client = fakeClient({
      data: [
        {
          declared_at: '2026-09-15T22:00:00.000Z',
          payer_display_name: 'Otra Persona',
          code_hmac: 'secret',
        },
      ],
      error: null,
    });
    const declaration = await new SupabasePaymentService(client).getPaymentDeclaration('order-1');

    expect(declaration).toEqual({
      declaredAt: '2026-09-15T22:00:00.000Z',
      payerDisplayName: 'Otra Persona',
    });
    expect(client.rpc).toHaveBeenCalledWith('get_payment_declaration', {
      p_order_id: 'order-1',
      p_guest_access_token: null,
    });
  });

  it('permite completar el código faltante desde backoffice sin exponer el código completo', async () => {
    const client = fakeClient({ data: true, error: null });
    const service = new SupabaseWalletObserverService(client);
    await expect(service.setObservationCode('observation-1', ' 482913 ')).resolves.toBe(true);
    expect(client.rpc).toHaveBeenCalledWith('set_wallet_observation_code', {
      p_observation_id: 'observation-1',
      p_code: '482913',
    });
  });

  it('crea un emparejamiento de un solo uso sin devolver un token de dispositivo', async () => {
    const client = fakeClient({
      data: [
        {
          pairing_id: 'pairing-1',
          pairing_code: 'AB12CD34',
          expires_at: '2026-09-20T23:00:00.000Z',
          restaurant_id: 'restaurant-1',
          receiver_account_id: 'account-yape',
          device_label: 'Caja principal',
        },
      ],
      error: null,
    });
    const service = new SupabaseWalletObserverService(client);
    await expect(
      service.createPairing('restaurant-1', 'Caja principal', 'account-yape'),
    ).resolves.toEqual({
      pairingId: 'pairing-1',
      pairingCode: 'AB12CD34',
      expiresAt: '2026-09-20T23:00:00.000Z',
      restaurantId: 'restaurant-1',
      receiverAccountId: 'account-yape',
      deviceLabel: 'Caja principal',
    });
    expect(client.rpc).toHaveBeenCalledWith('create_wallet_observer_pairing', {
      p_restaurant_id: 'restaurant-1',
      p_receiver_account_id: 'account-yape',
      p_label: 'Caja principal',
    });
  });

  it('revoca un dispositivo mediante el RPC account-scoped', async () => {
    const client = fakeClient({ data: true, error: null });
    const service = new SupabaseWalletObserverService(client);
    await expect(service.setDeviceActive('device-1', false)).resolves.toBe(true);
    expect(client.rpc).toHaveBeenCalledWith('set_wallet_observer_device_active', {
      p_device_id: 'device-1',
      p_active: false,
    });
  });

  it('mapea el token rotado y conserva el restaurante de origen', async () => {
    const client = fakeClient({
      data: [
        {
          device_id: 'device-1',
          device_label: 'Caja principal',
          device_token: 'device-1.' + 'b'.repeat(64),
          device_active: false,
          restaurant_id: 'restaurant-1',
        },
      ],
      error: null,
    });
    const service = new SupabaseWalletObserverService(client);
    await expect(service.rotateDevice('device-1')).resolves.toMatchObject({
      id: 'device-1',
      restaurantId: 'restaurant-1',
      label: 'Caja principal',
      active: false,
      deviceToken: 'device-1.' + 'b'.repeat(64),
    });
    expect(client.rpc).toHaveBeenCalledWith('rotate_wallet_observer_device', {
      p_device_id: 'device-1',
    });
  });
});
