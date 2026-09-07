export interface YapeNotificationInput {
  title?: string;
  text?: string;
  bigText?: string;
  packageName?: string;
  postedAt?: string;
}

export interface YapeObservedPayment {
  source: 'yape_notification';
  verification: 'unverified';
  amountCents: number;
  currency: 'PEN';
  code: string | null;
  observedAt: string;
  fingerprint: string;
}

const YAPE_PACKAGES = new Set(['com.bcp.innovacxion.yapeapp', 'com.bcp.yape.app']);

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

function fingerprint(value: string): string {
  let hash = 2166136261;
  for (const char of value) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `yape-${(hash >>> 0).toString(16)}`;
}

export function parseYapeNotification(input: YapeNotificationInput): YapeObservedPayment | null {
  if (input.packageName && !YAPE_PACKAGES.has(input.packageName)) return null;

  const text = [input.title, input.text, input.bigText].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  if (!text) return null;

  const lower = text.toLocaleLowerCase('es-PE');
  if (!lower.includes('yape') && !lower.includes('recib')) return null;

  const amountMatch = text.match(/(?:s\/?|s\.)\s*([0-9]{1,3}(?:[.,][0-9]{3})*(?:[.,][0-9]{2})?)/i);
  const amountCents = amountMatch ? normalizeAmount(amountMatch[1]) : null;
  if (amountCents === null) return null;

  const codeMatch = text.match(/(?:c[oó]digo(?:\s+(?:de\s+)?(?:seguridad|operaci[oó]n|aprobaci[oó]n))?|operaci[oó]n)\s*[:#-]?\s*([0-9]{3,12})/i);
  const postedAt = input.postedAt ?? new Date().toISOString();
  const stable = `${input.packageName ?? 'unknown'}|${postedAt}|${amountCents}|${codeMatch?.[1] ?? ''}`;

  return {
    source: 'yape_notification',
    verification: 'unverified',
    amountCents,
    currency: 'PEN',
    code: codeMatch?.[1] ?? null,
    observedAt: postedAt,
    fingerprint: fingerprint(stable),
  };
}
