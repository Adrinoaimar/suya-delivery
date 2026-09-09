export type WalletProvider = 'yape' | 'lemon' | 'plin' | 'mercado_pago' | 'generic';
export type WalletCurrency = 'PEN' | 'ARS' | 'USD';

export interface WalletNotificationInput {
  title?: string;
  text?: string;
  bigText?: string;
  packageName?: string;
  postedAt?: string;
}

export interface WalletObservedPayment {
  provider: WalletProvider;
  source: string;
  verification: 'unverified';
  amountCents: number;
  currency: WalletCurrency;
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

const MONEY_PATTERN = /(s\/?|s\.|pen|ars|usd|us\$|\$)\s*([0-9]{1,3}(?:[.,][0-9]{3})*(?:[.,][0-9]{2})?)/gi;
const CODE_PATTERN = /(?:c[oó]digo(?:\s+(?:de\s+)?(?:seguridad|operaci[oó]n|aprobaci[oó]n))?|operaci[oó]n|referencia|reference|ref\.?|id(?:\s+de)?\s+(?:transferencia|operaci[oó]n))\b\s*[:#-]?\s*([a-z0-9-]{3,20})/i;

function normalizeAmount(value: string): number | null {
  const compact = value.replace(/\s/g, '');
  const lastComma = compact.lastIndexOf(',');
  const lastDot = compact.lastIndexOf('.');
  const decimalIndex = Math.max(lastComma, lastDot);
  const hasDecimal = decimalIndex >= 0 && compact.length - decimalIndex - 1 === 2;
  const integerPart = (hasDecimal ? compact.slice(0, decimalIndex) : compact).replace(/[.,]/g, '');
  const decimalPart = hasDecimal ? compact.slice(decimalIndex + 1) : '00';
  const amount = Number(`${integerPart}.${decimalPart}`);
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) : null;
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
  return [input.title, input.text, input.bigText].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

function matchesAdapter(input: WalletNotificationInput, adapter: WalletNotificationAdapter, text: string): boolean {
  if (!input.packageName || !adapter.packageNames.includes(input.packageName)) return false;
  if (!adapter.keywords.length) return true;
  const lower = text.toLocaleLowerCase('es-PE');
  return adapter.keywords.some((keyword) => lower.includes(keyword.toLocaleLowerCase('es-PE')));
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

  MONEY_PATTERN.lastIndex = 0;
  const amountMatch = MONEY_PATTERN.exec(text);
  if (!amountMatch) return null;
  const amountCents = normalizeAmount(amountMatch[2]);
  const currency = currencyForPrefix(amountMatch[1]);
  if (amountCents === null || !adapter.currencies.includes(currency)) return null;

  const codeMatch = text.match(CODE_PATTERN);
  const observedAt = input.postedAt ?? new Date().toISOString();
  const stable = `${adapter.source}|${input.packageName}|${observedAt}|${amountCents}|${currency}|${codeMatch?.[1] ?? ''}`;

  return {
    provider: adapter.provider,
    source: adapter.source,
    verification: 'unverified',
    amountCents,
    currency,
    code: codeMatch?.[1] ?? null,
    observedAt,
    fingerprint: fingerprint(adapter.provider, stable),
  };
}
