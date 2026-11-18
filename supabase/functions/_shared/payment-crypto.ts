import { object, PaymentError, type GatewayCredentials } from './payment-provider.ts';

function encode(bytes: Uint8Array): string {
  return btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''));
}
function decode(value: string): Uint8Array<ArrayBuffer> {
  try { return Uint8Array.from(atob(value), (character) => character.charCodeAt(0)); }
  catch { throw new PaymentError('La configuración segura de pagos es inválida.', 503); }
}
async function masterKey(value: string): Promise<CryptoKey> {
  const bytes = decode(value);
  if (bytes.length !== 32) throw new PaymentError('Falta la clave de cifrado del servidor de pagos.', 503);
  return crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function encryptCredentials(credentials: GatewayCredentials, key: string, context: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(context) }, await masterKey(key), new TextEncoder().encode(JSON.stringify(credentials)));
  return JSON.stringify({ v: 1, iv: encode(iv), ciphertext: encode(new Uint8Array(ciphertext)) });
}

export async function decryptCredentials(encrypted: string, key: string, context: string): Promise<GatewayCredentials> {
  try {
    const envelope = object(JSON.parse(encrypted));
    if (envelope.v !== 1 || typeof envelope.iv !== 'string' || typeof envelope.ciphertext !== 'string') throw new Error('invalid');
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: decode(envelope.iv), additionalData: new TextEncoder().encode(context) }, await masterKey(key), decode(envelope.ciphertext));
    const credentials = object(JSON.parse(new TextDecoder().decode(plaintext)));
    if (typeof credentials.accessToken !== 'string' || typeof credentials.webhookSecret !== 'string') throw new Error('invalid');
    return { accessToken: credentials.accessToken, webhookSecret: credentials.webhookSecret };
  } catch { throw new PaymentError('No se pudieron abrir las credenciales de pagos. Revisa la clave del servidor.', 503); }
}

/** El manifiesto oficial firma data.id de la URL, nunca el cuerpo de la notificación. */
export async function verifyMercadoPagoSignature(request: Request, secret: string): Promise<boolean> {
  const url = new URL(request.url);
  const ids = url.searchParams.getAll('data.id');
  const requestId = request.headers.get('x-request-id') ?? '';
  const signature = request.headers.get('x-signature') ?? '';
  if (ids.length !== 1 || !/^\d{1,32}$/.test(ids[0]) || !/^[A-Za-z0-9_-]{1,160}$/.test(requestId)) return false;
  const parts = signature.split(',').map((part) => part.trim().split('='));
  const timestamps = parts.filter(([name]) => name === 'ts');
  const hashes = parts.filter(([name]) => name === 'v1');
  if (timestamps.length !== 1 || hashes.length !== 1) return false;
  const timestamp = timestamps[0][1] ?? '';
  const hash = hashes[0][1] ?? '';
  if (!/^\d{10,13}$/.test(timestamp) || !/^[0-9a-f]{64}$/i.test(hash)) return false;
  const milliseconds = timestamp.length <= 10 ? Number(timestamp) * 1000 : Number(timestamp);
  if (milliseconds > Date.now() + 300_000) return false;
  // No caduca una entrega antigua: MP reintenta durante días. El GET actual a la API,
  // más la identidad transaccional única en PostgreSQL, hacen inocua su repetición.
  const manifest = `id:${ids[0].toLowerCase()};request-id:${requestId};ts:${timestamp};`;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const hashBytes = Uint8Array.from(hash.match(/../g) ?? [], (pair) => parseInt(pair, 16));
  return crypto.subtle.verify('HMAC', key, hashBytes, new TextEncoder().encode(manifest));
}
