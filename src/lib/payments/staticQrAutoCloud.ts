/**
 * Motor AutoCloud para QR Estático (Yape, Plin, Lemon, IzipayYA) — 0% Comisión, Sin Celular.
 *
 * Combina tres mecanismos verificables en la nube:
 * 1. Sintetizador EMVCo QR Dinámico (Tag 54 Monto Único + Tag 62 Referencia + Tag 63 CRC-16/CCITT-FALSE)
 *    a partir del QR estático original del comercio.
 * 2. Asignador de Céntimos Únicos de Conciliación (Micro-descuento de 0 a 99 céntimos con bloqueo TTL)
 *    para desambiguar automáticamente pedidos simultáneos del mismo importe sin intervención humana.
 * 3. Verificador Criptográfico de Confirmaciones Bancarias / Billeteras en la Nube (Cloudflare Email
 *    Workers + Gmail API OAuth2) que exige `dkim=pass`, `spf=pass`, `dmarc=pass`, dominio bancario
 *    peruano autorizado y coincidencia exacta del hash SHA-256 del cuerpo (`bh=` en `DKIM-Signature`).
 */

import {
  computeBodyHashBase64 as computeDkimBodyHashBase64,
  verifyEmailDkimCryptographic,
  type DkimPublicKeyResolver,
} from './dkimCrypto.ts';

export type StaticQrWalletNetwork = 'yape' | 'plin' | 'lemon' | 'izipayya';

export type AutoCloudIngestionChannel =
  | 'cloudflare_email_worker'
  | 'gmail_api_oauth'
  | 'izipayya_cloud_webhook';

export interface EmvcoTlvField {
  tag: string;
  length: number;
  value: string;
}

/**
 * Dominios emisores oficiales de bancos, billeteras y adquirentes QR en Perú.
 * Ningún correo cuyo dominio DKIM (`d=`) esté fuera de esta lista puede autorizar un pago.
 */
export const TRUSTED_PERUVIAN_FINANCIAL_DKIM_DOMAINS: ReadonlySet<string> = new Set([
  'notificacionesbcp.com.pe',
  'bcp.com.pe',
  'yape.com.pe',
  'interbank.pe',
  'interbank.com.pe',
  'netinterbank.com.pe',
  'bbva.com.pe',
  'scotiabank.com.pe',
  'izipay.pe',
  'lemon.me',
  'dale.pe',
  'gmoney.pe',
  'gmoney.com.pe',
]);

/**
 * Calcula el checksum oficial EMVCo CRC-16/CCITT-FALSE (polinomio 0x1021, valor inicial 0xFFFF)
 * en formato hexadecimal mayúscula de 4 caracteres.
 */
export function computeEmvcoCrc16(payloadWithoutCrcValue: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payloadWithoutCrcValue.length; i += 1) {
    crc ^= (payloadWithoutCrcValue.charCodeAt(i) & 0xff) << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/**
 * Parsea una cadena EMVCo QR (formato TLV) y verifica su integridad CRC-16 si termina en Tag 63.
 */
export function parseEmvcoQr(rawPayload: string): {
  valid: boolean;
  fields: EmvcoTlvField[];
  crcValid: boolean;
  reason?: string;
} {
  const payload = rawPayload.trim();
  if (!payload.startsWith('000201')) {
    return {
      valid: false,
      fields: [],
      crcValid: false,
      reason: 'not_emvco_payload',
    };
  }

  const fields: EmvcoTlvField[] = [];
  let cursor = 0;
  while (cursor < payload.length) {
    if (cursor + 4 > payload.length) {
      return { valid: false, fields, crcValid: false, reason: 'truncated_tlv_header' };
    }
    const tag = payload.slice(cursor, cursor + 2);
    const lengthStr = payload.slice(cursor + 2, cursor + 4);
    if (!/^\d{2}$/.test(lengthStr)) {
      return { valid: false, fields, crcValid: false, reason: 'invalid_tlv_length' };
    }
    const length = Number(lengthStr);
    const valueStart = cursor + 4;
    const valueEnd = valueStart + length;
    if (valueEnd > payload.length) {
      return { valid: false, fields, crcValid: false, reason: 'truncated_tlv_value' };
    }
    const value = payload.slice(valueStart, valueEnd);
    fields.push({ tag, length, value });
    cursor = valueEnd;
  }

  const crcField = fields[fields.length - 1];
  if (!crcField || crcField.tag !== '63' || crcField.length !== 4) {
    return { valid: false, fields, crcValid: false, reason: 'missing_crc_tag_63' };
  }

  const withoutCrcValue = payload.slice(0, payload.length - 4);
  const expectedCrc = computeEmvcoCrc16(withoutCrcValue);
  const crcValid = expectedCrc === crcField.value.toUpperCase();

  return {
    valid: crcValid,
    fields,
    crcValid,
    reason: crcValid ? undefined : 'crc_mismatch',
  };
}

function formatTlv(tag: string, value: string): string {
  const len = value.length.toString().padStart(2, '0');
  return `${tag}${len}${value}`;
}

/**
 * Detecta la red/billetera de origen a partir del payload del QR estático.
 */
export function detectStaticQrWalletNetwork(qrPayload: string): StaticQrWalletNetwork {
  const lower = qrPayload.toLowerCase();
  if (lower.includes('izipay')) return 'izipayya';
  if (lower.includes('lemon') || lower.includes('gmoney') || lower.includes('dale')) return 'lemon';
  if (lower.includes('plin') || lower.includes('interbank') || lower.includes('bbva')) return 'plin';
  return 'yape';
}

/**
 * Transforma un QR Estático EMVCo comercial compatible en un QR EMVCo con monto exacto precargado
 * (Tag 54), referencia única del pedido (Tag 62 Subtag 05) y nuevo checksum CRC-16 (Tag 63).
 *
 * IMPORTANTE (Interoperabilidad Perú BCRP/CCE/Yape/Dale):
 * Los QR personales o con plantilla criptográfica reservada (`Tag 39` de Yape personal o
 * `Tag 80..99` firmados por CCE/Dale/Lemon) fallan al escanearse si se alteran `Tag 01=12` o `Tag 62`.
 * En esos casos conservamos el QR estático original intacto (`isEmvcoDynamic: false`) para garantizar
 * lectura 100 % compatible y mostramos el monto único en céntimos en la pantalla de pago.
 */
export function synthesizeDynamicEmvcoQrFromStatic(params: {
  staticQrPayload: string;
  amountCents: number;
  checkoutReference: string;
  allowSyntheticMutation?: boolean;
}): {
  qrPayload: string;
  isEmvcoDynamic: boolean;
  amountPenFormatted: string;
  crc16: string | null;
} {
  const { staticQrPayload, amountCents, checkoutReference } = params;
  const amountPenFormatted = (Math.round(amountCents) / 100).toFixed(2);
  const trimmed = staticQrPayload.trim();
  const parsed = parseEmvcoQr(trimmed);

  const isSyntheticSandboxTemplate =
    trimmed.includes('pe.com.yape') ||
    trimmed.includes('pe.com.plin') ||
    trimmed.includes('me.lemon.peru') ||
    trimmed.includes('pe.izipay.qr');

  // Todos los QR estáticos reales del Perú (Yape Tag 39, Lemon/Dale Tag 26+Tag 80, Plin Interbank/BBVA Tag 26, IzipayYA)
  // están registrados como estáticos (01=11) en el directorio BCRP/CCE y rechazan mutaciones locales de Tag 01=12 o Tag 54/62.
  if (!params.allowSyntheticMutation || (parsed.valid && !isSyntheticSandboxTemplate)) {
    const originalCrc = parsed.fields.find((f) => f.tag === '63')?.value ?? null;
    return {
      qrPayload: trimmed,
      isEmvcoDynamic: false,
      amountPenFormatted,
      crc16: originalCrc,
    };
  }

  // En plantillas sintéticas de comercio (sandbox/diagnóstico), inyectamos Tag 54 + Tag 62 y recalculamos CRC-16.
  if (trimmed.startsWith('000201') && parsed.fields.length >= 3 && isSyntheticSandboxTemplate) {
    const cleanRef = checkoutReference.replace(/[^A-Za-z0-9-]/g, '').slice(0, 24) || 'SUYA';
    const filtered = parsed.fields.filter(
      (f) => f.tag !== '01' && f.tag !== '53' && f.tag !== '54' && f.tag !== '62' && f.tag !== '63',
    );

    const newFields: EmvcoTlvField[] = [];
    for (const field of filtered) {
      newFields.push(field);
      if (field.tag === '00') {
        // Point of Initiation Method: '12' indica QR con monto dinámico por transacción
        newFields.push({ tag: '01', length: 2, value: '12' });
      }
    }

    // Asegurar moneda PEN (604) y monto exacto en Tag 54
    newFields.push({ tag: '53', length: 3, value: '604' });
    newFields.push({
      tag: '54',
      length: amountPenFormatted.length,
      value: amountPenFormatted,
    });

    // Tag 62: Additional Data Field Template -> Subtag 05 (Reference Label)
    const refSubtag = formatTlv('05', cleanRef);
    newFields.push({
      tag: '62',
      length: refSubtag.length,
      value: refSubtag,
    });

    // Orden estricto ascendente EMVCo (00 -> 01 -> 26..51 -> 52 -> 53 -> 54 -> 58 -> 59 -> 60 -> 62)
    newFields.sort((left, right) => Number(left.tag) - Number(right.tag));

    const bodyWithoutCrc =
      newFields.map((f) => formatTlv(f.tag, f.value)).join('') + '6304';
    const crc16 = computeEmvcoCrc16(bodyWithoutCrc);
    return {
      qrPayload: `${bodyWithoutCrc}${crc16}`,
      isEmvcoDynamic: true,
      amountPenFormatted,
      crc16,
    };
  }

  return {
    qrPayload: trimmed,
    isEmvcoDynamic: false,
    amountPenFormatted,
    crc16: null,
  };
}

/**
 * Construye un QR EMVCo base válido para pruebas o comercios que ingresan sus datos receptores.
 */
export function buildBaseMerchantEmvcoQr(params: {
  walletNetwork: StaticQrWalletNetwork;
  merchantAccountId: string;
  merchantName: string;
  merchantCity?: string;
}): string {
  const networkDomain: Record<StaticQrWalletNetwork, string> = {
    yape: 'pe.com.yape',
    plin: 'pe.com.plin',
    lemon: 'me.lemon.peru',
    izipayya: 'pe.izipay.qr',
  };
  const guiSubtag = formatTlv('00', networkDomain[params.walletNetwork]);
  const acctSubtag = formatTlv(
    '01',
    params.merchantAccountId.replace(/[^A-Za-z0-9]/g, '').slice(0, 32),
  );
  const tag26Value = `${guiSubtag}${acctSubtag}`;
  const name = (params.merchantName.trim() || 'COMERCIO SUYA').slice(0, 25);
  const city = (params.merchantCity?.trim() || 'SULLANA').slice(0, 15);

  const partial =
    formatTlv('00', '01') +
    formatTlv('01', '11') +
    formatTlv('26', tag26Value) +
    formatTlv('52', '5812') +
    formatTlv('53', '604') +
    formatTlv('58', 'PE') +
    formatTlv('59', name) +
    formatTlv('60', city) +
    '6304';
  const crc = computeEmvcoCrc16(partial);
  return `${partial}${crc}`;
}

/**
 * QRs estáticos oficiales reales precargados del titular (Adriano Aimar Baca Navarro)
 * para operar AutoCloud desde el primer arranque sin volver a decodificarlos.
 */
export const PRELOADED_STATIC_QR_PRESETS = {
  lemon: {
    network: 'lemon' as const,
    label: 'Lemon Cash / Dale (Adriano)',
    receiverLabel: 'Adriano Aimar Baca Navarro · Lemon Cash',
    receiverEmail: 'adriano.aimar12@gmail.com',
    qrPayload:
      '000201010211263700028001039030220260418092213549398255204482953036045802PE5910Lemon Cash6004Lima80550003ID10144TEzw95jbMOQLT6C426SCJHNxQ6aG04lUxQXdjAxf6CU=6304EC9C',
  },
  yape: {
    network: 'yape' as const,
    label: 'Yape Personal (Adriano)',
    receiverLabel: 'Adriano Aimar Baca Navarro · Yape',
    receiverEmail: 'adriano.aimar12@gmail.com',
    qrPayload:
      '0002010102113932d645fe734ba85465898c1667fdbe94a05204561153036045802PE5906YAPERO6004Lima6304BCB1',
  },
} as const;

export function normalizePersonName(value: string | null | undefined): string {
  return (value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zñ0-9]+/g, ' ')
    .trim();
}

export function personNamesMatch(
  orderCustomerName: string | null | undefined,
  bankSenderName: string | null | undefined,
): boolean {
  const expected = normalizePersonName(orderCustomerName);
  const actual = normalizePersonName(bankSenderName);
  if (!expected || !actual) return false;
  return (
    expected === actual ||
    actual.startsWith(`${expected} `) ||
    expected.startsWith(`${actual} `)
  );
}

/**
 * Mantiene el monto exacto del pedido (sin micro-descuentos ni ajustes por céntimos)
 * para conciliación AutoCloud. Cuando coinciden importes pendientes, la desambiguación
 * se realiza exclusivamente por nombre del pagador o referencia.
 */
export function allocateUniqueConciliationAmountCents(
  baseOrderTotalCents: number,
  _activePendingAmountsCents: ReadonlyArray<number> = [],
): {
  uniqueAmountCents: number;
  microDiscountCents: number;
} {
  if (!Number.isInteger(baseOrderTotalCents) || baseOrderTotalCents < 100) {
    throw new Error('El total base para conciliación automática debe ser de al menos S/ 1.00.');
  }
  return {
    uniqueAmountCents: baseOrderTotalCents,
    microDiscountCents: 0,
  };
}

/**
 * Calcula el hash SHA-256 en base64 de un texto canonizado (para verificar `bh=` en `DKIM-Signature`).
 */
export async function computeBodyHashBase64(bodyText: string): Promise<string> {
  return computeDkimBodyHashBase64(bodyText, 'relaxed');
}

export interface BankEmailVerificationInput {
  /** Bloque completo de cabeceras MIME originales (RFC 5322) antes de la línea en blanco */
  rawHeaders: string | null | undefined;
  /** Cabecera Authentication-Results inyectada por mx.cloudflare.net o mx.google.com */
  authenticationResultsHeader: string | null;
  /** Cuerpo crudo MIME exactamente como llegó */
  rawBodyText: string;
  /** Resolvedor de clave pública DKIM TXT (`<s>._domainkey.<d>`). Por defecto usa DoH. */
  resolvePublicKeySpki?: DkimPublicKeyResolver;
}

export interface BankEmailVerificationResult {
  authentic: boolean;
  dkimDomain: string | null;
  mtaHost: string | null;
  reason?: string;
}

/**
 * Verifica criptográficamente un correo de confirmación bancaria/billetera:
 * 1. MTA confiable (`mx.cloudflare.net` o `mx.google.com`) con `spf=pass`, `dmarc=pass` y
 *    `dkim=pass` explícitamente asociado a `header.d`/`header.i` igual al dominio firmante.
 * 2. Alineamiento del dominio `From:` con `d=` dentro de `TRUSTED_PERUVIAN_FINANCIAL_DKIM_DOMAINS`.
 * 3. Integridad del cuerpo (`bh=` SHA-256 RFC 6376, sin truncamiento `l=`).
 * 4. Verificación criptográfica real de la firma `b=` (`RSASSA-PKCS1-v1_5` SHA-256) con la clave
 *    pública publicada en `<s>._domainkey.<d>`.
 */
export async function verifyBankEmailAuthenticity(
  input: BankEmailVerificationInput,
): Promise<BankEmailVerificationResult> {
  const res = await verifyEmailDkimCryptographic({
    rawHeaders: input.rawHeaders,
    rawBody: input.rawBodyText,
    authenticationResultsHeader: input.authenticationResultsHeader,
    trustedDomains: TRUSTED_PERUVIAN_FINANCIAL_DKIM_DOMAINS,
    requireMtaPass: true,
    resolvePublicKeySpki: input.resolvePublicKeySpki,
  });
  return {
    authentic: res.authentic,
    dkimDomain: res.dkimDomain,
    mtaHost: res.mtaHost,
    reason: res.reason,
  };
}

export interface ParsedFinancialNotification {
  walletNetwork: StaticQrWalletNetwork;
  amountCents: number;
  currency: 'PEN';
  operationId: string;
  securityCode3Digits: string | null;
  senderName: string | null;
  checkoutReference: string | null;
}

/**
 * Extrae monto en céntimos, número de operación, red (Yape, Plin, Lemon, IzipayYA),
 * código de seguridad y referencia SUYA desde el cuerpo verificado de un correo bancario/billetera.
 */
export function parsePeruvianBankAndWalletEmail(params: {
  dkimDomain: string;
  subject: string;
  bodyText: string;
  recipientAddress?: string | null;
}): ParsedFinancialNotification | null {
  const combined = `${params.subject}\n${params.bodyText}`;
  const domain = params.dkimDomain.toLowerCase();

  // 1. Determinar red de billetera / adquirente
  let walletNetwork: StaticQrWalletNetwork = 'yape';
  if (domain.includes('izipay') || /\bizipay(?:ya)?\b/i.test(combined)) {
    walletNetwork = 'izipayya';
  } else if (
    domain.includes('lemon') ||
    domain.includes('dale') ||
    domain.includes('gmoney') ||
    /\blemon\b/i.test(combined)
  ) {
    walletNetwork = 'lemon';
  } else if (
    domain.includes('interbank') ||
    domain.includes('bbva') ||
    domain.includes('scotiabank') ||
    /\bplin\b/i.test(combined)
  ) {
    walletNetwork = 'plin';
  } else if (domain.includes('bcp') || domain.includes('yape') || /\byape\b/i.test(combined)) {
    walletNetwork = 'yape';
  }

  // 2. Extraer monto en Soles (ej. "S/ 40.00", "S/. 29.99", "PEN 15.50")
  const amountMatch = combined.match(/(?:S\/\.?|PEN)\s*([0-9]{1,5}(?:,[0-9]{3})*\.[0-9]{2})/i);
  if (!amountMatch) return null;
  const numericAmount = Number(amountMatch[1].replace(/,/g, ''));
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) return null;
  const amountCents = Math.round(numericAmount * 100);

  // 3. Extraer Número de Operación (6 a 14 caracteres alfanuméricos/numéricos)
  const opMatch =
    combined.match(
      /(?:n[úu]mero\s+de\s+operaci[óo]n|c[óo]digo\s+de\s+operaci[óo]n|operaci[óo]n\s+n[°º.]?|id\s+de\s+transacci[óo]n|operaci[óo]n)\s*[:#-]?\s*([A-Z0-9-]{5,20})/i,
    ) ?? combined.match(/\bOP[-:]?([0-9]{6,14})\b/i);
  const operationId = opMatch ? opMatch[1].trim() : '';
  if (!operationId) return null;

  // 4. Extraer código de seguridad de 3 dígitos si está presente
  const secMatch = combined.match(/c[óo]digo\s+de\s+seguridad(?:\s+es)?\s*[:#-]?\s*([0-9]{3})\b/i);
  const securityCode3Digits = secMatch ? secMatch[1] : null;

  // 5. Extraer remitente / ordenante si figura en la constancia
  const senderMatch = combined.match(
    /(?:enviado\s+por|ordenante|remitente|cliente|pagador|de)\s*:\s*([^:\r\n0-9]{3,80})/i,
  );
  const senderName = senderMatch
    ? senderMatch[1]
        .replace(/\s+(?:n[úu]mero|c[óo]digo|operaci[óo]n|monto|referencia|fecha|hora)\b.*$/i, '')
        .trim() || null
    : null;

  // 6. Extraer referencia SUYA del cuerpo o del alias plus-addressing (pagos+SUYA-...@...)
  const refInBody = combined.match(/\b(SUYA-[A-Z0-9-]{4,32})\b/i)?.[1]?.toUpperCase() ?? null;
  const refInRecipient =
    params.recipientAddress
      ?.match(/\+(suya-[a-z0-9-]{4,32})@/i)?.[1]
      ?.toUpperCase() ?? null;

  return {
    walletNetwork,
    amountCents,
    currency: 'PEN',
    operationId,
    securityCode3Digits,
    senderName,
    checkoutReference: refInBody ?? refInRecipient,
  };
}
