import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  PAYMENT_PROVIDERS_CATALOG,
  PRELOADED_STATIC_QR_PRESETS,
  PaymentSettlementEngine,
  buildBaseMerchantEmvcoQr,
  buildPaymentIdempotencyKey,
  calculateProviderFee,
  computeBodyHashBase64,
  createEphemeralDkimTestSigner,
  parseEmvcoQr,
  runProviderSafeDiagnosticSuite,
  signMercadoPagoWebhook,
  signMimeMessageDkimRsaSha256,
  signRawPayloadHmac,
  synthesizeDynamicEmvcoQrFromStatic,
  validateGatewayConfigInput,
  verifyMercadoPagoWebhookSignature,
  verifyRawPayloadHmac,
} from '@/lib/payments/paymentEngine';
import {
  TRUSTED_PERUVIAN_FINANCIAL_DKIM_DOMAINS,
  detectStaticQrWalletNetwork,
} from '@/lib/payments/staticQrAutoCloud';
import { PaymentGatewayConfigPanel } from '@/components/payment/PaymentGatewayConfigPanel';
import { PaymentInstructions } from '@/components/payment/PaymentInstructions';
import type { Order, PaymentIntent } from '@/types';

const serviceMocks = vi.hoisted(() => ({
  getIntent: vi.fn(),
  createIntent: vi.fn(),
  chargeCard: vi.fn(),
  chargeYapeOtp: vi.fn(),
  submitEvidence: vi.fn(),
  declarePayment: vi.fn(),
  confirmWalletPayment: vi.fn(),
  confirmWalletPaymentByCode: vi.fn(),
  getPaymentDeclaration: vi.fn(),
  listGatewayConfigs: vi.fn(),
  saveGatewayConfig: vi.fn(),
  testGatewayConnection: vi.fn(),
  recordGatewayTestResult: vi.fn(),
  listReconciliationExceptions: vi.fn(),
  resolveReconciliationException: vi.fn(),
  notify: vi.fn(),
}));

vi.mock('@/lib/services', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services')>()),
  paymentService: {
    getIntent: serviceMocks.getIntent,
    createIntent: serviceMocks.createIntent,
    chargeCard: serviceMocks.chargeCard,
    chargeYapeOtp: serviceMocks.chargeYapeOtp,
    submitEvidence: serviceMocks.submitEvidence,
    declarePayment: serviceMocks.declarePayment,
    confirmWalletPayment: serviceMocks.confirmWalletPayment,
    confirmWalletPaymentByCode: serviceMocks.confirmWalletPaymentByCode,
    getPaymentDeclaration: serviceMocks.getPaymentDeclaration,
  },
  walletObserverService: {
    listGatewayConfigs: serviceMocks.listGatewayConfigs,
    saveGatewayConfig: serviceMocks.saveGatewayConfig,
    testGatewayConnection: serviceMocks.testGatewayConnection,
    recordGatewayTestResult: serviceMocks.recordGatewayTestResult,
    listReconciliationExceptions: serviceMocks.listReconciliationExceptions,
    resolveReconciliationException: serviceMocks.resolveReconciliationException,
  },
  notificationService: { notify: serviceMocks.notify },
}));

describe('Motor de Pagos Automáticos SUYA — 17 escenarios obligatorios (Fase 8)', () => {
  it('1. aprueba un pedido con pago correcto y notifica al restaurante de forma atómica', () => {
    const engine = new PaymentSettlementEngine();
    engine.createOrder({
      id: 'ord-1',
      code: 'SUY-001',
      restaurantId: 'rest-1',
      totalCents: 4000,
    });
    const attempt = engine.createPaymentAttempt({
      orderId: 'ord-1',
      provider: 'mercado_pago',
      method: 'yape',
      nowMs: 1_000_000,
    });

    const outcome = engine.processProviderPaymentEvent({
      provider: 'mercado_pago',
      eventId: 'evt-ok-1',
      externalTransactionId: 'mp-tx-1001',
      attemptId: attempt.id,
      orderId: 'ord-1',
      amountCents: 4000,
      currency: 'PEN',
      providerStatus: 'approved',
      signatureVerified: true,
      apiVerified: true,
      occurredAtMs: 1_005_000,
    });

    expect(outcome.ok).toBe(true);
    expect(outcome.code).toBe('authorized');
    expect(outcome.restaurantNotified).toBe(true);
    expect(engine.getOrder('ord-1')?.status).toBe('confirmed');
    expect(engine.getOrder('ord-1')?.restaurantNotifiedCount).toBe(1);
    expect(engine.getAttempt(attempt.id)?.status).toBe('authorized');
  });

  it('2. rechaza pagos por importe incorrecto (parcial o exceso) y registra excepción de conciliación', () => {
    const engine = new PaymentSettlementEngine();
    engine.createOrder({
      id: 'ord-2',
      code: 'SUY-002',
      restaurantId: 'rest-1',
      totalCents: 6000,
    });
    const attempt = engine.createPaymentAttempt({
      orderId: 'ord-2',
      provider: 'taypi_qr',
      method: 'yape',
      nowMs: 1_000_000,
    });

    const partial = engine.processProviderPaymentEvent({
      provider: 'taypi_qr',
      eventId: 'evt-mismatch-1',
      externalTransactionId: 'taypi-tx-2001',
      attemptId: attempt.id,
      orderId: 'ord-2',
      amountCents: 2000,
      currency: 'PEN',
      providerStatus: 'approved',
      signatureVerified: true,
      apiVerified: true,
      occurredAtMs: 1_005_000,
    });

    expect(partial.ok).toBe(false);
    expect(partial.code).toBe('amount_mismatch');
    expect(engine.getOrder('ord-2')?.status).toBe('pending_payment');
    expect(engine.getAttempt(attempt.id)?.status).toBe('failed');
    expect(engine.listExceptions('rest-1')).toHaveLength(1);
    expect(engine.listExceptions('rest-1')[0]).toMatchObject({
      exceptionType: 'amount_mismatch',
      expectedAmountCents: 6000,
      receivedAmountCents: 2000,
      resolutionStatus: 'refund_pending',
    });
  });

  it('3. distingue correctamente dos pedidos simultáneos del mismo importe exacto', () => {
    const engine = new PaymentSettlementEngine();
    engine.createOrder({ id: 'ord-3a', code: 'SUY-003A', restaurantId: 'rest-1', totalCents: 2000 });
    engine.createOrder({ id: 'ord-3b', code: 'SUY-003B', restaurantId: 'rest-1', totalCents: 2000 });
    const attemptA = engine.createPaymentAttempt({
      orderId: 'ord-3a',
      provider: 'mercado_pago',
      method: 'yape',
    });
    const attemptB = engine.createPaymentAttempt({
      orderId: 'ord-3b',
      provider: 'mercado_pago',
      method: 'yape',
    });

    expect(attemptA.checkoutReference).not.toBe(attemptB.checkoutReference);

    const resB = engine.processProviderPaymentEvent({
      provider: 'mercado_pago',
      eventId: 'evt-3b',
      externalTransactionId: 'mp-tx-3b',
      attemptId: attemptB.id,
      orderId: 'ord-3b',
      amountCents: 2000,
      currency: 'PEN',
      providerStatus: 'approved',
      signatureVerified: true,
      apiVerified: true,
    });

    expect(resB.ok).toBe(true);
    expect(engine.getOrder('ord-3b')?.status).toBe('confirmed');
    expect(engine.getOrder('ord-3a')?.status).toBe('pending_payment');
    expect(engine.getAttempt(attemptA.id)?.status).toBe('pending');
  });

  it('4. detecta un segundo pago distinto para el mismo pedido (pago duplicado) y lo envía a devolución', () => {
    const engine = new PaymentSettlementEngine();
    engine.createOrder({ id: 'ord-4', code: 'SUY-004', restaurantId: 'rest-1', totalCents: 3000 });
    const attempt = engine.createPaymentAttempt({
      orderId: 'ord-4',
      provider: 'mercado_pago',
      method: 'yape',
    });

    engine.processProviderPaymentEvent({
      provider: 'mercado_pago',
      eventId: 'evt-4-first',
      externalTransactionId: 'mp-tx-401',
      attemptId: attempt.id,
      orderId: 'ord-4',
      amountCents: 3000,
      currency: 'PEN',
      providerStatus: 'approved',
      signatureVerified: true,
      apiVerified: true,
    });

    const duplicatePayment = engine.processProviderPaymentEvent({
      provider: 'mercado_pago',
      eventId: 'evt-4-second',
      externalTransactionId: 'mp-tx-402',
      attemptId: attempt.id,
      orderId: 'ord-4',
      amountCents: 3000,
      currency: 'PEN',
      providerStatus: 'approved',
      signatureVerified: true,
      apiVerified: true,
    });

    expect(duplicatePayment.ok).toBe(false);
    expect(duplicatePayment.code).toBe('duplicate_payment_exception');
    expect(engine.getOrder('ord-4')?.restaurantNotifiedCount).toBe(1);
    expect(engine.listExceptions('rest-1')[0]?.exceptionType).toBe('duplicate_payment');
  });

  it('5 y 12. procesa de forma idempotente un webhook repetido o reintento del servidor', () => {
    const engine = new PaymentSettlementEngine();
    engine.createOrder({ id: 'ord-5', code: 'SUY-005', restaurantId: 'rest-1', totalCents: 2500 });
    const attempt = engine.createPaymentAttempt({
      orderId: 'ord-5',
      provider: 'taypi_qr',
      method: 'yape',
    });

    const first = engine.processProviderPaymentEvent({
      provider: 'taypi_qr',
      eventId: 'evt-5-same',
      externalTransactionId: 'taypi-tx-501',
      attemptId: attempt.id,
      orderId: 'ord-5',
      amountCents: 2500,
      currency: 'PEN',
      providerStatus: 'approved',
      signatureVerified: true,
      apiVerified: true,
    });
    const replay = engine.processProviderPaymentEvent({
      provider: 'taypi_qr',
      eventId: 'evt-5-same',
      externalTransactionId: 'taypi-tx-501',
      attemptId: attempt.id,
      orderId: 'ord-5',
      amountCents: 2500,
      currency: 'PEN',
      providerStatus: 'approved',
      signatureVerified: true,
      apiVerified: true,
    });

    expect(first.code).toBe('authorized');
    expect(replay.ok).toBe(true);
    expect(replay.code).toBe('duplicate_event');
    expect(replay.restaurantNotified).toBe(false);
    expect(engine.getOrder('ord-5')?.restaurantNotifiedCount).toBe(1);
  });

  it('6. rechaza webhooks con firma criptográfica inválida o timestamp expirado', async () => {
    const secret = 'webhook_secret_suya_123';
    const validSig = await signMercadoPagoWebhook({
      secret,
      dataId: '887766',
      requestId: 'req-1',
      timestampSeconds: 1_700_000_000,
    });

    const okCheck = await verifyMercadoPagoWebhookSignature({
      signatureHeader: validSig,
      requestIdHeader: 'req-1',
      dataId: '887766',
      secret,
      nowSeconds: 1_700_000_050,
    });
    const wrongSecretCheck = await verifyMercadoPagoWebhookSignature({
      signatureHeader: validSig,
      requestIdHeader: 'req-1',
      dataId: '887766',
      secret: 'wrong_secret',
      nowSeconds: 1_700_000_050,
    });
    const expiredTsCheck = await verifyMercadoPagoWebhookSignature({
      signatureHeader: validSig,
      requestIdHeader: 'req-1',
      dataId: '887766',
      secret,
      nowSeconds: 1_700_001_000,
    });

    expect(okCheck.ok).toBe(true);
    expect(wrongSecretCheck).toEqual({ ok: false, reason: 'invalid_hmac_signature' });
    expect(expiredTsCheck).toEqual({ ok: false, reason: 'signature_timestamp_expired' });

    const rawBody = '{"id":"tx-1","amount":20}';
    const rawSig = await signRawPayloadHmac(secret, rawBody);
    expect((await verifyRawPayloadHmac({ signatureHeader: rawSig, rawBody, secret })).ok).toBe(true);
    expect(
      (await verifyRawPayloadHmac({ signatureHeader: 'sha256=0000', rawBody, secret })).ok,
    ).toBe(false);
  });

  it('7, 8 y 11. maneja pagos pendientes, pagos rechazados y reintentos con clave de idempotencia', () => {
    const engine = new PaymentSettlementEngine();
    engine.createOrder({ id: 'ord-7', code: 'SUY-007', restaurantId: 'rest-1', totalCents: 1800 });
    const attempt1 = engine.createPaymentAttempt({
      orderId: 'ord-7',
      provider: 'mercado_pago',
      method: 'yape',
    });

    // Mientras sigue pendiente, una desconexión y reintento devuelve el mismo intento e idempotencyKey
    const retryAfterDisconnect = engine.createPaymentAttempt({
      orderId: 'ord-7',
      provider: 'mercado_pago',
      method: 'yape',
    });
    expect(retryAfterDisconnect.id).toBe(attempt1.id);
    expect(retryAfterDisconnect.idempotencyKey).toBe(
      buildPaymentIdempotencyKey('ord-7', 'mercado_pago', 1),
    );

    // Estado pendiente
    const pendingRes = engine.processProviderPaymentEvent({
      provider: 'mercado_pago',
      eventId: 'evt-7-pending',
      externalTransactionId: 'mp-tx-701',
      attemptId: attempt1.id,
      orderId: 'ord-7',
      amountCents: 1800,
      currency: 'PEN',
      providerStatus: 'pending',
      signatureVerified: true,
      apiVerified: true,
    });
    expect(pendingRes.code).toBe('pending');
    expect(engine.getOrder('ord-7')?.status).toBe('pending_payment');

    // Estado rechazado
    const rejectedRes = engine.processProviderPaymentEvent({
      provider: 'mercado_pago',
      eventId: 'evt-7-rejected',
      externalTransactionId: 'mp-tx-701',
      attemptId: attempt1.id,
      orderId: 'ord-7',
      amountCents: 1800,
      currency: 'PEN',
      providerStatus: 'rejected',
      signatureVerified: true,
      apiVerified: true,
    });
    expect(rejectedRes.ok).toBe(false);
    expect(rejectedRes.code).toBe('provider_rejected');
    expect(engine.getAttempt(attempt1.id)?.status).toBe('failed');

    // Nuevo intento tras rechazo genera attemptNumber = 2 con nueva clave de idempotencia
    const attempt2 = engine.createPaymentAttempt({
      orderId: 'ord-7',
      provider: 'mercado_pago',
      method: 'yape',
    });
    expect(attempt2.id).not.toBe(attempt1.id);
    expect(attempt2.attemptNumber).toBe(2);
    expect(attempt2.idempotencyKey).toBe(buildPaymentIdempotencyKey('ord-7', 'mercado_pago', 2));
  });

  it('9 y 10. expira intentos vencidos y registra confirmaciones tardías en conciliación', () => {
    const engine = new PaymentSettlementEngine();
    engine.createOrder({ id: 'ord-9', code: 'SUY-009', restaurantId: 'rest-1', totalCents: 5000 });
    const attempt = engine.createPaymentAttempt({
      orderId: 'ord-9',
      provider: 'taypi_qr',
      method: 'yape',
      nowMs: 1_000_000,
      ttlMs: 60_000,
    });

    // Confirmación que llega después de expiresAtMs (1_060_000)
    const lateOutcome = engine.processProviderPaymentEvent({
      provider: 'taypi_qr',
      eventId: 'evt-9-late',
      externalTransactionId: 'taypi-tx-901',
      attemptId: attempt.id,
      orderId: 'ord-9',
      amountCents: 5000,
      currency: 'PEN',
      providerStatus: 'approved',
      signatureVerified: true,
      apiVerified: true,
      occurredAtMs: 1_120_000,
    });

    expect(lateOutcome.ok).toBe(false);
    expect(lateOutcome.code).toBe('late_payment_exception');
    expect(engine.getOrder('ord-9')?.status).toBe('pending_payment');
    expect(engine.listExceptions('rest-1')[0]?.exceptionType).toBe('late_payment');
  });

  it('13. ante un error de base de datos no pierde el evento y permite el reintento exitoso', () => {
    const engine = new PaymentSettlementEngine();
    engine.createOrder({ id: 'ord-13', code: 'SUY-013', restaurantId: 'rest-1', totalCents: 1000 });
    const attempt = engine.createPaymentAttempt({
      orderId: 'ord-13',
      provider: 'mercado_pago',
      method: 'yape',
    });

    engine.setSimulatedDatabaseOutage(true);
    const failedDb = engine.processProviderPaymentEvent({
      provider: 'mercado_pago',
      eventId: 'evt-13-1',
      externalTransactionId: 'mp-tx-1301',
      attemptId: attempt.id,
      orderId: 'ord-13',
      amountCents: 1000,
      currency: 'PEN',
      providerStatus: 'approved',
      signatureVerified: true,
      apiVerified: true,
    });
    expect(failedDb.ok).toBe(false);
    expect(failedDb.code).toBe('database_error');
    expect(engine.getOrder('ord-13')?.status).toBe('pending_payment');

    engine.setSimulatedDatabaseOutage(false);
    const recovered = engine.processProviderPaymentEvent({
      provider: 'mercado_pago',
      eventId: 'evt-13-1',
      externalTransactionId: 'mp-tx-1301',
      attemptId: attempt.id,
      orderId: 'ord-13',
      amountCents: 1000,
      currency: 'PEN',
      providerStatus: 'approved',
      signatureVerified: true,
      apiVerified: true,
    });
    expect(recovered.ok).toBe(true);
    expect(recovered.code).toBe('authorized');
    expect(engine.getOrder('ord-13')?.status).toBe('confirmed');
  });

  it('14. no reactiva un pedido cancelado si llega un pago posterior y lo envía a devolución', () => {
    const engine = new PaymentSettlementEngine();
    engine.createOrder({ id: 'ord-14', code: 'SUY-014', restaurantId: 'rest-1', totalCents: 3500 });
    const attempt = engine.createPaymentAttempt({
      orderId: 'ord-14',
      provider: 'mercado_pago',
      method: 'yape',
    });
    engine.cancelOrder('ord-14', 'customer_cancelled');

    const outcome = engine.processProviderPaymentEvent({
      provider: 'mercado_pago',
      eventId: 'evt-14-1',
      externalTransactionId: 'mp-tx-1401',
      attemptId: attempt.id,
      orderId: 'ord-14',
      amountCents: 3500,
      currency: 'PEN',
      providerStatus: 'approved',
      signatureVerified: true,
      apiVerified: true,
    });

    expect(outcome.ok).toBe(false);
    expect(outcome.code).toBe('order_cancelled_exception');
    expect(engine.getOrder('ord-14')?.status).toBe('cancelled');
    expect(engine.listExceptions('rest-1')[0]?.exceptionType).toBe('order_cancelled');
  });

  it('15. bloquea cualquier intento de aprobar un pedido sin verificación financiera real', () => {
    const engine = new PaymentSettlementEngine();
    engine.createOrder({ id: 'ord-15', code: 'SUY-015', restaurantId: 'rest-1', totalCents: 4500 });
    const attempt = engine.createPaymentAttempt({
      orderId: 'ord-15',
      provider: 'static_qr',
      method: 'yape',
    });

    for (const source of [
      'screenshot',
      'client_operation_code',
      'android_notification',
      'unverified_email',
      'browser_response',
      'static_qr_scan',
    ] as const) {
      const res = engine.attemptUnverifiedClientOrObserverApproval({
        attemptId: attempt.id,
        source,
      });
      expect(res.ok).toBe(false);
      expect(res.code).toBe('rejected_unverified');
    }

    expect(engine.getOrder('ord-15')?.status).toBe('pending_payment');
  });

  it('16 y 17. bloquea reutilizar la misma transacción para dos pedidos y controla concurrencia', () => {
    const engine = new PaymentSettlementEngine();
    engine.createOrder({ id: 'ord-16a', code: 'SUY-16A', restaurantId: 'rest-1', totalCents: 2000 });
    engine.createOrder({ id: 'ord-16b', code: 'SUY-16B', restaurantId: 'rest-1', totalCents: 2000 });
    const attemptA = engine.createPaymentAttempt({
      orderId: 'ord-16a',
      provider: 'mercado_pago',
      method: 'yape',
    });
    const attemptB = engine.createPaymentAttempt({
      orderId: 'ord-16b',
      provider: 'mercado_pago',
      method: 'yape',
    });

    engine.processProviderPaymentEvent({
      provider: 'mercado_pago',
      eventId: 'evt-16-a',
      externalTransactionId: 'mp-tx-shared-999',
      attemptId: attemptA.id,
      orderId: 'ord-16a',
      amountCents: 2000,
      currency: 'PEN',
      providerStatus: 'approved',
      signatureVerified: true,
      apiVerified: true,
    });

    const reuseRes = engine.processProviderPaymentEvent({
      provider: 'mercado_pago',
      eventId: 'evt-16-b',
      externalTransactionId: 'mp-tx-shared-999',
      attemptId: attemptB.id,
      orderId: 'ord-16b',
      amountCents: 2000,
      currency: 'PEN',
      providerStatus: 'approved',
      signatureVerified: true,
      apiVerified: true,
    });

    expect(reuseRes.ok).toBe(false);
    expect(reuseRes.code).toBe('transaction_reused');
    expect(engine.getOrder('ord-16b')?.status).toBe('pending_payment');

    const concurrentRes = engine.processProviderPaymentEvent(
      {
        provider: 'mercado_pago',
        eventId: 'evt-16-concurrent',
        externalTransactionId: 'mp-tx-new-888',
        attemptId: attemptB.id,
        orderId: 'ord-16b',
        amountCents: 2000,
        currency: 'PEN',
        providerStatus: 'approved',
        signatureVerified: true,
        apiVerified: true,
      },
      { simulateConcurrentLockOnAttempt: true },
    );
    expect(concurrentRes.ok).toBe(false);
    expect(concurrentRes.code).toBe('concurrent_lock_conflict');
  });

  it('calcula comisiones exactas para S/10, S/20, S/40, S/60, S/100 y S/200 (Fase 4)', () => {
    expect(calculateProviderFee('static_qr', 40).totalFeePen).toBe(0);
    expect(calculateProviderFee('taypi_qr', 10).totalFeePen).toBe(0.53);
    expect(calculateProviderFee('taypi_qr', 20).totalFeePen).toBe(0.83);
    expect(calculateProviderFee('taypi_qr', 40).totalFeePen).toBe(1.42);
    expect(calculateProviderFee('taypi_qr', 60).totalFeePen).toBe(2.01);
    expect(calculateProviderFee('taypi_qr', 100).totalFeePen).toBe(3.19);
    expect(calculateProviderFee('taypi_qr', 200).totalFeePen).toBe(6.14);

    expect(calculateProviderFee('mercado_pago', 10).totalFeePen).toBe(1.59);
    expect(calculateProviderFee('mercado_pago', 20).totalFeePen).toBe(2.0);
    expect(calculateProviderFee('mercado_pago', 40).totalFeePen).toBe(2.83);
  });

  it('ejecuta la suite diagnóstica segura para todos los proveedores del catálogo', async () => {
    for (const providerId of Object.keys(
      PAYMENT_PROVIDERS_CATALOG,
    ) as Array<keyof typeof PAYMENT_PROVIDERS_CATALOG>) {
      const suite = await runProviderSafeDiagnosticSuite(providerId);
      expect(suite.passed).toBe(true);
      expect(suite.checks).toHaveLength(4);
    }
  });

  it('verifica el contrato SQL de la nueva migración de pagos automáticos y checkout real', () => {
    const sql = readFileSync(
      resolve(
        process.cwd(),
        'supabase/migrations/20261116203000_suya_automatic_payments_engine.sql',
      ),
      'utf8',
    );
    expect(sql).toContain('create table if not exists public.payment_gateway_configs');
    expect(sql).toContain('create table if not exists private.payment_gateway_secrets');
    expect(sql).toContain('create unique index if not exists payment_attempts_provider_external_tx_uidx');
    expect(sql).toContain('on public.payment_attempts (gateway_config_id, unique_conciliation_amount_cents)');
    expect(sql).toContain('create unique index if not exists payment_attempts_static_autocloud_network_unique_uidx');
    expect(sql).toContain('v_match_count = 1');
    expect(sql).toContain('create or replace function public.settle_verified_gateway_payment');
    expect(sql).toContain('create or replace function public.find_pending_static_qr_attempt_for_autocloud');
    expect(sql).toContain('create or replace function public.get_payment_gateway_runtime_config');
    expect(sql).toContain('create or replace function public.get_public_checkout_payment_options');
    expect(sql).toContain('create or replace function private.allocate_static_qr_conciliation_cents');
    expect(sql).toContain('create or replace function public.create_payment_intent');
    expect(sql).toContain('create or replace function public.get_payment_intent');
    expect(sql).toContain('unverified wallet notifications or static QR scans cannot auto-authorize payments');

    const exactAmountSql = readFileSync(
      resolve(
        process.cwd(),
        'supabase/migrations/20261117000100_static_qr_exact_amount_matching.sql',
      ),
      'utf8',
    );
    expect(exactAmountSql).toContain(
      'drop index if exists public.payment_attempts_static_autocloud_unique_amount_uidx',
    );
    expect(exactAmountSql).toContain('return p_base_amount_cents;');
    expect(exactAmountSql).toContain('p_payer_name text default null');
    expect(exactAmountSql).toContain('and pa.amount_cents = p_amount_cents;');

    const observerAutoSettleSql = readFileSync(
      resolve(
        process.cwd(),
        'supabase/migrations/20261117010000_wallet_observer_auto_settle_opt_in.sql',
      ),
      'utf8',
    );
    expect(observerAutoSettleSql).toContain('auto_settle_orders boolean not null default false');
    expect(observerAutoSettleSql).toContain('set_wallet_observer_device_auto_settle');
    expect(observerAutoSettleSql).toContain('private.try_auto_settle_wallet_observation');
    expect(observerAutoSettleSql).toContain("new.provider not in ('yape', 'lemon', 'plin')");
    expect(observerAutoSettleSql).toContain('and pa.amount_cents = new.amount_cents');
  });

  it('mantiene intactos los QR reales precargados (Lemon y Yape) sin alterar CRC-16', () => {
    for (const preset of Object.values(PRELOADED_STATIC_QR_PRESETS)) {
      const parsed = parseEmvcoQr(preset.qrPayload);
      expect(parsed.valid).toBe(true);
      expect(parsed.crcValid).toBe(true);
      const out = synthesizeDynamicEmvcoQrFromStatic({
        staticQrPayload: preset.qrPayload,
        amountCents: 2500,
        checkoutReference: 'SUYA-EXACT-01',
      });
      expect(out.isEmvcoDynamic).toBe(false);
      expect(out.qrPayload).toBe(preset.qrPayload);
      expect(out.amountPenFormatted).toBe('25.00');
    }
  });

  it('automatiza QR Estático (Yape, Plin, Lemon, IzipayYA) por monto exacto sin céntimos y desambigua por nombre del pagador vía DKIM RSA-2048 real', async () => {
    const engine = new PaymentSettlementEngine();
    const { privateKey, resolvePublicKeySpki } = await createEphemeralDkimTestSigner();

    // 5 pedidos simultáneos de exactamente S/ 25.00 (2500 céntimos) en el mismo restaurante
    // Dos comparten red Yape con distinto cliente para validar desambiguación por nombre sin alterar céntimos
    engine.createOrder({
      id: 'ord-yape-1',
      code: 'SUY-Y1',
      restaurantId: 'rest-suya',
      customerName: 'Ana Torres',
      totalCents: 2500,
    });
    engine.createOrder({
      id: 'ord-yape-2',
      code: 'SUY-Y2',
      restaurantId: 'rest-suya',
      customerName: 'Carlos Mendoza',
      totalCents: 2500,
    });
    engine.createOrder({
      id: 'ord-plin',
      code: 'SUY-P1',
      restaurantId: 'rest-suya',
      customerName: 'Lucia Vega',
      totalCents: 2500,
    });
    engine.createOrder({
      id: 'ord-lemon',
      code: 'SUY-L1',
      restaurantId: 'rest-suya',
      customerName: 'Diego Salas',
      totalCents: 2500,
    });
    engine.createOrder({
      id: 'ord-izipayya',
      code: 'SUY-I1',
      restaurantId: 'rest-suya',
      customerName: 'Rosa Paredes',
      totalCents: 2500,
    });

    const attYape1 = engine.createPaymentAttempt({
      orderId: 'ord-yape-1',
      provider: 'static_qr',
      method: 'yape',
      staticWalletNetwork: 'yape',
    });
    const attYape2 = engine.createPaymentAttempt({
      orderId: 'ord-yape-2',
      provider: 'static_qr',
      method: 'yape',
      staticWalletNetwork: 'yape',
    });
    const attPlin = engine.createPaymentAttempt({
      orderId: 'ord-plin',
      provider: 'static_qr',
      method: 'yape',
      staticWalletNetwork: 'plin',
    });
    const attLemon = engine.createPaymentAttempt({
      orderId: 'ord-lemon',
      provider: 'static_qr',
      method: 'lemon',
      staticWalletNetwork: 'lemon',
    });
    const attIzipayYa = engine.createPaymentAttempt({
      orderId: 'ord-izipayya',
      provider: 'static_qr',
      method: 'yape',
      staticWalletNetwork: 'izipayya',
    });

    // Ningún pedido sufre descuentos de céntimos: todos cobran exactamente S/ 25.00 (2500 céntimos)
    for (const att of [attYape1, attYape2, attPlin, attLemon, attIzipayYa]) {
      expect(att.amountCents).toBe(2500);
      expect(att.uniqueConciliationAmountCents).toBe(2500);
      expect(att.synthesizedQrPayload).toBeTruthy();
      const parsedQr = parseEmvcoQr(att.synthesizedQrPayload!);
      expect(parsedQr.valid).toBe(true);
      expect(parsedQr.crcValid).toBe(true);
    }

    // 1. Llega confirmación DKIM RSA-2048 real de IzipayYA (izipay.pe) por exacto S/ 25.00
    const signedIzipay = await signMimeMessageDkimRsaSha256({
      privateKey,
      selector: 's1',
      domain: 'izipay.pe',
      from: 'notificaciones@izipay.pe',
      to: 'pagos@suyadelivery.com',
      subject: 'Notificación de cobro QR IzipayYA',
      rawBody: 'Comprobante QR IzipayYA aprobado por S/ 25.00\r\nNúmero de operación: IZI900123\r\n',
    });
    const resIzipay = await engine.processStaticQrAutoCloudEmail({
      restaurantId: 'rest-suya',
      messageId: 'msg-izi-1',
      subject: 'Notificación de cobro QR IzipayYA',
      rawBodyText: signedIzipay.rawBody,
      rawHeaders: signedIzipay.rawHeaders,
      authenticationResultsHeader:
        'mx.cloudflare.net; spf=pass; dkim=pass header.d=izipay.pe; dmarc=pass',
      resolvePublicKeySpki,
    });
    expect(resIzipay.ok).toBe(true);
    expect(engine.getOrder('ord-izipayya')?.status).toBe('confirmed');
    expect(engine.getOrder('ord-yape-1')?.status).toBe('pending_payment');

    // Ataques criptográficos rechazados explícitamente antes de tocar pedidos restantes:
    // a) Firma ficticia b=SIG (aun con bh= correcto)
    const bodyLemon = 'Recibiste una transferencia QR en Lemon por S/ 25.00\r\nOperación: LEM778899\r\n';
    const bhFakeSig = await computeBodyHashBase64(bodyLemon);
    const fakeSigRes = await engine.processStaticQrAutoCloudEmail({
      restaurantId: 'rest-suya',
      messageId: 'msg-fake-sig',
      subject: 'Transferencia recibida en Lemon',
      rawBodyText: bodyLemon,
      rawHeaders: [
        'From: notificaciones@lemon.me',
        'To: pagos@suyadelivery.com',
        'Subject: Transferencia recibida en Lemon',
        `DKIM-Signature: v=1; a=rsa-sha256; d=lemon.me; s=s1; h=from:to:subject; bh=${bhFakeSig}; b=SIG`,
      ].join('\r\n'),
      authenticationResultsHeader:
        'mx.google.com; spf=pass; dkim=pass header.d=lemon.me; dmarc=pass',
      resolvePublicKeySpki,
    });
    expect(fakeSigRes.ok).toBe(false);
    expect(fakeSigRes.code).toBe('rejected_unverified');
    expect(engine.getOrder('ord-lemon')?.status).toBe('pending_payment');

    // b) Desalineación header.d=attacker.com en Authentication-Results
    const signedLemon = await signMimeMessageDkimRsaSha256({
      privateKey,
      selector: 's1',
      domain: 'lemon.me',
      from: 'notificaciones@lemon.me',
      to: 'pagos@suyadelivery.com',
      subject: 'Transferencia recibida en Lemon',
      rawBody: bodyLemon,
    });
    const mismatchedAuthHeaderRes = await engine.processStaticQrAutoCloudEmail({
      restaurantId: 'rest-suya',
      messageId: 'msg-mismatched-auth',
      subject: 'Transferencia recibida en Lemon',
      rawBodyText: signedLemon.rawBody,
      rawHeaders: signedLemon.rawHeaders,
      authenticationResultsHeader:
        'mx.google.com; spf=pass; dkim=pass header.d=attacker.com; dmarc=pass',
      resolvePublicKeySpki,
    });
    expect(mismatchedAuthHeaderRes.ok).toBe(false);
    expect(mismatchedAuthHeaderRes.code).toBe('rejected_unverified');
    expect(engine.getOrder('ord-lemon')?.status).toBe('pending_payment');

    // 2. Confirmación real válida de Lemon Cash (lemon.me) por S/ 25.00
    const resLemon = await engine.processStaticQrAutoCloudEmail({
      restaurantId: 'rest-suya',
      messageId: 'msg-lem-1',
      subject: 'Transferencia recibida en Lemon',
      rawBodyText: signedLemon.rawBody,
      rawHeaders: signedLemon.rawHeaders,
      authenticationResultsHeader:
        'mx.google.com; spf=pass; dkim=pass header.i=@lemon.me; dmarc=pass',
      resolvePublicKeySpki,
    });
    expect(resLemon.ok).toBe(true);
    expect(engine.getOrder('ord-lemon')?.status).toBe('confirmed');

    // 3. Confirmación real válida de Plin Interbank (interbank.pe) por S/ 25.00
    const signedPlin = await signMimeMessageDkimRsaSha256({
      privateKey,
      selector: 's1',
      domain: 'interbank.pe',
      from: 'avisos@interbank.pe',
      to: 'pagos@suyadelivery.com',
      subject: 'Constancia de operación Plin - Interbank',
      rawBody: 'Constancia de Pago Plin recibido por S/ 25.00\r\nCódigo de operación: 44556677\r\n',
    });
    const resPlin = await engine.processStaticQrAutoCloudEmail({
      restaurantId: 'rest-suya',
      messageId: 'msg-plin-1',
      subject: 'Constancia de operación Plin - Interbank',
      rawBodyText: signedPlin.rawBody,
      rawHeaders: signedPlin.rawHeaders,
      authenticationResultsHeader:
        'mx.cloudflare.net; spf=pass; dkim=pass header.d=interbank.pe; dmarc=pass',
      resolvePublicKeySpki,
    });
    expect(resPlin.ok).toBe(true);
    expect(engine.getOrder('ord-plin')?.status).toBe('confirmed');

    // 4. Confirmación de red cruzada (Plin por S/ 25.00 cuando ya no hay Plin pendiente) NO aprueba pedidos Yape
    const wrongNetPlin = await signMimeMessageDkimRsaSha256({
      privateKey,
      selector: 's1',
      domain: 'interbank.pe',
      from: 'avisos@interbank.pe',
      to: 'pagos@suyadelivery.com',
      subject: 'Constancia de operación Plin - Interbank',
      rawBody: 'Constancia de Pago Plin recibido por S/ 25.00\r\nCódigo de operación: 99887766\r\n',
    });
    const crossNetworkRes = await engine.processStaticQrAutoCloudEmail({
      restaurantId: 'rest-suya',
      messageId: 'msg-wrong-net',
      subject: 'Constancia de operación Plin - Interbank',
      rawBodyText: wrongNetPlin.rawBody,
      rawHeaders: wrongNetPlin.rawHeaders,
      authenticationResultsHeader:
        'mx.cloudflare.net; spf=pass; dkim=pass header.d=interbank.pe; dmarc=pass',
      resolvePublicKeySpki,
    });
    expect(crossNetworkRes.ok).toBe(false);
    expect(crossNetworkRes.code).toBe('attempt_not_found');
    expect(engine.getOrder('ord-yape-1')?.status).toBe('pending_payment');
    expect(engine.getOrder('ord-yape-2')?.status).toBe('pending_payment');

    // 5a. Con dos pedidos Yape pendientes del mismo monto (S/ 25.00) y sin nombre del pagador, NO aprueba ninguno
    const ambiguousYape = await signMimeMessageDkimRsaSha256({
      privateKey,
      selector: 's1',
      domain: 'notificacionesbcp.com.pe',
      from: 'avisos@notificacionesbcp.com.pe',
      to: 'pagos@suyadelivery.com',
      subject: 'Constancia de Yape - Servicio de Notificaciones BCP',
      rawBody: 'Servicio de Notificaciones BCP: Yape recibido por S/ 25.00\r\nNúmero de operación: 11220000\r\n',
    });
    const ambiguousRes = await engine.processStaticQrAutoCloudEmail({
      restaurantId: 'rest-suya',
      messageId: 'msg-yape-ambig',
      subject: 'Constancia de Yape - Servicio de Notificaciones BCP',
      rawBodyText: ambiguousYape.rawBody,
      rawHeaders: ambiguousYape.rawHeaders,
      authenticationResultsHeader:
        'mx.cloudflare.net; spf=pass; dkim=pass header.d=notificacionesbcp.com.pe; dmarc=pass',
      resolvePublicKeySpki,
    });
    expect(ambiguousRes.ok).toBe(false);
    expect(ambiguousRes.code).toBe('attempt_not_found');
    expect(engine.getOrder('ord-yape-1')?.status).toBe('pending_payment');
    expect(engine.getOrder('ord-yape-2')?.status).toBe('pending_payment');

    // 5b. Cuando el correo incluye el nombre del pagador ("Carlos Mendoza"), desambigua y aprueba solo ord-yape-2
    const signedYapeCarlos = await signMimeMessageDkimRsaSha256({
      privateKey,
      selector: 's1',
      domain: 'notificacionesbcp.com.pe',
      from: 'avisos@notificacionesbcp.com.pe',
      to: 'pagos@suyadelivery.com',
      subject: 'Constancia de Yape - Servicio de Notificaciones BCP',
      rawBody: 'Servicio de Notificaciones BCP: Yape recibido por S/ 25.00\r\nNúmero de operación: 11223344\r\nEnviado por: Carlos Mendoza Ruiz\r\n',
    });
    const resYape = await engine.processStaticQrAutoCloudEmail({
      restaurantId: 'rest-suya',
      messageId: 'msg-yape-1',
      subject: 'Constancia de Yape - Servicio de Notificaciones BCP',
      rawBodyText: signedYapeCarlos.rawBody,
      rawHeaders: signedYapeCarlos.rawHeaders,
      authenticationResultsHeader:
        'mx.cloudflare.net; spf=pass; dkim=pass header.d=notificacionesbcp.com.pe; dmarc=pass',
      resolvePublicKeySpki,
    });
    expect(resYape.ok).toBe(true);
    expect(engine.getOrder('ord-yape-2')?.status).toBe('confirmed');
    expect(engine.getOrder('ord-yape-1')?.status).toBe('pending_payment');

    // Verificar generación y síntesis directa de QR EMVCo comercial estándar (Tag 26, orden ascendente)
    const baseEmvco = buildBaseMerchantEmvcoQr({
      walletNetwork: 'yape',
      merchantAccountId: '987654321',
      merchantName: 'EL TIO JHONY',
    });
    const synthesized = synthesizeDynamicEmvcoQrFromStatic({
      staticQrPayload: baseEmvco,
      amountCents: 1990,
      checkoutReference: 'SUYA-TJ-99',
      allowSyntheticMutation: true,
    });
    const preserved = synthesizeDynamicEmvcoQrFromStatic({ staticQrPayload: baseEmvco, amountCents: 1990, checkoutReference: 'SUYA-TJ-99' });
    expect(preserved.qrPayload).toBe(baseEmvco);
    expect(preserved.isEmvcoDynamic).toBe(false);
    const parsedMerchantDyn = parseEmvcoQr(synthesized.qrPayload);
    expect(synthesized.isEmvcoDynamic).toBe(true);
    expect(synthesized.amountPenFormatted).toBe('19.90');
    expect(parsedMerchantDyn.crcValid).toBe(true);
    expect(parsedMerchantDyn.fields.map((field) => field.tag)).toEqual([
      '00',
      '01',
      '26',
      '52',
      '53',
      '54',
      '58',
      '59',
      '60',
      '62',
      '63',
    ]);

    // Los QR personales Yape (Tag 39) y los QR firmados Lemon Cash / Dale (Tag 26 + Tag 80) deben conservarse
    // intactos para evitar errores de lectura en Yape/Plin/CCE al escanear
    const syntheticTag39Static =
      '0002010102113932111122223333444455556666777788885204561153036045802PE5906YAPERO6004Lima6304A5E0';
    expect(parseEmvcoQr(syntheticTag39Static).crcValid).toBe(true);
    const synthesizedTag39 = synthesizeDynamicEmvcoQrFromStatic({
      staticQrPayload: syntheticTag39Static,
      amountCents: 2499,
      checkoutReference: 'SUYA-TAG39',
    });
    expect(synthesizedTag39.isEmvcoDynamic).toBe(false);
    expect(synthesizedTag39.qrPayload).toBe(syntheticTag39Static);
    expect(synthesizedTag39.amountPenFormatted).toBe('24.99');

    const syntheticLemonStatic =
      '000201010211262800028001189030220260418000015204482953036045802PE5910Lemon Cash6004Lima80240003ID10113TESTTOKEN001=630421D5';
    expect(parseEmvcoQr(syntheticLemonStatic).crcValid).toBe(true);
    expect(detectStaticQrWalletNetwork(syntheticLemonStatic)).toBe('lemon');
    const synthesizedLemon = synthesizeDynamicEmvcoQrFromStatic({
      staticQrPayload: syntheticLemonStatic,
      amountCents: 103,
      checkoutReference: 'SUYA-LEMON01',
    });
    expect(synthesizedLemon.isEmvcoDynamic).toBe(false);
    expect(synthesizedLemon.qrPayload).toBe(syntheticLemonStatic);
    expect(synthesizedLemon.amountPenFormatted).toBe('1.03');
    expect(TRUSTED_PERUVIAN_FINANCIAL_DKIM_DOMAINS.has('lemon.me')).toBe(true);
    expect(TRUSTED_PERUVIAN_FINANCIAL_DKIM_DOMAINS.has('dale.pe')).toBe(true);
    expect(TRUSTED_PERUVIAN_FINANCIAL_DKIM_DOMAINS.has('gmoney.pe')).toBe(true);
    expect(TRUSTED_PERUVIAN_FINANCIAL_DKIM_DOMAINS.has('gmoney.com.pe')).toBe(true);
  });
});

describe('UI Cliente y Panel "Configuración de cobros — SUYA Delivery" (Fases 6 y 7)', () => {
  it('permite pagar automáticamente con código de aprobación Yape de 6 dígitos (Mercado Pago)', async () => {
    serviceMocks.chargeYapeOtp.mockResolvedValueOnce('mp_tx_live_999111');
    const mpIntent: PaymentIntent = {
      attemptId: 'attempt-mp-1',
      orderId: 'order-mp-1',
      method: 'yape',
      status: 'pending',
      amount: 35,
      currency: 'PEN',
      checkoutReference: 'SUYA-MP35',
      expiresAt: '2099-01-01T00:00:00.000Z',
      provider: 'mercado_pago',
      providerReference: null,
      qrPayload: null,
    };
    const sampleOrder: Pick<
      Order,
      'id' | 'code' | 'storeName' | 'total' | 'paymentMethod' | 'paymentIntent' | 'status'
    > = {
      id: 'order-mp-1',
      code: 'MP35',
      storeName: 'El Tío Jhony',
      total: 35,
      paymentMethod: 'yape',
      paymentIntent: mpIntent,
      status: 'pending_payment',
    };

    render(<PaymentInstructions order={sampleOrder} />);

    fireEvent.change(screen.getByLabelText('Celular afiliado a Yape'), {
      target: { value: '987654321' },
    });
    fireEvent.change(screen.getByLabelText('Código de aprobación Yape (6 dígitos)'), {
      target: { value: '654321' },
    });

    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: /Confirmar pago de S\/ 35\.00 con Yape/i }),
      );
    });

    expect(serviceMocks.chargeYapeOtp).toHaveBeenCalledWith(
      mpIntent,
      '987654321',
      '654321',
      null,
    );
    expect(await screen.findByText('Pago confirmado')).toBeInTheDocument();
  });

  it('valida credenciales, ejecuta prueba segura e informa que el QR estático requiere revisión', async () => {
    serviceMocks.listGatewayConfigs.mockResolvedValue([]);
    serviceMocks.listReconciliationExceptions.mockResolvedValue([]);
    serviceMocks.testGatewayConnection.mockResolvedValue({
      ok: true,
      message: 'Conexión verificada con Mercado Pago Perú API.',
    });
    serviceMocks.recordGatewayTestResult.mockResolvedValue(true);
    serviceMocks.saveGatewayConfig.mockImplementation(async (input) => ({
      id: 'cfg-1',
      restaurantId: input.restaurantId,
      provider: input.provider,
      environment: input.environment,
      active: input.active,
      verificationMode: input.provider === 'static_qr' ? 'assisted_manual' : 'automatic_cloud',
      accountLabel: input.accountLabel,
      publicKey: input.publicKey ?? null,
      merchantCode: null,
      qrPayload: input.qrPayload ?? null,
      hasSecretKey: true,
      secretKeyLast4: '9999',
      hasWebhookSecret: true,
      webhookSecretLast4: '8888',
      connectionStatus: 'connected',
      lastVerifiedAt: new Date().toISOString(),
      lastSafeTestPassed: true,
      lastSafeTestAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));

    render(
      <PaymentGatewayConfigPanel restaurantId="tio-jhony" restaurantName="El Tío Jhony" />,
    );

    expect(
      screen.getByRole('heading', { name: 'Configuración de cobros — SUYA Delivery' }),
    ).toBeInTheDocument();

    // El botón Activar método de cobro inicia deshabilitado hasta tener credenciales y prueba segura
    const activateButton = screen.getByRole('button', { name: 'Activar método de cobro' });
    expect(activateButton).toBeDisabled();

    // Cambiar a QR estático muestra la advertencia y precarga el QR oficial de Lemon por defecto
    const providerSelect = screen.getByLabelText('Método receptor de cobros');
    fireEvent.change(providerSelect, { target: { value: 'static_qr' } });
    expect(
      await screen.findByText(/Un QR estático solo permite recibir dinero/i),
    ).toBeInTheDocument();
    const qrInput = screen.getByLabelText(
      'Payload EMVCo o URL pública del QR estático receptor',
    ) as HTMLTextAreaElement;
    expect(qrInput.value).toBe(PRELOADED_STATIC_QR_PRESETS.lemon.qrPayload);
    fireEvent.click(screen.getByRole('button', { name: 'Precargar QR Yape (Adriano)' }));
    expect(qrInput.value).toBe(PRELOADED_STATIC_QR_PRESETS.yape.qrPayload);

    // Volver a Mercado Pago, completar credenciales, comprobar conexión y ejecutar prueba segura
    fireEvent.change(providerSelect, { target: { value: 'mercado_pago' } });
    fireEvent.change(screen.getByLabelText('Public Key oficial'), {
      target: { value: 'TEST-12345678-abcd-ef01' },
    });
    fireEvent.change(screen.getByLabelText('Secret Key o Access Token'), {
      target: { value: 'TEST-99887766-token' },
    });
    fireEvent.change(screen.getByLabelText('Webhook Signing Secret'), {
      target: { value: 'wh_secret_mp_2026_test' },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Comprobar conexión' }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Realizar una prueba segura' }));
    });

    await waitFor(() =>
      expect(
        screen.getByText(/Resultado de la prueba segura/i),
      ).toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: 'Activar método de cobro' })).toBeEnabled();

    // Validación contra llaves secretas pegadas en el campo público
    const badValidation = validateGatewayConfigInput({
      restaurantId: 'tio-jhony',
      provider: 'culqi',
      environment: 'sandbox',
      accountLabel: 'Caja',
      publicKey: 'sk_test_never_public',
      secretKey: 'sk_test_valid',
      webhookSecret: 'wh_valid',
      active: false,
    });
    expect(badValidation.valid).toBe(false);
  });

  it('muestra QR AutoCloud sintetizado y espera confirmación DKIM sin pedir código Android Observer en static_qr', () => {
    const baseQr = buildBaseMerchantEmvcoQr({
      walletNetwork: 'yape',
      merchantAccountId: '987654321',
      merchantName: 'EL TIO JHONY',
    });
    const staticAutoIntent: PaymentIntent = {
      attemptId: 'attempt-static-1',
      orderId: 'order-static-1',
      method: 'yape',
      status: 'pending',
      amount: 24.99,
      currency: 'PEN',
      checkoutReference: 'SUYA-AUTO2499',
      expiresAt: '2099-01-01T00:00:00.000Z',
      provider: 'static_qr',
      providerReference: null,
      qrPayload: baseQr,
      receiverLabel: 'El Tío Jhony AutoCloud',
    };
    render(
      <PaymentInstructions
        order={{
          id: 'order-static-1',
          code: 'AUTO2499',
          storeName: 'El Tío Jhony',
          total: 25,
          paymentMethod: 'yape',
          paymentIntent: staticAutoIntent,
          status: 'pending_payment',
        }}
      />,
    );

    expect(screen.getByText('Escanea el QR del negocio')).toBeInTheDocument();
    expect(
      screen.getByText(/Confirmación AutoCloud en curso \(Yape \/ Plin \/ Lemon \/ IzipayYA\)/i),
    ).toBeInTheDocument();
    expect(screen.getByText('SUYA-AUTO2499')).toBeInTheDocument();
    expect(screen.queryByLabelText('Código de seguridad de Yape')).not.toBeInTheDocument();
  });

  it('abre directo en vista simple de QR cuando defaultProvider es static_qr sin tabla técnica de comisiones', () => {
    render(
      <PaymentGatewayConfigPanel
        restaurantId="tio-jhony"
        restaurantName="El Tío Jhony"
        defaultProvider="static_qr"
      />,
    );

    expect(screen.getByText('2. Elige o sube tu QR')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Precargar QR Lemon (Adriano)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Precargar QR Yape (Adriano)' })).toBeInTheDocument();
    expect(screen.getByText('Vista previa del QR')).toBeInTheDocument();
    expect(screen.queryByText(/Costo real por pedido/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Activar método de cobro' })).toBeEnabled();
  });
});
