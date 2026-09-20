import { supabase } from '@/lib/supabase/client';

export interface IzipayCheckoutSession {
  authorization: string;
  keyRSA: string;
  transactionId: string;
  merchantCode: string;
  orderNumber: string;
  urlIPN: string;
  order: {
    orderNumber: string;
    currency: 'PEN';
    amount: string;
    processType: 'AT';
    merchantBuyerId: string;
    dateTimeTransaction: string;
    payMethod: 'QR';
  };
  billing: {
    firstName: string;
    lastName: string;
    email: string;
    phoneNumber: string;
    street: string;
    city: string;
    state: string;
    country: string;
    postalCode: string;
    documentType: 'DNI';
    document: string;
  };
}

export interface IzipayPaymentIntent {
  attemptId: string;
  orderId: string;
  method: 'yape';
  status: string;
  amount: number;
  currency: 'PEN';
  checkoutReference: string;
  expiresAt: string;
  provider: 'izipay';
  providerReference: string;
}

export interface IzipayPaymentSession {
  paymentIntent: IzipayPaymentIntent;
  izipaySession: IzipayCheckoutSession;
}

export interface CreateIzipayPaymentInput {
  orderId: string;
  guestAccessToken?: string;
  customerEmail?: string;
}

export function isIzipayGatewayEnabled(): boolean {
  return import.meta.env.VITE_IZIPAY_GATEWAY_ENABLED === 'true';
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Respuesta Izipay incompleta: falta ${field}.`);
  }
  return value;
}

function amount(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0)
    throw new Error('Respuesta Izipay devolvió un monto inválido.');
  return parsed;
}

/** Valida forma de respuesta sin guardar ni imprimir credenciales del checkout. */
export function parseIzipayPaymentSession(value: unknown): IzipayPaymentSession {
  const root = record(value);
  const intent = record(root?.paymentIntent);
  const session = record(root?.izipaySession);
  const sessionOrder = record(session?.order);
  const billing = record(session?.billing);
  if (!root || !intent || !session || !sessionOrder || !billing) {
    throw new Error('Izipay devolvió una sesión de pago inválida.');
  }

  return {
    paymentIntent: {
      attemptId: text(intent.attempt_id, 'paymentIntent.attempt_id'),
      orderId: text(intent.order_id, 'paymentIntent.order_id'),
      method: 'yape',
      status: text(intent.status, 'paymentIntent.status'),
      amount: amount(intent.amount),
      currency: 'PEN',
      checkoutReference: text(intent.checkout_reference, 'paymentIntent.checkout_reference'),
      expiresAt: text(intent.expires_at, 'paymentIntent.expires_at'),
      provider: 'izipay',
      providerReference: text(intent.provider_reference, 'paymentIntent.provider_reference'),
    },
    izipaySession: {
      authorization: text(session.authorization, 'izipaySession.authorization'),
      keyRSA: text(session.keyRSA, 'izipaySession.keyRSA'),
      transactionId: text(session.transactionId, 'izipaySession.transactionId'),
      merchantCode: text(session.merchantCode, 'izipaySession.merchantCode'),
      orderNumber: text(session.orderNumber, 'izipaySession.orderNumber'),
      urlIPN: text(session.urlIPN, 'izipaySession.urlIPN'),
      order: {
        orderNumber: text(sessionOrder.orderNumber, 'izipaySession.order.orderNumber'),
        currency: 'PEN',
        amount: text(sessionOrder.amount, 'izipaySession.order.amount'),
        processType: 'AT',
        merchantBuyerId: text(sessionOrder.merchantBuyerId, 'izipaySession.order.merchantBuyerId'),
        dateTimeTransaction: text(
          sessionOrder.dateTimeTransaction,
          'izipaySession.order.dateTimeTransaction',
        ),
        payMethod: 'QR',
      },
      billing: {
        firstName: text(billing.firstName, 'izipaySession.billing.firstName'),
        lastName: text(billing.lastName, 'izipaySession.billing.lastName'),
        email: text(billing.email, 'izipaySession.billing.email'),
        phoneNumber: text(billing.phoneNumber, 'izipaySession.billing.phoneNumber'),
        street: text(billing.street, 'izipaySession.billing.street'),
        city: text(billing.city, 'izipaySession.billing.city'),
        state: text(billing.state, 'izipaySession.billing.state'),
        country: text(billing.country, 'izipaySession.billing.country'),
        postalCode: text(billing.postalCode, 'izipaySession.billing.postalCode'),
        documentType: 'DNI',
        document: text(billing.document, 'izipaySession.billing.document'),
      },
    },
  };
}

export async function createIzipayPaymentSession(
  input: CreateIzipayPaymentInput,
): Promise<IzipayPaymentSession> {
  if (!supabase) throw new Error('Supabase no está configurado para pagos Izipay.');
  const { data, error } = await supabase.functions.invoke('create-izipay-payment', {
    body: input,
  });
  if (error) throw new Error(error.message || 'No pudimos preparar el pago Izipay.');
  return parseIzipayPaymentSession(data);
}
