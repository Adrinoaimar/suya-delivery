#!/usr/bin/env node

const environment = process.env.IZIPAY_ENVIRONMENT === 'production' ? 'production' : 'sandbox';
const apiBase = environment === 'production'
  ? 'https://api-pw.izipay.pe'
  : 'https://sandbox-api-pw.izipay.pe';
const tokenUrl = process.env.IZIPAY_TOKEN_URL?.trim() || `${apiBase}/security/v1/Token/Generate`;
const orderQueryUrl = process.env.IZIPAY_ORDER_QUERY_URL?.trim()
  || `${apiBase}/orderinfo/v1/Transaction/Search`;
const merchantCode = process.env.IZIPAY_MERCHANT_CODE?.trim();
const publicKey = process.env.IZIPAY_PUBLIC_KEY?.trim();
const orderNumber = (process.env.IZIPAY_SMOKE_ORDER_NUMBER?.trim() || 'SUYASMOKE00001').slice(0, 15);
const amount = Number(process.env.IZIPAY_SMOKE_AMOUNT || '1.00');

if (!merchantCode || !publicKey) {
  throw new Error('Configura IZIPAY_MERCHANT_CODE e IZIPAY_PUBLIC_KEY para ejecutar la prueba sandbox.');
}
if (!/^[A-Za-z0-9]{5,15}$/.test(orderNumber)) {
  throw new Error('IZIPAY_SMOKE_ORDER_NUMBER debe ser alfanumérico de 5 a 15 caracteres.');
}
if (!Number.isFinite(amount) || amount <= 0) throw new Error('IZIPAY_SMOKE_AMOUNT debe ser positivo.');

const transactionId = `SUYA${crypto.randomUUID().replaceAll('-', '').slice(0, 28).toUpperCase()}`;
const response = await fetch(tokenUrl, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Accept: 'application/json', transactionId },
  body: JSON.stringify({
    requestSource: 'ECOMMERCE',
    merchantCode,
    orderNumber,
    publicKey,
    amount: amount.toFixed(2),
  }),
  signal: AbortSignal.timeout(15_000),
});
const tokenBody = await response.json().catch(() => ({}));
const token = tokenBody?.response?.token ?? tokenBody?.token;
if (!response.ok || tokenBody?.code !== '00' || typeof token !== 'string' || !token) {
  throw new Error(`Izipay Token/Generate respondió HTTP ${response.status}, código ${tokenBody?.code ?? 'desconocido'}.`);
}
console.log(`Token/Generate OK (${environment}); transactionId=${transactionId}; orderNumber=${orderNumber}.`);

const searchResponse = await fetch(orderQueryUrl, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
    transactionId,
  },
  body: JSON.stringify({ merchantCode, numberOrden: orderNumber, language: 'ESP' }),
  signal: AbortSignal.timeout(15_000),
});
const searchBody = await searchResponse.json().catch(() => ({}));
const friendlyMessage = String(searchBody?.response?.result?.messageFriendly ?? '').toLowerCase();
const nonexistentSmokeOrder = searchResponse.status === 403 && friendlyMessage.includes('no existe');
if (!searchResponse.ok && !nonexistentSmokeOrder) {
  throw new Error(`Izipay Transaction/Search respondió HTTP ${searchResponse.status}.`);
}
console.log(
  nonexistentSmokeOrder
    ? 'Transaction/Search OK: sandbox respondió “Transacción No Existe” para la orden sintética.'
    : `Transaction/Search OK (HTTP ${searchResponse.status}).`,
);
