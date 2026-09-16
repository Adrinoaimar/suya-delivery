export type WalletProvider = 'yape' | 'lemon' | 'plin' | 'mercado_pago' | 'generic';
export type WalletCurrency = 'PEN' | 'ARS' | 'USD';

export interface WalletNotificationInput {
  title?: string;
  text?: string;
  bigText?: string;
  subText?: string;
  infoText?: string;
  summaryText?: string;
  packageName?: string;
  /** Stable local notification identifier; it is hashed into the fingerprint. */
  notificationKey?: string;
  postedAt?: string;
}

export interface WalletObservedPayment {
  provider: WalletProvider;
  source: string;
  verification: 'unverified';
  amountCents: number;
  currency: WalletCurrency;
  senderName: string | null;
  code: string | null;
  observedAt: string;
  fingerprint: string;
}

export interface WalletNotificationAdapter {
  provider: WalletProvider;
  source: string;
  packageNames: readonly string[];
  keywords: readonly string[];
  currencies: readonly WalletCurrency[];
}

/** Package names verified from the official Google Play listing or existing Yape lab. */
export const YAPE_NOTIFICATION_ADAPTER: WalletNotificationAdapter = {
  provider: 'yape',
  source: 'yape_notification',
  packageNames: ['com.bcp.innovacxion.yapeapp', 'com.bcp.yape.app'],
  keywords: ['yape', 'recib'],
  currencies: ['PEN'],
};

/** Lemon Android package verified from its official Google Play listing. */
export const LEMON_NOTIFICATION_ADAPTER: WalletNotificationAdapter = {
  provider: 'lemon',
  source: 'lemon_notification',
  packageNames: ['com.applemoncash'],
  keywords: ['lemon', 'recib', 'received', 'transfer'],
  currencies: ['PEN', 'ARS', 'USD'],
};

/** Plin is delivered through participating bank apps; package IDs are official listings. */
export const PLIN_NOTIFICATION_ADAPTER: WalletNotificationAdapter = {
  provider: 'plin',
  source: 'plin_notification',
  packageNames: ['com.bbva.nxt_peru', 'pe.com.interbank.mobilebanking', 'pe.com.scotiabank.blpm.android.client'],
  keywords: ['plin'],
  currencies: ['PEN'],
};

/** Mercado Pago Android package verified from its official Google Play listing. */
export const MERCADO_PAGO_NOTIFICATION_ADAPTER: WalletNotificationAdapter = {
  provider: 'mercado_pago',
  source: 'mercado_pago_notification',
  packageNames: ['com.mercadopago.wallet'],
  keywords: ['mercado pago', 'mercadopago', 'recib', 'received', 'transfer'],
  currencies: ['PEN'],
};

export const DEFAULT_WALLET_NOTIFICATION_ADAPTERS: readonly WalletNotificationAdapter[] = [
  YAPE_NOTIFICATION_ADAPTER,
  LEMON_NOTIFICATION_ADAPTER,
  PLIN_NOTIFICATION_ADAPTER,
  MERCADO_PAGO_NOTIFICATION_ADAPTER,
];

const MONEY_PATTERN = /(?<![\p{L}\d+-])(?:s\/?|s\.|pen|ars|usd|us\$|\$)\s*((?:\d{1,3}(?:[.,]\d{3})+|\d+)(?:[.,]\d{2})?)(?!\d)/giu;
const CODE_PATTERN = /(?:c[oó]digo(?:\s+(?:de\s+)?(?:seguridad|operaci[oó]n|aprobaci[oó]n))?|operaci[oó]n|referencia|reference|ref\.?|id(?:\s+de)?\s+(?:transferencia|operaci[oó]n))\b\s*[:#-]?\s*([a-z0-9-]{3,64})/i;
const SENDER_PATTERN = /(?:^|\b)(?:de|from|remitente|sender)\s*[:#-]?\s*(?!(?:seguridad|operaci[oó]n|transferencia|pago|payment|referencia|reference)\b)([\p{L}][\p{L}'-]*(?:\s+[\p{L}][\p{L}'-]*){0,4})(?=\s*(?:[.,;:·|]|$|\b(?:te\b|envi[oó]|sent\b|por\b|monto\b|amount\b|operaci[oó]n\b|c[oó]digo\b|ref(?:erencia)?\b|s\/?|pen\b|usd\b|ars\b)))|(?:^|\b)([\p{L}][\p{L}'-]*(?:\s+[\p{L}][\p{L}'-]*){0,4})(?=\s+te\s+(?:envi[oó](?=\s|$)|sent\b))/iu;
const INCOMING_NOTIFICATION_PATTERN = /(?:^|[^\p{L}])(?:recib(?:e|es|iste|i[oó]|ido|ieron|imos)|received|payment\s+received|te\s+envi[oó]|you\s+(?:received|got)|dep[oó]sito\s+(?:recibido|received)|transferencia\s+recibida)(?=$|[^\p{L}])/iu;
const NON_INCOMING_NOTIFICATION_PATTERN = /(?:^|[^\p{L}])(?:saldo|reversi[oó]n|devoluci[oó]n|promoci[oó]n|oferta|solicitud|solicitaste|enviaste|enviado|enviada|sent|failed|fall[oó])(?=$|[^\p{L}])/iu;
const MAX_OBSERVED_AMOUNT_CENTS = 100_000_000;

function isGroupedInteger(value: string): boolean {
  const separators = [...value].filter((character) => character === ',' || character === '.');
  if (!separators.length || new Set(separators).size !== 1) return false;
  const groups = value.split(separators[0]);
  return groups.length >= 2
    && groups[0].length >= 1
    && groups[0].length <= 3
    && groups.slice(1).every((group) => /^\d{3}$/.test(group));
}

function normalizeAmount(value: string): number | null {
  const compact = value.replace(/\s/g, '');
  const lastComma = compact.lastIndexOf(',');
  const lastDot = compact.lastIndexOf('.');
  const decimalIndex = Math.max(lastComma, lastDot);
  const hasDecimal = decimalIndex >= 0 && compact.length - decimalIndex - 1 === 2;
  const integerSource = hasDecimal ? compact.slice(0, decimalIndex) : compact;
  if (hasDecimal) {
    const decimalSeparator = compact[decimalIndex];
    if (!/^\d+$/.test(integerSource)) {
      if (!isGroupedInteger(integerSource)) return null;
      const groupingSeparator = integerSource.match(/[.,]/)?.[0];
      if (groupingSeparator === decimalSeparator) return null;
    }
  } else if (!/^\d+$/.test(integerSource) && !isGroupedInteger(integerSource)) {
    return null;
  }
  const integerPart = integerSource.replace(/[.,]/g, '');
  const decimalPart = hasDecimal ? compact.slice(decimalIndex + 1) : '00';
  const amount = Number(`${integerPart}.${decimalPart}`);
  const amountCents = Math.round(amount * 100);
  return Number.isSafeInteger(amountCents) && amountCents > 0 && amountCents <= MAX_OBSERVED_AMOUNT_CENTS
    ? amountCents
    : null;
}

function currencyForPrefix(prefix: string): WalletCurrency {
  const normalized = prefix.toLocaleUpperCase('es-PE');
  if (normalized === 'S/' || normalized === 'S.' || normalized === 'PEN') return 'PEN';
  if (normalized === 'ARS') return 'ARS';
  return 'USD';
}

function fingerprint(prefix: string, value: string): string {
  let hash = 2166136261;
  for (const char of value) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `${prefix}-${(hash >>> 0).toString(16)}`;
}

function combinedText(input: WalletNotificationInput): string {
  return [input.title, input.text, input.bigText, input.subText, input.infoText, input.summaryText]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function senderName(text: string): string | null {
  const match = text.match(SENDER_PATTERN);
  const value = (match?.[1] ?? match?.[2])?.replace(/\s+/g, ' ').trim() ?? '';
  return value.length >= 2 && value.length <= 120 ? value : null;
}

function senderNameFromFields(input: WalletNotificationInput, text: string): string | null {
  for (const field of [input.text, input.bigText, input.subText, input.infoText, input.summaryText, input.title]) {
    const candidate = field ? senderName(field.replace(/\s+/g, ' ').trim()) : null;
    if (candidate) return candidate;
  }
  return senderName(text);
}

function matchesAdapter(input: WalletNotificationInput, adapter: WalletNotificationAdapter, text: string): boolean {
  if (!input.packageName || !adapter.packageNames.includes(input.packageName)) return false;
  if (!adapter.keywords.length) return true;
  const lower = text.toLocaleLowerCase('es-PE');
  return adapter.keywords.some((keyword) => lower.includes(keyword.toLocaleLowerCase('es-PE')));
}

function isIncomingNotification(text: string): boolean {
  return INCOMING_NOTIFICATION_PATTERN.test(text) && !NON_INCOMING_NOTIFICATION_PATTERN.test(text);
}

function hasMalformedAmountContinuation(text: string, end: number): boolean {
  return /^[.,]\d/.test(text.slice(end));
}

export function createGenericWalletNotificationAdapter(
  config: Omit<WalletNotificationAdapter, 'provider'> & { provider?: 'generic' },
): WalletNotificationAdapter {
  if (!config.packageNames.length) {
    throw new Error('Generic wallet adapter requires at least one verified package name');
  }
  return { ...config, provider: 'generic' };
}

export function parseWalletNotification(
  input: WalletNotificationInput,
  adapters: readonly WalletNotificationAdapter[] = DEFAULT_WALLET_NOTIFICATION_ADAPTERS,
): WalletObservedPayment | null {
  const text = combinedText(input);
  if (!text) return null;

  const adapter = adapters.find((candidate) => matchesAdapter(input, candidate, text));
  if (!adapter) return null;
  if (!isIncomingNotification(text)) return null;

  MONEY_PATTERN.lastIndex = 0;
  const amountMatch = MONEY_PATTERN.exec(text);
  if (!amountMatch) return null;
  if (hasMalformedAmountContinuation(text, amountMatch.index + amountMatch[0].length)) return null;
  const amountCents = normalizeAmount(amountMatch[1]);
  const currency = currencyForPrefix(
    amountMatch[0].slice(0, amountMatch[0].length - amountMatch[1].length).trim(),
  );
  if (amountCents === null || !adapter.currencies.includes(currency)) return null;

  const codeMatch = text.match(CODE_PATTERN);
  const observedAt = input.postedAt ?? new Date().toISOString();
  // Wallets may expand one notification later with the operation code. Keep
  // the fingerprint stable so that enrichment updates the same observation.
  const notificationKey = input.notificationKey?.trim().slice(0, 256) || observedAt;
  const stable = `${adapter.source}|${input.packageName}|${notificationKey}|${observedAt}|${amountCents}|${currency}`;

  return {
    provider: adapter.provider,
    source: adapter.source,
    verification: 'unverified',
    amountCents,
    currency,
    senderName: senderNameFromFields(input, text),
    code: codeMatch?.[1] ?? null,
    observedAt,
    fingerprint: fingerprint(adapter.provider, stable),
  };
}
