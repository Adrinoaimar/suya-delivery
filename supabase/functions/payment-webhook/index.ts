import { automaticHandler } from './automatic.ts';
import { createWebhookHandler } from '../_shared/payment-handlers.ts';
import { readPaymentRuntime } from '../_shared/payment-runtime.ts';

const legacyHandler = createWebhookHandler(readPaymentRuntime((key) => Deno.env.get(key)));

Deno.serve((request) => {
  const url = new URL(request.url);
  return url.searchParams.has('restaurant_id') && url.searchParams.has('version')
    ? legacyHandler(request) : automaticHandler(request);
});
