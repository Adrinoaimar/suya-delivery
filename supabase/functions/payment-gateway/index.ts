import { automaticHandler } from './automatic.ts';
import { createGatewayHandler } from '../_shared/payment-handlers.ts';
import { readPaymentRuntime } from '../_shared/payment-runtime.ts';

const legacyHandler = createGatewayHandler(readPaymentRuntime((key) => Deno.env.get(key)));

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return legacyHandler(request);
  let action = '';
  try { action = (await request.clone().json()).action ?? ''; } catch { return legacyHandler(request); }
  return ['test_connection', 'charge_yape_otp', 'create_dynamic_qr', 'sync_gmail_autocloud'].includes(action)
    ? automaticHandler(request) : legacyHandler(request);
});
